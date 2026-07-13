import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from '@/components/common/PrintButton'

export const metadata = { title: 'Chemical Application Record' }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, mo, da] = d.split('-').map(Number)
  return new Date(y, mo - 1, da).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface ChemLog {
  id: string
  product_name: string
  product_epa_number: string | null
  application_rate: string | null
  target_area: string | null
  target_pest_or_weed: string | null
  application_date: string | null
  re_entry_interval_hours: number | null
  notes: string | null
}

export default async function ChemicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: job } = await supabase
    .from('jobs')
    .select('id, service_type, job_date, location_address, customer:customers(first_name, last_name)')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()
  if (!job) notFound()

  const [{ data: logs }, { data: profile }] = await Promise.all([
    supabase
      .from('lawn_chemical_logs')
      .select('id, product_name, product_epa_number, application_rate, target_area, target_pest_or_weed, application_date, re_entry_interval_hours, notes')
      .eq('job_id', jobId)
      .eq('user_id', user.id)
      .order('application_date', { ascending: false }),
    supabase.from('profiles').select('business_name').eq('id', user.id).single(),
  ])

  const chemLogs = (logs ?? []) as ChemLog[]
  const customer = (job as unknown as { customer?: { first_name?: string; last_name?: string } | null }).customer
  const customerName = customer ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() : 'Customer'
  const biz = (profile?.business_name as string) || 'Lawn Care'

  return (
    <div className="min-h-dvh bg-white text-black p-8 print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-6 border-b-2 border-green-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-green-800">{biz}</h1>
            <p className="text-sm text-gray-600">Chemical Application Record</p>
          </div>
          <PrintButton />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-6">
          <div><span className="text-gray-500">Customer:</span> <strong>{customerName}</strong></div>
          <div><span className="text-gray-500">Service:</span> <strong>{(job as { service_type?: string }).service_type ?? '—'}</strong></div>
          <div className="col-span-2"><span className="text-gray-500">Property:</span> <strong>{(job as { location_address?: string }).location_address ?? '—'}</strong></div>
        </div>

        {chemLogs.length === 0 ? (
          <p className="text-gray-500 text-sm">No chemical applications recorded for this job.</p>
        ) : (
          <div className="space-y-4">
            {chemLogs.map((c) => (
              <div key={c.id} className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="font-bold text-lg">{c.product_name}</h2>
                  <span className="text-sm text-gray-500">{fmtDate(c.application_date)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {c.product_epa_number && <tr><td className="text-gray-500 py-0.5 pr-4">EPA #</td><td>{c.product_epa_number}</td></tr>}
                    {c.application_rate && <tr><td className="text-gray-500 py-0.5 pr-4">Application rate</td><td>{c.application_rate}</td></tr>}
                    {c.target_area && <tr><td className="text-gray-500 py-0.5 pr-4">Target area</td><td>{c.target_area}</td></tr>}
                    {c.target_pest_or_weed && <tr><td className="text-gray-500 py-0.5 pr-4">Target pest/weed</td><td>{c.target_pest_or_weed}</td></tr>}
                    <tr>
                      <td className="text-gray-500 py-0.5 pr-4">Re-entry interval</td>
                      <td className="font-semibold text-red-700">
                        {c.re_entry_interval_hours != null
                          ? `Keep people & pets off treated areas for ${c.re_entry_interval_hours} hours`
                          : '—'}
                      </td>
                    </tr>
                    {c.notes && <tr><td className="text-gray-500 py-0.5 pr-4 align-top">Notes</td><td>{c.notes}</td></tr>}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-8 pt-4 border-t">
          This record is provided for your reference. Follow all product label instructions and re-entry intervals.
          Generated by {biz}.
        </p>
      </div>
    </div>
  )
}
