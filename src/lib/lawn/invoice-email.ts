import { Resend } from 'resend'
import type { InvoiceLineItem } from '@/types/lawn'

const FROM = 'LawnPlatform Invoices <onboarding@resend.dev>'

export const fmtCurrency = (n: number | null | undefined): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

export interface InvoiceEmailPayload {
  invoiceNumber: string
  businessName:  string
  businessPhone: string | null
  customerName:  string
  propertyLabel: string | null
  lineItems:     InvoiceLineItem[]
  subtotal:      number
  taxPercent:    number
  taxAmount:     number
  total:         number
  dueDate:       string | null
  notes:         string | null
}

export function renderInvoiceHtml(p: InvoiceEmailPayload): string {
  const rows = p.lineItems.map(li => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">${esc(li.description || '')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(li.quantity) || 0}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtCurrency(li.unit_price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtCurrency(li.total)}</td>
    </tr>`).join('')

  return `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <div style="background:#16a34a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <div style="font-size:20px;font-weight:700;">${esc(p.businessName)}</div>
    <div style="font-size:13px;opacity:.9;">Invoice #${esc(p.invoiceNumber)}</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p style="margin:0 0 4px;">Hi ${esc(p.customerName)},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;">
      Here is your invoice${p.propertyLabel ? ` for ${esc(p.propertyLabel)}` : ''}.
      ${p.dueDate ? `Payment is due by <strong>${fmtDate(p.dueDate)}</strong>.` : ''}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">Description</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;">Qty</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;">Rate</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="width:100%;margin-top:16px;font-size:14px;">
      <tr><td style="text-align:right;padding:4px 8px;color:#6b7280;">Subtotal</td>
          <td style="text-align:right;padding:4px 8px;width:120px;">${fmtCurrency(p.subtotal)}</td></tr>
      <tr><td style="text-align:right;padding:4px 8px;color:#6b7280;">Tax (${p.taxPercent}%)</td>
          <td style="text-align:right;padding:4px 8px;">${fmtCurrency(p.taxAmount)}</td></tr>
      <tr><td style="text-align:right;padding:8px;font-weight:700;border-top:2px solid #16a34a;">Total</td>
          <td style="text-align:right;padding:8px;font-weight:700;border-top:2px solid #16a34a;color:#16a34a;">${fmtCurrency(p.total)}</td></tr>
    </table>
    ${p.notes ? `<p style="margin-top:16px;font-size:13px;color:#4b5563;white-space:pre-wrap;">${esc(p.notes)}</p>` : ''}
    <p style="margin-top:24px;font-size:13px;color:#6b7280;">
      Thank you for your business.<br>${esc(p.businessName)}${p.businessPhone ? ` &middot; ${esc(p.businessPhone)}` : ''}
    </p>
  </div>
</div>`
}

/**
 * Sends an invoice email via Resend. Never throws — callers get a result
 * object so a failed send doesn't roll back the invoice status change.
 */
export async function sendInvoiceEmail(
  to: string,
  payload: InvoiceEmailPayload,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' }
  if (!to)     return { success: false, error: 'Customer has no email address' }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from:    FROM,
      to,
      subject: `Invoice #${payload.invoiceNumber} from ${payload.businessName}`,
      html:    renderInvoiceHtml(payload),
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
