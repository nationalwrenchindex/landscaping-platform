import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSmsResult } from '@/lib/twilio'

// GET — list chemical application logs for a job.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: logs, error } = await supabase
    .from('lawn_chemical_logs')
    .select('id, product_name, product_epa_number, application_rate, target_area, target_pest_or_weed, application_date, re_entry_interval_hours, notes, created_at')
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .order('application_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: logs ?? [] })
}

// POST — record a chemical application and text the customer a re-entry notice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the job is the user's and grab the customer for the SMS.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, customer:customers(first_name, phone)')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: {
    product_name?: string
    product_epa_number?: string
    application_rate?: string
    target_area?: string
    target_pest_or_weed?: string
    application_date?: string
    re_entry_interval_hours?: number | string
    notes?: string
    notify_customer?: boolean
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.product_name?.trim()) return NextResponse.json({ error: 'Product name is required' }, { status: 400 })

  const reEntryHours = body.re_entry_interval_hours === '' || body.re_entry_interval_hours == null
    ? null
    : Number(body.re_entry_interval_hours)

  const { data: log, error } = await supabase
    .from('lawn_chemical_logs')
    .insert({
      job_id:                  jobId,
      user_id:                 user.id,
      applied_by:              user.id,
      product_name:            body.product_name.trim(),
      product_epa_number:      body.product_epa_number?.trim() || null,
      application_rate:        body.application_rate?.trim() || null,
      target_area:             body.target_area?.trim() || null,
      target_pest_or_weed:     body.target_pest_or_weed?.trim() || null,
      application_date:        body.application_date || new Date().toISOString().slice(0, 10),
      re_entry_interval_hours: reEntryHours,
      notes:                   body.notes?.trim() || null,
    })
    .select('id, product_name, product_epa_number, application_rate, target_area, target_pest_or_weed, application_date, re_entry_interval_hours, notes, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto re-entry SMS to the customer (best-effort — never blocks the save).
  let sms: { success: boolean; error?: string } | null = null
  const customer = (job as unknown as { customer?: { first_name?: string; phone?: string } | null }).customer
  if (body.notify_customer !== false && customer?.phone && reEntryHours) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', user.id)
      .single()
    const biz  = (profile?.business_name as string) || 'your lawn care team'
    const name = customer.first_name || 'there'
    sms = await sendSmsResult({
      to: customer.phone,
      body: `Hi ${name}, we applied ${log.product_name} to your property today. Please keep people and pets off the treated area for ${reEntryHours} hours. Thank you — ${biz}`,
    })
  }

  return NextResponse.json({ log, sms })
}

// DELETE — remove a chemical log.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const logId = new URL(req.url).searchParams.get('logId')
  if (!logId) return NextResponse.json({ error: 'Missing logId' }, { status: 400 })

  const { error } = await supabase
    .from('lawn_chemical_logs')
    .delete()
    .eq('id', logId)
    .eq('job_id', jobId)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
