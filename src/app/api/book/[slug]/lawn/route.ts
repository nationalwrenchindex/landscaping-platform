import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendBookingConfirmation } from '@/lib/landscaping/booking-email'

type RouteContext = { params: Promise<{ slug: string }> }

const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fmtDate = (s: string): string =>
  new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

// Sends a booking-alert SMS to the landscaper using the platform's Twilio
// number (TWILIO_PHONE_NUMBER). Never throws — a failed text must not fail the
// booking. Kept local so the public booking flow doesn't depend on the
// subscriber Messaging-Service sender.
async function notifyTechBySms(to: string, body: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    console.warn('[book/lawn] Twilio not fully configured — skipping tech SMS')
    return
  }

  const digits = to.replace(/\D/g, '')
  const e164   = digits.startsWith('1') ? `+${digits}` : `+1${digits}`

  try {
    const basicAuth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
      },
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; code?: number }
      console.error('[book/lawn] Twilio error (HTTP', res.status, 'code', data.code, '):', data.message)
    }
  } catch (err) {
    console.error('[book/lawn] SMS fetch error:', err instanceof Error ? err.message : String(err))
  }
}

// ─── POST /api/book/[slug]/lawn ───────────────────────────────────────────────
// Public landscaping booking submission — no auth. Creates (or reuses) the
// customer + property, files a pending job, emails the customer and texts the
// landscaper.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name, full_name, phone')
    .eq('slug', slug)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'This booking page could not be found.' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const name    = typeof body.name    === 'string' ? body.name.trim()    : ''
  const email   = typeof body.email   === 'string' ? body.email.trim()   : ''
  const phone   = typeof body.phone   === 'string' ? body.phone.trim()   : ''
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const service = typeof body.service === 'string' ? body.service.trim() : ''
  const date    = typeof body.preferred_date === 'string' ? body.preferred_date : ''
  const notes   = typeof body.notes   === 'string' ? body.notes.trim()   : ''

  if (!name)               return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!phone || phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  if (!address)            return NextResponse.json({ error: 'Please enter your property address.' }, { status: 400 })
  if (!service)            return NextResponse.json({ error: 'Please choose a service.' }, { status: 400 })
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: 'Please choose a preferred date.' }, { status: 400 })

  const techId = profile.id as string

  // ── Find or create the customer by email ──
  let customerId: string
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', techId)
    .ilike('email', email)
    .limit(1)

  if (existingCustomers && existingCustomers.length > 0) {
    customerId = existingCustomers[0].id as string
    // Backfill a phone number if we didn't have one on file.
    await supabase.from('customers').update({ phone }).eq('id', customerId).is('phone', null)
  } else {
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({ user_id: techId, full_name: name, email, phone, address })
      .select('id')
      .single()
    if (custErr || !newCustomer) {
      console.error('[book/lawn] customer insert error:', custErr)
      return NextResponse.json({ error: 'Could not save your details. Please try again.' }, { status: 500 })
    }
    customerId = newCustomer.id as string
  }

  // ── Find or create the property for this address ──
  let propertyId: string | null = null
  const { data: existingProps } = await supabase
    .from('properties')
    .select('id')
    .eq('user_id', techId)
    .eq('customer_id', customerId)
    .ilike('address', address)
    .limit(1)

  if (existingProps && existingProps.length > 0) {
    propertyId = existingProps[0].id as string
  } else {
    const { data: newProp } = await supabase
      .from('properties')
      .insert({ user_id: techId, customer_id: customerId, address, name: address })
      .select('id')
      .single()
    propertyId = newProp?.id ?? null
  }

  // ── File the pending job ──
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      user_id:        techId,
      customer_id:    customerId,
      property_id:    propertyId,
      title:          service,
      status:         'pending',
      scheduled_date: date,
      description:    notes || null,
      crew_notes:     'Booked online via booking page.',
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    console.error('[book/lawn] job insert error:', jobErr)
    return NextResponse.json({ error: 'Could not submit your booking. Please try again.' }, { status: 500 })
  }

  const businessName = (profile.business_name as string) || (profile.full_name as string) || 'Your Landscaper'

  // ── Confirmation email to the customer (fire-and-forget) ──
  void sendBookingConfirmation(email, {
    businessName,
    businessPhone: (profile.phone as string | null) ?? null,
    customerName:  name,
    service,
    preferredDate: date,
    address,
    notes:         notes || null,
  }).catch(err => console.error('[book/lawn] email error:', err))

  // ── SMS alert to the landscaper (fire-and-forget) ──
  const techPhone = profile.phone as string | null
  if (techPhone && techPhone.replace(/\D/g, '').length >= 10) {
    const smsBody = `New booking request from ${name} for ${service} on ${fmtDate(date)} at ${address}`
    void notifyTechBySms(techPhone, smsBody).catch(err => console.error('[book/lawn] sms error:', err))
  }

  return NextResponse.json({ success: true, job_id: job.id }, { status: 201 })
}
