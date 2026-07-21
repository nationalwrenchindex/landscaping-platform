import type { InvoiceLineItem } from '@/types/lawn'

export const INVOICE_SELECT = `
  id, user_id, customer_id, property_id, job_id, invoice_number, invoice_seq,
  status, subtotal, tax_percent, tax_amount, total, notes, due_date, paid_at,
  sent_at, invoice_date, created_at, updated_at, recurring_invoice_id,
  customer:customers(id, full_name, phone, email, address, city, state, zip),
  property:properties(id, name, address),
  items:invoice_line_items(id, invoice_id, description, quantity, unit_price, total, position)
`

export const VALID_INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Cleans client-supplied line items and recomputes each row total. */
export function normalizeLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => {
      const l = r as Record<string, unknown>
      const quantity  = Number(l.quantity)   || 0
      const unitPrice = Number(l.unit_price) || 0
      return {
        description: typeof l.description === 'string' ? l.description.trim() : '',
        quantity,
        unit_price:  unitPrice,
        total:       round2(quantity * unitPrice),
      }
    })
    .filter(l => l.description.length > 0)
}

export function computeTotals(
  items: InvoiceLineItem[],
  taxPercent: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal  = round2(items.reduce((s, l) => s + l.total, 0))
  const taxAmount = round2(subtotal * ((Number(taxPercent) || 0) / 100))
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) }
}
