import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeLineItems } from '@/lib/lawn/invoice-utils'
import { computeFirstInvoiceDate } from '@/lib/lawn/recurring'
import type { RecurringFrequency } from '@/types/lawn'

const RECURRING_SELECT = `
  *,
  customer:customers(id, full_name, email),
  property:properties(id, name, address)
`

const FREQUENCIES: RecurringFrequency[] =
  ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual']

// ─── GET /api/lawn/recurring-invoices ─────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('recurring_invoices')
    .select(RECURRING_SELECT)
    .eq('user_id', user.id)
    .order('active',            { ascending: false })
    .order('next_invoice_date', { ascending: true })

  if (error) {
    console.error('[GET /api/lawn/recurring-invoices]', error)
    return NextResponse.json({ error: 'Could not load recurring invoices.' }, { status: 500 })
  }

  return NextResponse.json({ recurring: data ?? [] })
}

// ─── POST /api/lawn/recurring-invoices ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const title      = typeof body.title === 'string' ? body.title.trim() : ''
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : ''
  const frequency  = body.frequency as RecurringFrequency

  if (!title)      return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
  if (!customerId) return NextResponse.json({ error: 'A customer is required.' }, { status: 400 })
  if (!FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Choose a valid frequency.' }, { status: 400 })
  }

  const items = normalizeLineItems(body.line_items)
  if (items.length === 0) {
    return NextResponse.json({ error: 'Add at least one line item.' }, { status: 400 })
  }

  const taxPercent = Number(body.tax_percent) || 0
  if (taxPercent < 0 || taxPercent > 100) {
    return NextResponse.json({ error: 'Tax percent must be between 0 and 100.' }, { status: 400 })
  }

  const startDate = typeof body.start_date === 'string' && body.start_date
    ? body.start_date
    : new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: 'Start date must be a valid date.' }, { status: 400 })
  }

  const endDate = typeof body.end_date === 'string' && body.end_date ? body.end_date : null
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: 'End date must fall after the start date.' }, { status: 400 })
  }

  const isWeekly   = frequency === 'weekly' || frequency === 'biweekly'
  const dayOfWeek  = isWeekly && body.day_of_week != null && body.day_of_week !== ''
    ? Number(body.day_of_week) : null
  const dayOfMonth = !isWeekly && body.day_of_month != null && body.day_of_month !== ''
    ? Number(body.day_of_month) : null

  if (dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json({ error: 'Choose a valid day of the week.' }, { status: 400 })
  }
  if (dayOfMonth !== null && (dayOfMonth < 1 || dayOfMonth > 31)) {
    return NextResponse.json({ error: 'Day of month must be between 1 and 31.' }, { status: 400 })
  }

  const nextDate = computeFirstInvoiceDate(startDate, frequency, dayOfWeek, dayOfMonth)

  const { data, error } = await supabase
    .from('recurring_invoices')
    .insert({
      user_id:           user.id,
      customer_id:       customerId,
      property_id:       (body.property_id as string) || null,
      title,
      frequency,
      day_of_week:       dayOfWeek,
      day_of_month:      dayOfMonth,
      start_date:        startDate,
      end_date:          endDate,
      next_invoice_date: nextDate,
      auto_send:         Boolean(body.auto_send),
      line_items:        items,
      tax_percent:       taxPercent,
      notes:             (body.notes as string) || null,
      active:            true,
    })
    .select(RECURRING_SELECT)
    .single()

  if (error) {
    console.error('[POST /api/lawn/recurring-invoices]', error)
    return NextResponse.json({ error: 'Could not save the recurring invoice.' }, { status: 500 })
  }

  return NextResponse.json({ recurring: data }, { status: 201 })
}
