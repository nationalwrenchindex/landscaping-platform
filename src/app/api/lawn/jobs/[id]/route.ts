import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const JOB_SELECT = `
  id, user_id, customer_id, property_id, title, description, status,
  scheduled_date, scheduled_time, duration_minutes, crew_notes,
  completion_notes, completed_at, created_at, updated_at,
  customer:customers(id, full_name, phone, email),
  property:properties(id, name, address, gate_code, dog_on_property),
  services:job_services(id, job_id, service_name, quantity, unit_price, total)
`

const VALID_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled']

function round2(n: number) { return Math.round(n * 100) / 100 }

// ─── GET /api/lawn/jobs/[id] ──────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('jobs').select(JOB_SELECT).eq('id', id).eq('user_id', user.id).single()

  if (error || !data) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  return NextResponse.json({ job: data })
}

// ─── PATCH /api/lawn/jobs/[id] ────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  for (const key of ['title', 'description', 'crew_notes', 'completion_notes',
                     'scheduled_time', 'customer_id', 'property_id']) {
    if (key in body) {
      const value = typeof body[key] === 'string' ? (body[key] as string).trim() : body[key]
      patch[key] = value === '' ? null : value
    }
  }

  if ('title' in patch && !patch.title) {
    return NextResponse.json({ error: 'A job title is required.' }, { status: 400 })
  }

  if ('scheduled_date' in body) {
    const d = body.scheduled_date as string
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'Scheduled date must be a valid date.' }, { status: 400 })
    }
    patch.scheduled_date = d
  }

  if ('duration_minutes' in body) {
    const raw = body.duration_minutes
    if (raw === '' || raw == null) {
      patch.duration_minutes = null
    } else {
      const num = Number(raw)
      if (!Number.isFinite(num) || num <= 0) {
        return NextResponse.json({ error: 'Duration must be a positive number of minutes.' }, { status: 400 })
      }
      patch.duration_minutes = num
    }
  }

  if ('status' in body) {
    const status = body.status as string
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Unknown job status.' }, { status: 400 })
    }
    patch.status = status
    // The DB trigger stamps completed_at; clear it when a job leaves completed.
    if (status !== 'completed') patch.completed_at = null
  }

  const { error } = await supabase
    .from('jobs').update(patch).eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[PATCH /api/lawn/jobs/[id]]', error)
    return NextResponse.json({ error: 'Could not update the job.' }, { status: 500 })
  }

  // Services are replaced wholesale when the client sends them
  if (Array.isArray(body.services)) {
    await supabase.from('job_services').delete().eq('job_id', id).eq('user_id', user.id)
    const rows = (body.services as Record<string, unknown>[])
      .map(s => {
        const quantity  = Number(s.quantity)   || 0
        const unitPrice = Number(s.unit_price) || 0
        return {
          job_id:       id,
          user_id:      user.id,
          service_name: typeof s.service_name === 'string' ? s.service_name.trim() : '',
          quantity,
          unit_price:   unitPrice,
          total:        round2(quantity * unitPrice),
        }
      })
      .filter(s => s.service_name.length > 0)
    if (rows.length > 0) await supabase.from('job_services').insert(rows)
  }

  const { data: full } = await supabase
    .from('jobs').select(JOB_SELECT).eq('id', id).eq('user_id', user.id).single()

  return NextResponse.json({ job: full })
}

// ─── DELETE /api/lawn/jobs/[id] ───────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('jobs').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/jobs/[id]]', error)
    return NextResponse.json({ error: 'Could not delete the job.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
