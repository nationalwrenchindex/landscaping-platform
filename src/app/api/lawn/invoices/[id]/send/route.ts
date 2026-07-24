import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { INVOICE_SELECT } from '@/lib/lawn/invoice-utils'
import { sendInvoiceEmail } from '@/lib/lawn/invoice-email'
import type { InvoiceLineItem } from '@/types/lawn'

// ─── POST /api/lawn/invoices/[id]/send ────────────────────────────────────────
// Marks the invoice sent and emails it to the customer via Resend.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoice, error } = await supabase
    .from('invoices').select(INVOICE_SELECT).eq('id', id).eq('user_id', user.id).single()

  if (error || !invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

  const customer = invoice.customer as { full_name?: string; email?: string } | null
  const property = invoice.property as { name?: string; address?: string } | null

  if (!customer?.email) {
    return NextResponse.json(
      { error: 'This customer has no email address. Add one before sending.' },
      { status: 400 },
    )
  }

  const { data: profile } = await supabase
    .from('profiles').select('business_name, full_name, phone').eq('id', user.id).single()

  const items = ((invoice.items as InvoiceLineItem[]) ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  // Photos from the source job ride along so the customer sees the finished work.
  let photos: { url: string; caption: string | null }[] = []
  if (invoice.job_id) {
    const { data: photoRows } = await supabase
      .from('job_photos')
      .select('public_url, caption')
      .eq('job_id', invoice.job_id as string)
      .eq('user_id', user.id)
      .order('taken_at', { ascending: true })
    photos = (photoRows ?? []).map(p => ({
      url: p.public_url as string, caption: (p.caption as string | null) ?? null,
    }))
  }

  const result = await sendInvoiceEmail(customer.email, {
    invoiceNumber: invoice.invoice_number as string,
    businessName:  profile?.business_name ?? profile?.full_name ?? 'Your Landscaper',
    businessPhone: profile?.phone ?? null,
    customerName:  customer.full_name ?? 'there',
    propertyLabel: property?.name ?? property?.address ?? null,
    lineItems:     items,
    subtotal:      Number(invoice.subtotal)    || 0,
    taxPercent:    Number(invoice.tax_percent) || 0,
    taxAmount:     Number(invoice.tax_amount)  || 0,
    total:         Number(invoice.total)       || 0,
    dueDate:       invoice.due_date as string | null,
    notes:         invoice.notes    as string | null,
    photos,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: `Could not send the invoice: ${result.error}` },
      { status: 502 },
    )
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: (invoice.sent_at as string | null) ?? now })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateErr) {
    console.error('[POST /api/lawn/invoices/[id]/send]', updateErr)
    return NextResponse.json(
      { error: 'The email was sent but the invoice status could not be updated.' },
      { status: 500 },
    )
  }

  const { data: full } = await supabase
    .from('invoices').select(INVOICE_SELECT).eq('id', id).eq('user_id', user.id).single()

  return NextResponse.json({ invoice: full, sent_to: customer.email })
}
