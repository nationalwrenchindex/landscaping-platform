// TorqueWrench review queueing — the ONE place a torquewrench_reviews row is
// created. Both invoice flows call this:
//   - the old invoice route   (api/invoices/[id]/route.ts)
//   - the new invoice flow    (lib/landscaping/review-requests.ts, called from
//                              api/lawn/invoices/[id]/route.ts)
//
// Rule: exactly one review text per paid invoice / job. When TorqueWrench can
// deliver for a business it owns the review; the simple Google-link sender
// stands down. Neither may fire twice for the same invoice or job:
//   - reviewAlreadyHandled() checks both tables by invoice AND by job
//   - unique indexes (migrations 082, 088) refuse a second row in a race
//   - the TorqueWrench cron claims a row before sending it
//
// Never throws.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TwEnqueueResult =
  | { queued: true }
  | { queued: false; duplicate?: boolean; reason: string }

/**
 * TorqueWrench can actually deliver a review text for this business:
 * the add-on is on, its settings are enabled, and it has a Google place id
 * (the TorqueWrench cron refuses to send without one, so without it a queued
 * review would never go out and the customer would get nothing).
 */
export async function isTorqueWrenchDelivering(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('torquewrench_addon_active')
    .eq('id', userId)
    .single()
  if (!profile?.torquewrench_addon_active) return false

  const { data: settings } = await supabase
    .from('torquewrench_settings')
    .select('is_enabled, google_place_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!settings?.is_enabled && !!String(settings?.google_place_id ?? '').trim()
}

/** True if EITHER sender already has a review for this invoice or this job. */
export async function reviewAlreadyHandled(
  supabase: SupabaseClient,
  { invoiceId, jobId }: { invoiceId: string | null; jobId: string | null },
): Promise<boolean> {
  const checks: PromiseLike<{ data: unknown[] | null }>[] = []
  if (invoiceId) {
    checks.push(supabase.from('review_requests').select('id').eq('invoice_id', invoiceId).limit(1))
    checks.push(supabase.from('torquewrench_reviews').select('id').eq('invoice_id', invoiceId).limit(1))
  }
  if (jobId) {
    checks.push(supabase.from('review_requests').select('id').eq('job_id', jobId).limit(1))
    checks.push(supabase.from('torquewrench_reviews').select('id').eq('job_id', jobId).limit(1))
  }
  const results = await Promise.all(checks)
  return results.some(r => (r.data?.length ?? 0) > 0)
}

export async function enqueueTorqueWrenchReview(
  supabase: SupabaseClient,
  { userId, invoiceId, jobId, customerId }: {
    userId:     string
    invoiceId:  string | null
    jobId:      string | null
    customerId: string | null
  },
): Promise<TwEnqueueResult> {
  try {
    if (!customerId)           return { queued: false, reason: 'No customer on the invoice.' }
    if (!invoiceId && !jobId)  return { queued: false, reason: 'No invoice or job to key the review on.' }

    if (!(await isTorqueWrenchDelivering(supabase, userId))) {
      return { queued: false, reason: 'TorqueWrench is not active for this business.' }
    }

    if (await reviewAlreadyHandled(supabase, { invoiceId, jobId })) {
      return { queued: false, duplicate: true, reason: 'This invoice/job already has a review request.' }
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name, full_name, phone')
      .eq('id', customerId)
      .eq('user_id', userId)
      .single()

    const digits = String(customer?.phone ?? '').replace(/\D/g, '')
    if (digits.length < 10) return { queued: false, reason: 'Customer has no valid phone number.' }
    // E.164, same normalisation TorqueWrench has always stored
    const customerPhone = digits.startsWith('1') ? `+${digits}` : `+1${digits}`

    const customerName =
      String(customer?.full_name ?? '').trim() ||
      [customer?.first_name, customer?.last_name].map(s => String(s ?? '').trim()).filter(Boolean).join(' ') ||
      null

    let serviceType: string | null = null
    if (jobId) {
      const { data: job } = await supabase.from('jobs').select('service_type').eq('id', jobId).single()
      serviceType = (job?.service_type as string | null) ?? null
    }

    const { error } = await supabase.from('torquewrench_reviews').insert({
      user_id:        userId,
      job_id:         jobId,
      invoice_id:     invoiceId,
      customer_name:  customerName,
      customer_phone: customerPhone,
      service_type:   serviceType,
      status:         'pending',
    })

    if (error) {
      // 23505 = unique violation: a concurrent request queued it first.
      if (error.code === '23505') {
        return { queued: false, duplicate: true, reason: 'Already queued by a concurrent request.' }
      }
      console.error('[torquewrench] enqueue insert error:', error.message)
      return { queued: false, reason: 'Could not queue the TorqueWrench review.' }
    }

    console.log(`[torquewrench] Queued review request (invoice ${invoiceId ?? '-'}, job ${jobId ?? '-'})`)
    return { queued: true }
  } catch (err) {
    console.error('[torquewrench] enqueue error:', err instanceof Error ? err.message : String(err))
    return { queued: false, reason: 'Unexpected error queueing the TorqueWrench review.' }
  }
}
