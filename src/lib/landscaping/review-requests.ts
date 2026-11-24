// Automated Google review requests — the landscaping equivalent of NWI's
// TorqueWrench. When an invoice is marked paid, sendReviewRequest() texts the
// customer a thank-you with the business's Google review link and logs the send
// to review_requests. It is duplicate-safe: an invoice never texts twice.
//
// Never throws — the caller (the invoice PATCH route) must not have a review
// text failure roll back the payment status change.

import { createServiceClient } from '@/lib/supabase/service'
import { sendSmsResult } from '@/lib/twilio'

export interface ReviewRequestResult {
  sent:    boolean
  skipped?: boolean
  reason?: string
}

const firstName = (fullName: string | null | undefined): string => {
  const name = (fullName ?? '').trim()
  if (!name) return 'there'
  return name.split(/\s+/)[0]
}

export async function sendReviewRequest(invoiceId: string): Promise<ReviewRequestResult> {
  if (!invoiceId) return { sent: false, reason: 'No invoice id provided.' }

  try {
    const supabase = createServiceClient()

    // ── Load the invoice (owner, customer, source job) ──
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, user_id, customer_id, job_id')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return { sent: false, reason: 'Invoice not found.' }

    // ── No duplicates: bail if this invoice already has a request ──
    const { data: existing } = await supabase
      .from('review_requests')
      .select('id')
      .eq('invoice_id', invoiceId)
      .maybeSingle()

    if (existing) return { sent: false, skipped: true, reason: 'Review request already sent.' }

    // ── One review text per customer per job, never two ──
    // TorqueWrench is a second review pipeline. Where it is ACTIVE for this
    // business it wins and this sender stands down. "Active" is the exact
    // condition TorqueWrench uses to queue a review (api/invoices/[id]/route.ts):
    // profiles.torquewrench_addon_active AND torquewrench_settings.is_enabled.
    const { data: twProfile } = await supabase
      .from('profiles')
      .select('torquewrench_addon_active')
      .eq('id', invoice.user_id)
      .single()
    if (twProfile?.torquewrench_addon_active) {
      const { data: twSettings } = await supabase
        .from('torquewrench_settings')
        .select('is_enabled')
        .eq('user_id', invoice.user_id)
        .maybeSingle()
      if (twSettings?.is_enabled) {
        return { sent: false, skipped: true, reason: 'TorqueWrench is active for this business; it handles review requests.' }
      }
    }

    // Per job: if this job already got a review text from EITHER sender (another
    // invoice for the same job, or TorqueWrench before it was switched off),
    // do not send another.
    if (invoice.job_id) {
      const [{ data: jobSimple }, { data: jobTw }] = await Promise.all([
        supabase.from('review_requests').select('id').eq('job_id', invoice.job_id).limit(1),
        supabase.from('torquewrench_reviews').select('id').eq('job_id', invoice.job_id).limit(1),
      ])
      if ((jobSimple?.length ?? 0) > 0 || (jobTw?.length ?? 0) > 0) {
        return { sent: false, skipped: true, reason: 'This job already has a review request.' }
      }
    }

    // ── Customer phone ──
    if (!invoice.customer_id) return { sent: false, reason: 'Invoice has no customer.' }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('id', invoice.customer_id)
      .single()

    const phone = customer?.phone ? String(customer.phone).trim() : ''
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return { sent: false, reason: 'Customer has no valid phone number.' }
    }

    // ── Business name + Google review URL from the profile ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, full_name, google_review_url')
      .eq('id', invoice.user_id)
      .single()

    const googleUrl = profile?.google_review_url ? String(profile.google_review_url).trim() : ''
    if (!googleUrl) {
      return { sent: false, reason: 'No Google review URL configured for this business.' }
    }

    const businessName = profile?.business_name || profile?.full_name || 'our team'

    // ── Send the SMS ──
    const body =
      `Hey ${firstName(customer?.full_name)} — thanks for letting ${businessName} take care of your ` +
      `property today. If we did a great job we would love a quick Google review: ${googleUrl} ` +
      `— Reply STOP to opt out`

    const result = await sendSmsResult({ to: phone, body })

    if (!result.success) {
      return { sent: false, reason: result.error ?? 'SMS send failed.' }
    }

    // ── Log the request (unique index also guards against races) ──
    const { error: logErr } = await supabase
      .from('review_requests')
      .insert({
        user_id:           invoice.user_id,
        customer_id:       invoice.customer_id,
        job_id:            invoice.job_id,
        invoice_id:        invoice.id,
        phone_number:      phone,
        status:            'sent',
        sent_at:           new Date().toISOString(),
        google_review_url: googleUrl,
      })

    if (logErr) {
      console.error('[review-requests] log insert error:', logErr.message)
      // The text already went out — report success even though logging failed.
    }

    return { sent: true }
  } catch (err) {
    console.error('[review-requests] unexpected error:', err instanceof Error ? err.message : String(err))
    return { sent: false, reason: 'Unexpected error sending review request.' }
  }
}
