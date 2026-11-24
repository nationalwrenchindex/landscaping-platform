// Automated Google review requests — the landscaping equivalent of NWI's
// TorqueWrench. When an invoice is marked paid, sendReviewRequest() texts the
// customer a thank-you with the business's Google review link and logs the send
// to review_requests.
//
// EXACTLY ONE review text per paid invoice / job:
//   - If TorqueWrench can deliver for this business, the review is handed to
//     TorqueWrench (queued via lib/torquewrench/enqueue.ts) and this simple
//     sender does not text.
//   - Otherwise this sender texts once. It claims the invoice in
//     review_requests (unique on invoice_id) BEFORE texting, so two concurrent
//     calls cannot both send.
//   - Neither path fires if either table already has a review for this
//     invoice or this job.
//
// Never throws — the caller (the invoice PATCH route) must not have a review
// text failure roll back the payment status change.

import { createServiceClient } from '@/lib/supabase/service'
import { sendSmsResult } from '@/lib/twilio'
import {
  enqueueTorqueWrenchReview,
  isTorqueWrenchDelivering,
  reviewAlreadyHandled,
} from '@/lib/torquewrench/enqueue'

export interface ReviewRequestResult {
  sent:    boolean
  skipped?: boolean
  /** The review was handed to TorqueWrench, which texts it from its cron. */
  queuedTorqueWrench?: boolean
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

    // ── Never twice: either sender already has this invoice or this job ──
    if (await reviewAlreadyHandled(supabase, { invoiceId: invoice.id, jobId: invoice.job_id })) {
      return { sent: false, skipped: true, reason: 'Review request already sent for this invoice or job.' }
    }

    // ── TorqueWrench owns the review where it can deliver ──
    if (await isTorqueWrenchDelivering(supabase, invoice.user_id)) {
      const tw = await enqueueTorqueWrenchReview(supabase, {
        userId:     invoice.user_id,
        invoiceId:  invoice.id,
        jobId:      invoice.job_id,
        customerId: invoice.customer_id,
      })
      if (tw.queued) return { sent: false, queuedTorqueWrench: true }
      return { sent: false, skipped: true, reason: tw.reason }
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

    // ── Claim this invoice first (unique index on invoice_id) so a concurrent
    //    call cannot also text. The loser gets 23505 and stops. ──
    const { data: claim, error: claimErr } = await supabase
      .from('review_requests')
      .insert({
        user_id:           invoice.user_id,
        customer_id:       invoice.customer_id,
        job_id:            invoice.job_id,
        invoice_id:        invoice.id,
        phone_number:      phone,
        status:            'pending',
        google_review_url: googleUrl,
      })
      .select('id')
      .single()

    if (claimErr || !claim) {
      if (claimErr?.code === '23505') {
        return { sent: false, skipped: true, reason: 'Review request already sent.' }
      }
      console.error('[review-requests] claim insert error:', claimErr?.message)
      return { sent: false, reason: 'Could not record the review request.' }
    }

    const result = await sendSmsResult({ to: phone, body })

    if (!result.success) {
      // Release the claim so a later paid transition can retry.
      await supabase.from('review_requests').delete().eq('id', claim.id)
      return { sent: false, reason: result.error ?? 'SMS send failed.' }
    }

    const { error: logErr } = await supabase
      .from('review_requests')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', claim.id)

    if (logErr) {
      console.error('[review-requests] log update error:', logErr.message)
      // The text already went out and the claim row blocks a resend.
    }

    return { sent: true }
  } catch (err) {
    console.error('[review-requests] unexpected error:', err instanceof Error ? err.message : String(err))
    return { sent: false, reason: 'Unexpected error sending review request.' }
  }
}
