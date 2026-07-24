import { Resend } from 'resend'

const FROM = 'LawnPlatform Bookings <onboarding@resend.dev>'

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export interface BookingEmailPayload {
  businessName:  string
  businessPhone: string | null
  customerName:  string
  service:       string
  preferredDate: string
  address:       string
  notes:         string | null
}

export function renderBookingHtml(p: BookingEmailPayload): string {
  return `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
  <div style="background:#16a34a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <div style="font-size:20px;font-weight:700;">${esc(p.businessName)}</div>
    <div style="font-size:13px;opacity:.9;">Booking request received</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p style="margin:0 0 12px;">Hi ${esc(p.customerName)},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;">
      Thanks for your request! We've received the details below and will reach out shortly to confirm your appointment.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:130px;">Service</td><td style="padding:8px 0;font-weight:600;">${esc(p.service)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Preferred date</td><td style="padding:8px 0;font-weight:600;">${fmtDate(p.preferredDate)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Property</td><td style="padding:8px 0;">${esc(p.address)}</td></tr>
      ${p.notes ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Notes</td><td style="padding:8px 0;white-space:pre-wrap;">${esc(p.notes)}</td></tr>` : ''}
    </table>
    <p style="margin-top:24px;font-size:13px;color:#6b7280;">
      This is a request, not a confirmed appointment. ${esc(p.businessName)} will be in touch soon.<br>
      ${esc(p.businessName)}${p.businessPhone ? ` &middot; ${esc(p.businessPhone)}` : ''}
    </p>
  </div>
</div>`
}

/** Sends the booking confirmation to the customer. Never throws. */
export async function sendBookingConfirmation(
  to: string,
  payload: BookingEmailPayload,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' }
  if (!to)     return { success: false, error: 'No customer email' }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from:    FROM,
      to,
      subject: `Booking request received — ${payload.businessName}`,
      html:    renderBookingHtml(payload),
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
