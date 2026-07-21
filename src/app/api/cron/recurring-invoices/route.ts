import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computeNextInvoiceDate } from '@/lib/lawn/recurring'
import { computeTotals, normalizeLineItems } from '@/lib/lawn/invoice-utils'
import { sendInvoiceEmail } from '@/lib/lawn/invoice-email'
import type { RecurringFrequency, InvoiceLineItem } from '@/types/lawn'

export const dynamic = 'force-dynamic'

interface RecurringRow {
  id:                string
  user_id:           string
  customer_id:       string
  property_id:       string | null
  title:             string
  frequency:         RecurringFrequency
  day_of_week:       number | null
  day_of_month:      number | null
  end_date:          string | null
  next_invoice_date: string
  auto_send:         boolean
  line_items:        InvoiceLineItem[]
  tax_percent:       number
  notes:             string | null
  customer:          { id: string; full_name: string | null; email: string | null } | null
  property:          { id: string; name: string | null; address: string | null } | null
}

// GET /api/cron/recurring-invoices
// Runs daily at 06:00 UTC (see vercel.json). Materializes every due recurring
// template into a real invoice, optionally emailing it, then advances the
// template's next_invoice_date. Protected by x-cron-secret.
export async function GET(request: NextRequest) {
  const incomingSecret =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace('Bearer ', '')

  const expected = process.env.CRON_SECRET
  if (expected && incomingSecret !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const today    = new Date().toISOString().slice(0, 10)

  const { data: due, error } = await supabase
    .from('recurring_invoices')
    .select(`
      id, user_id, customer_id, property_id, title, frequency, day_of_week,
      day_of_month, end_date, next_invoice_date, auto_send, line_items,
      tax_percent, notes,
      customer:customers(id, full_name, email),
      property:properties(id, name, address)
    `)
    .eq('active', true)
    .lte('next_invoice_date', today)

  if (error) {
    console.error('[recurring-cron] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (due ?? []) as unknown as RecurringRow[]
  if (rows.length === 0) {
    console.log('[recurring-cron] nothing due')
    return NextResponse.json({ created: 0, sent: 0, deactivated: 0, failed: 0, total: 0 })
  }

  console.log(`[recurring-cron] ${rows.length} template(s) due on ${today}`)

  let created     = 0
  let sent        = 0
  let deactivated = 0
  let failed      = 0

  for (const row of rows) {
    try {
      // Past its end date — retire the template instead of billing again
      if (row.end_date && row.end_date < today) {
        await supabase.from('recurring_invoices').update({ active: false }).eq('id', row.id)
        deactivated++
        console.log(`[recurring-cron] template ${row.id} ended ${row.end_date} — deactivated`)
        continue
      }

      const items = normalizeLineItems(row.line_items)
      if (items.length === 0) {
        console.warn(`[recurring-cron] template ${row.id} has no line items — skipped`)
        failed++
        continue
      }

      const taxPercent = Number(row.tax_percent) || 0
      const { subtotal, taxAmount, total } = computeTotals(items, taxPercent)

      // Net-30 by default, measured from the date the invoice is generated
      const dueDate = new Date(`${today}T12:00:00Z`)
      dueDate.setUTCDate(dueDate.getUTCDate() + 30)

      const { data: invoice, error: insertErr } = await supabase
        .from('invoices')
        .insert({
          user_id:              row.user_id,
          customer_id:          row.customer_id,
          property_id:          row.property_id,
          recurring_invoice_id: row.id,
          status:               'draft',
          subtotal,
          tax_percent:          taxPercent,
          tax_amount:           taxAmount,
          total,
          notes:                row.notes,
          due_date:             dueDate.toISOString().slice(0, 10),
          invoice_date:         today,
          line_items:           items,
        })
        .select('id, invoice_number')
        .single()

      if (insertErr || !invoice) {
        console.error(`[recurring-cron] template ${row.id} invoice insert failed:`, insertErr?.message)
        failed++
        continue
      }

      await supabase.from('invoice_line_items').insert(
        items.map((l, i) => ({ ...l, invoice_id: invoice.id, user_id: row.user_id, position: i })),
      )

      created++
      console.log(`[recurring-cron] created invoice #${invoice.invoice_number} from template ${row.id}`)

      if (row.auto_send && row.customer?.email) {
        const { data: profile } = await supabase
          .from('profiles').select('business_name, full_name, phone').eq('id', row.user_id).single()

        const result = await sendInvoiceEmail(row.customer.email, {
          invoiceNumber: invoice.invoice_number as string,
          businessName:  profile?.business_name ?? profile?.full_name ?? 'Your Landscaper',
          businessPhone: profile?.phone ?? null,
          customerName:  row.customer.full_name ?? 'there',
          propertyLabel: row.property?.name ?? row.property?.address ?? null,
          lineItems:     items,
          subtotal,
          taxPercent,
          taxAmount,
          total,
          dueDate:       dueDate.toISOString().slice(0, 10),
          notes:         row.notes,
        })

        if (result.success) {
          await supabase
            .from('invoices')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', invoice.id)
          sent++
          console.log(`[recurring-cron] emailed invoice #${invoice.invoice_number} to ${row.customer.email}`)
        } else {
          console.error(`[recurring-cron] send failed for invoice ${invoice.id}: ${result.error}`)
        }
      } else if (row.auto_send) {
        console.warn(`[recurring-cron] template ${row.id} is auto-send but the customer has no email`)
      }

      const nextDate = computeNextInvoiceDate(
        row.next_invoice_date, row.frequency, row.day_of_week, row.day_of_month,
      )

      const advance: Record<string, unknown> = { next_invoice_date: nextDate }
      // The next run would fall past the end date — retire the template now
      if (row.end_date && nextDate > row.end_date) {
        advance.active = false
        deactivated++
      }

      await supabase.from('recurring_invoices').update(advance).eq('id', row.id)
      console.log(`[recurring-cron] template ${row.id} next invoice ${nextDate}`)
    } catch (err) {
      failed++
      console.error(`[recurring-cron] template ${row.id} threw:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`[recurring-cron] done — created ${created}, sent ${sent}, deactivated ${deactivated}, failed ${failed}`)

  return NextResponse.json({ created, sent, deactivated, failed, total: rows.length })
}
