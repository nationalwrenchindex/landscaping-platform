import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeLineItems } from '@/lib/lawn/invoice-utils'

const RECURRING_SELECT = `
  *,
  customer:customers(id, full_name, email),
  property:properties(id, name, address)
`

// ─── PATCH /api/lawn/recurring-invoices/[id] ──────────────────────────────────
// Used for pause/resume, edits, and end-dating a template.
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

  if ('active'    in body) patch.active    = Boolean(body.active)
  if ('auto_send' in body) patch.auto_send = Boolean(body.auto_send)

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
    patch.title = title
  }

  if ('notes' in body) {
    const n = typeof body.notes === 'string' ? body.notes.trim() : null
    patch.notes = n || null
  }

  if ('tax_percent' in body) {
    const taxPercent = Number(body.tax_percent) || 0
    if (taxPercent < 0 || taxPercent > 100) {
      return NextResponse.json({ error: 'Tax percent must be between 0 and 100.' }, { status: 400 })
    }
    patch.tax_percent = taxPercent
  }

  if ('end_date' in body) {
    const d = body.end_date as string | null
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'End date must be a valid date.' }, { status: 400 })
    }
    patch.end_date = d || null
  }

  if (Array.isArray(body.line_items)) {
    const items = normalizeLineItems(body.line_items)
    if (items.length === 0) {
      return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })
    }
    patch.line_items = items
  }

  const { data, error } = await supabase
    .from('recurring_invoices')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(RECURRING_SELECT)
    .single()

  if (error || !data) {
    console.error('[PATCH /api/lawn/recurring-invoices/[id]]', error)
    return NextResponse.json({ error: 'Could not update the recurring invoice.' }, { status: 500 })
  }

  return NextResponse.json({ recurring: data })
}

// ─── DELETE /api/lawn/recurring-invoices/[id] ─────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('recurring_invoices').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/recurring-invoices/[id]]', error)
    return NextResponse.json({ error: 'Could not cancel the recurring invoice.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
