import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from '@/components/common/PrintButton'
import type { InvoiceLineItem } from '@/types/lawn'

export const metadata = { title: 'Invoice' }

const fmtMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id }   = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, subtotal, tax_percent, tax_amount, total,
      notes, due_date, paid_at, invoice_date,
      customer:customers(full_name, email, phone, address, city, state, zip),
      property:properties(name, address, city, state, zip),
      items:invoice_line_items(description, quantity, unit_price, total, position)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, full_name, phone, email')
    .eq('id', user.id)
    .single()

  const customer = invoice.customer as unknown as {
    full_name?: string; email?: string; phone?: string
    address?: string; city?: string; state?: string; zip?: string
  } | null

  const property = invoice.property as unknown as {
    name?: string; address?: string; city?: string; state?: string; zip?: string
  } | null

  const items = ((invoice.items as unknown as InvoiceLineItem[]) ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const businessName = profile?.business_name ?? profile?.full_name ?? 'Your Landscaping Business'

  const customerAddress = [customer?.address, customer?.city, customer?.state, customer?.zip]
    .filter(Boolean).join(', ')

  const propertyAddress = [property?.address, property?.city, property?.state, property?.zip]
    .filter(Boolean).join(', ')

  return (
    <div className="min-h-dvh bg-white text-gray-900 print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 0.6in; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto p-6 sm:p-10">
        <div className="no-print mb-6 flex items-center justify-between gap-3">
          <a href="/invoices" className="text-sm text-gray-500 hover:text-gray-900">← Back to invoices</a>
          <PrintButton />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-6 pb-6 border-b-4" style={{ borderColor: '#16a34a' }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#16a34a' }}>{businessName}</h1>
            <div className="text-sm text-gray-500 mt-1 space-y-0.5">
              {profile?.phone && <p>{profile.phone}</p>}
              {profile?.email && <p>{profile.email}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900">INVOICE</p>
            <p className="text-sm text-gray-500">#{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 mt-1">Issued {fmtDate(invoice.invoice_date)}</p>
            {invoice.due_date && (
              <p className="text-sm text-gray-500">Due {fmtDate(invoice.due_date)}</p>
            )}
            {invoice.status === 'paid' && (
              <p className="mt-2 inline-block rounded px-2 py-0.5 text-xs font-semibold text-white"
                 style={{ backgroundColor: '#16a34a' }}>
                PAID {invoice.paid_at ? fmtDate(invoice.paid_at) : ''}
              </p>
            )}
          </div>
        </div>

        {/* Bill to / service at */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill To</p>
            <p className="text-gray-900 font-medium mt-1">{customer?.full_name ?? '—'}</p>
            {customerAddress && <p className="text-sm text-gray-500">{customerAddress}</p>}
            {customer?.phone && <p className="text-sm text-gray-500">{customer.phone}</p>}
            {customer?.email && <p className="text-sm text-gray-500">{customer.email}</p>}
          </div>
          {property && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Service Address</p>
              {property.name && <p className="text-gray-900 font-medium mt-1">{property.name}</p>}
              {propertyAddress && <p className="text-sm text-gray-500">{propertyAddress}</p>}
            </div>
          )}
        </div>

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#f0fdf4' }}>
              <th className="text-left  font-semibold text-gray-600 px-3 py-2">Description</th>
              <th className="text-right font-semibold text-gray-600 px-3 py-2 w-20">Qty</th>
              <th className="text-right font-semibold text-gray-600 px-3 py-2 w-28">Rate</th>
              <th className="text-right font-semibold text-gray-600 px-3 py-2 w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2.5 text-gray-900">{l.description}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{Number(l.quantity)}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{fmtMoney(l.unit_price)}</td>
                <td className="px-3 py-2.5 text-right text-gray-900">{fmtMoney(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-full sm:w-64 text-sm space-y-1.5">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span className="text-gray-900">{fmtMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax ({invoice.tax_percent ?? 0}%)</span>
              <span className="text-gray-900">{fmtMoney(invoice.tax_amount)}</span>
            </div>
            <div
              className="flex justify-between pt-2 font-bold text-base border-t-2"
              style={{ borderColor: '#16a34a' }}
            >
              <span className="text-gray-900">Total</span>
              <span style={{ color: '#16a34a' }}>{fmtMoney(invoice.total)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-10">
          Thank you for your business — {businessName}
        </p>
      </div>
    </div>
  )
}
