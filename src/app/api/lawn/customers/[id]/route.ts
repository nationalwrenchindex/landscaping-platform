import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CUSTOMER_SELECT = `
  id, user_id, full_name, email, phone, address, city, state, zip, notes,
  created_at, updated_at,
  properties:properties(*)
`

// ─── GET /api/lawn/customers/[id] ─────────────────────────────────────────────
// Returns the customer, their properties, and their service history.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer, error } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
  }

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_date, scheduled_time, completion_notes, completed_at, property_id')
    .eq('user_id', user.id)
    .eq('customer_id', id)
    .order('scheduled_date', { ascending: false })
    .limit(50)

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, due_date, paid_at, invoice_date')
    .eq('user_id', user.id)
    .eq('customer_id', id)
    .order('invoice_date', { ascending: false })
    .limit(50)

  return NextResponse.json({ customer, jobs: jobs ?? [], invoices: invoices ?? [] })
}

// ─── PATCH /api/lawn/customers/[id] ───────────────────────────────────────────
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
  for (const key of ['full_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'notes']) {
    if (key in body) {
      const value = typeof body[key] === 'string' ? (body[key] as string).trim() : body[key]
      patch[key] = value === '' ? null : value
    }
  }

  if ('full_name' in patch && !patch.full_name) {
    return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })
  }
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email as string)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(CUSTOMER_SELECT)
    .single()

  if (error || !data) {
    console.error('[PATCH /api/lawn/customers/[id]]', error)
    return NextResponse.json({ error: 'Could not update the customer.' }, { status: 500 })
  }

  return NextResponse.json({ customer: data })
}

// ─── DELETE /api/lawn/customers/[id] ──────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/customers/[id]]', error)
    return NextResponse.json({ error: 'Could not delete the customer.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
