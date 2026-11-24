// GET  /api/user/profile — returns fuel-tracking, MPI, and pricing default profile fields
// PUT  /api/user/profile — updates average_mpg, fuel_type, offer_mpi_on_booking, and/or pricing defaults

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('average_mpg, fuel_type, offer_mpi_on_booking, default_labor_rate, default_parts_markup_percent, default_tax_percent, google_review_url')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    average_mpg:                   data?.average_mpg                   ?? null,
    fuel_type:                     data?.fuel_type                     ?? 'gasoline',
    offer_mpi_on_booking:          data?.offer_mpi_on_booking          ?? false,
    default_labor_rate:            data?.default_labor_rate            ?? 125,
    default_parts_markup_percent:  data?.default_parts_markup_percent  ?? 20,
    default_tax_percent:           data?.default_tax_percent           ?? 8.5,
    google_review_url:             data?.google_review_url             ?? null,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const update: Record<string, unknown> = {}

  if ('average_mpg' in body) {
    const raw = body.average_mpg
    if (raw === null || raw === '') {
      update.average_mpg = null
    } else {
      const n = Number(raw)
      if (isNaN(n) || n <= 0 || n > 200) {
        return NextResponse.json({ error: 'average_mpg must be a positive number ≤ 200' }, { status: 400 })
      }
      update.average_mpg = Math.round(n * 100) / 100
    }
  }

  if ('fuel_type' in body) {
    const ft = String(body.fuel_type ?? 'gasoline')
    if (!['gasoline', 'diesel'].includes(ft)) {
      return NextResponse.json({ error: 'fuel_type must be gasoline or diesel' }, { status: 400 })
    }
    update.fuel_type = ft
  }

  if ('offer_mpi_on_booking' in body) {
    update.offer_mpi_on_booking = !!body.offer_mpi_on_booking
  }

  if ('default_labor_rate' in body) {
    const n = Number(body.default_labor_rate)
    if (isNaN(n) || n < 0 || n > 9999) {
      return NextResponse.json({ error: 'default_labor_rate must be 0–9999' }, { status: 400 })
    }
    update.default_labor_rate = Math.round(n * 100) / 100
  }

  if ('default_parts_markup_percent' in body) {
    const n = Number(body.default_parts_markup_percent)
    if (isNaN(n) || n < 0 || n > 999) {
      return NextResponse.json({ error: 'default_parts_markup_percent must be 0–999' }, { status: 400 })
    }
    update.default_parts_markup_percent = Math.round(n * 100) / 100
  }

  if ('default_tax_percent' in body) {
    const n = Number(body.default_tax_percent)
    if (isNaN(n) || n < 0 || n > 99) {
      return NextResponse.json({ error: 'default_tax_percent must be 0–99' }, { status: 400 })
    }
    update.default_tax_percent = Math.round(n * 100) / 100
  }

  if ('phone' in body) {
    const raw = body.phone
    update.phone = (typeof raw === 'string' && raw.trim()) ? raw.trim() : null
  }

  if ('sms_booking_notifications_enabled' in body) {
    update.sms_booking_notifications_enabled = !!body.sms_booking_notifications_enabled
  }

  if ('bill_consumables_separately' in body) {
    update.bill_consumables_separately = !!body.bill_consumables_separately
  }

  // Google review link used by the landscaping review request
  // (lib/landscaping/review-requests.ts). Empty clears it.
  if ('google_review_url' in body) {
    const raw = typeof body.google_review_url === 'string' ? body.google_review_url.trim() : ''
    if (!raw) {
      update.google_review_url = null
    } else {
      const checked = validateGoogleReviewUrl(raw)
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
      update.google_review_url = checked.url
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// The link is texted to the business's customers, so only accept https links on
// Google's own review / maps / short-link hosts.
const GOOGLE_REVIEW_HOSTS = new Set([
  'g.page',
  'search.google.com',
  'www.google.com',
  'google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
])

function validateGoogleReviewUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  if (raw.length > 500) return { ok: false, error: 'Google review link is too long.' }
  let u: URL
  try { u = new URL(raw) } catch { return { ok: false, error: 'Enter a full link starting with https://' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'Google review link must start with https://' }
  const host = u.hostname.toLowerCase()
  if (!GOOGLE_REVIEW_HOSTS.has(host)) {
    return { ok: false, error: 'That does not look like a Google review link (g.page, search.google.com, google.com/maps or maps.app.goo.gl).' }
  }
  if (host === 'goo.gl' && !u.pathname.startsWith('/maps')) {
    return { ok: false, error: 'Only goo.gl/maps short links are accepted.' }
  }
  return { ok: true, url: u.toString() }
}
