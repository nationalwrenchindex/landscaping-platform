import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  INVOICE_SELECT,
  VALID_INVOICE_STATUSES,
  normalizeLineItems,
  computeTotals,
} from '@/lib/lawn/invoice-utils'

// ─── GET /api/lawn/invoices?status= ───────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')

  let query = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })
    .order('created_at',   { ascending: false })

  if (status && (VALID_INVOICE_STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/lawn/invoices]', error)
    return NextResponse.json({ error: 'Could not load invoices.' }, { status: 500 })
  }

  return NextResponse.json({ invoices: data ?? [] })
}

// ─── POST /api/lawn/invoices ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id : ''
  if (!customerId) return NextResponse.json({ error: 'A customer is required.' }, { status: 400 })

  const items = normalizeLineItems(body.line_items)
  if (items.length === 0) {
    return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })
  }

  const taxPercent = Number(body.tax_percent) || 0
  if (taxPercent < 0 || taxPercent > 100) {
    return NextResponse.json({ error: 'Tax percent must be between 0 and 100.' }, { status: 400 })
  }

  const dueDate = typeof body.due_date === 'string' && body.due_date ? body.due_date : null
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: 'Due date must be a valid date.' }, { status: 400 })
  }

  const { subtotal, taxAmount, total } = computeTotals(items, taxPercent)

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      user_id:     user.id,
      customer_id: customerId,
      property_id: (body.property_id as string) || null,
      job_id:      (body.job_id      as string) || null,
      status:      'draft',
      subtotal,
      tax_percent: taxPercent,
      tax_amount:  taxAmount,
      total,
      notes:       (body.notes as string) || null,
      due_date:    dueDate,
      // jsonb mirror keeps the pre-existing invoice views working
      line_items:  items,
    })
    .select('id')
    .single()

  if (error || !invoice) {
    console.error('[POST /api/lawn/invoices]', error)
    return NextResponse.json({ error: 'Could not create the invoice.' }, { status: 500 })
  }

  const { error: itemsErr } = await supabase
    .from('invoice_line_items')
    .insert(items.map((l, i) => ({ ...l, invoice_id: invoice.id, user_id: user.id, position: i })))
  if (itemsErr) console.error('[POST /api/lawn/invoices] line items', itemsErr)

  const { data: full } = await supabase
    .from('invoices').select(INVOICE_SELECT).eq('id', invoice.id).eq('user_id', user.id).single()

  return NextResponse.json({ invoice: full }, { status: 201 })
}
