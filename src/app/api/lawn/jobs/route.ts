import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { JobService } from '@/types/lawn'

const JOB_SELECT = `
  id, user_id, customer_id, property_id, title, description, status,
  scheduled_date, scheduled_time, duration_minutes, crew_notes,
  completion_notes, completed_at, created_at, updated_at,
  customer:customers(id, full_name, phone, email),
  property:properties(id, name, address, gate_code, dog_on_property),
  services:job_services(id, job_id, service_name, quantity, unit_price, total)
`

function round2(n: number) { return Math.round(n * 100) / 100 }

/** Normalizes the client's service rows and drops blank ones. */
function normalizeServices(raw: unknown): JobService[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => {
      const s = r as Record<string, unknown>
      const quantity  = Number(s.quantity)   || 0
      const unitPrice = Number(s.unit_price) || 0
      return {
        service_name: typeof s.service_name === 'string' ? s.service_name.trim() : '',
        quantity,
        unit_price:   unitPrice,
        total:        round2(quantity * unitPrice),
      }
    })
    .filter(s => s.service_name.length > 0)
}

// ─── GET /api/lawn/jobs?from=&to=&status= ─────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp     = request.nextUrl.searchParams
  const from   = sp.get('from')
  const to     = sp.get('to')
  const status = sp.get('status')

  let query = supabase
    .from('jobs')
    .select(JOB_SELECT)
    .eq('user_id', user.id)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false })

  if (from)   query = query.gte('scheduled_date', from)
  if (to)     query = query.lte('scheduled_date', to)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/lawn/jobs]', error)
    return NextResponse.json({ error: 'Could not load the schedule.' }, { status: 500 })
  }

  return NextResponse.json({ jobs: data ?? [] })
}

// ─── POST /api/lawn/jobs ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const title         = typeof body.title === 'string' ? body.title.trim() : ''
  const scheduledDate = typeof body.scheduled_date === 'string' ? body.scheduled_date : ''

  if (!title)         return NextResponse.json({ error: 'A job title is required.' }, { status: 400 })
  if (!scheduledDate) return NextResponse.json({ error: 'A scheduled date is required.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return NextResponse.json({ error: 'Scheduled date must be a valid date.' }, { status: 400 })
  }

  const duration = body.duration_minutes === '' || body.duration_minutes == null
    ? null : Number(body.duration_minutes)
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    return NextResponse.json({ error: 'Duration must be a positive number of minutes.' }, { status: 400 })
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      user_id:          user.id,
      customer_id:      (body.customer_id as string) || null,
      property_id:      (body.property_id as string) || null,
      title,
      description:      (body.description as string) || null,
      status:           (body.status as string) || 'scheduled',
      scheduled_date:   scheduledDate,
      scheduled_time:   (body.scheduled_time as string) || null,
      duration_minutes: duration,
      crew_notes:       (body.crew_notes as string) || null,
    })
    .select('id')
    .single()

  if (error || !job) {
    console.error('[POST /api/lawn/jobs]', error)
    return NextResponse.json({ error: 'Could not schedule the job.' }, { status: 500 })
  }

  const services = normalizeServices(body.services)
  if (services.length > 0) {
    const { error: svcErr } = await supabase
      .from('job_services')
      .insert(services.map(s => ({ ...s, job_id: job.id, user_id: user.id })))
    if (svcErr) console.error('[POST /api/lawn/jobs] services', svcErr)
  }

  const { data: full } = await supabase
    .from('jobs').select(JOB_SELECT).eq('id', job.id).eq('user_id', user.id).single()

  return NextResponse.json({ job: full }, { status: 201 })
}
