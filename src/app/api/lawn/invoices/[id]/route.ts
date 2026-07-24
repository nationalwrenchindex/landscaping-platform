import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  INVOICE_SELECT,
  VALID_INVOICE_STATUSES,
  normalizeLineItems,
  computeTotals,
} from '@/lib/lawn/invoice-utils'
import { sendReviewRequest } from '@/lib/landscaping/review-requests'

// ─── GET /api/lawn/invoices/[id] ──────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices').select(INVOICE_SELECT).eq('id', id).eq('user_id', user.id).single()

  if (error || !data) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  return NextResponse.json({ invoice: data })
}

// ─── PATCH /api/lawn/invoices/[id] ────────────────────────────────────────────
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

  const { data: existing } = await supabase
    .from('invoices').select('id, tax_percent, status').eq('id', id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  if ('notes' in body) {
    const n = typeof body.notes === 'string' ? body.notes.trim() : null
    patch.notes = n || null
  }

  if ('property_id' in body) patch.property_id = (body.property_id as string) || null

  if ('due_date' in body) {
    const d = body.due_date as string | null
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'Due date must be a valid date.' }, { status: 400 })
    }
    patch.due_date = d || null
  }

  if ('status' in body) {
    const status = body.status as string
    if (!(VALID_INVOICE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown invoice status.' }, { status: 400 })
    }
    patch.status = status
    if (status === 'paid') {
      patch.paid_at = new Date().toISOString()
    } else {
      patch.paid_at = null
    }
  }

  // Recompute money whenever line items or the tax rate change
  const taxChanged   = 'tax_percent' in body
  const itemsChanged = Array.isArray(body.line_items)

  let taxPercent = Number(existing.tax_percent) || 0
  if (taxChanged) {
    taxPercent = Number(body.tax_percent) || 0
    if (taxPercent < 0 || taxPercent > 100) {
      return NextResponse.json({ error: 'Tax percent must be between 0 and 100.' }, { status: 400 })
    }
    patch.tax_percent = taxPercent
  }

  if (itemsChanged) {
    const items = normalizeLineItems(body.line_items)
    if (items.length === 0) {
      return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })
    }
    const totals = computeTotals(items, taxPercent)
    patch.subtotal   = totals.subtotal
    patch.tax_amount = totals.taxAmount
    patch.total      = totals.total
    patch.line_items = items

    await supabase.from('invoice_line_items').delete().eq('invoice_id', id).eq('user_id', user.id)
    await supabase.from('invoice_line_items')
      .insert(items.map((l, i) => ({ ...l, invoice_id: id, user_id: user.id, position: i })))
  } else if (taxChanged) {
    const { data: rows } = await supabase
      .from('invoice_line_items').select('total').eq('invoice_id', id).eq('user_id', user.id)
    const items  = (rows ?? []).map(r => ({
      description: '', quantity: 1, unit_price: Number(r.total) || 0, total: Number(r.total) || 0,
    }))
    const totals = computeTotals(items, taxPercent)
    patch.subtotal   = totals.subtotal
    patch.tax_amount = totals.taxAmount
    patch.total      = totals.total
  }

  const { error } = await supabase
    .from('invoices').update(patch).eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[PATCH /api/lawn/invoices/[id]]', error)
    return NextResponse.json({ error: 'Could not update the invoice.' }, { status: 500 })
  }

  // When an invoice first flips to paid, fire the automated Google review text.
  // sendReviewRequest never throws and is duplicate-safe, so awaiting it here
  // guarantees completion without risking the payment status update.
  if (patch.status === 'paid' && existing.status !== 'paid') {
    await sendReviewRequest(id)
  }

  const { data: full } = await supabase
    .from('invoices').select(INVOICE_SELECT).eq('id', id).eq('user_id', user.id).single()

  return NextResponse.json({ invoice: full })
}

// ─── DELETE /api/lawn/invoices/[id] ───────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('invoices').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/invoices/[id]]', error)
    return NextResponse.json({ error: 'Could not delete the invoice.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
