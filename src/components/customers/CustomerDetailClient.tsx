'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Customer, Property, LawnJobStatus } from '@/types/lawn'

interface HistoryJob {
  id:               string
  title:            string | null
  status:           LawnJobStatus
  scheduled_date:   string
  scheduled_time:   string | null
  completion_notes: string | null
  completed_at:     string | null
  property_id:      string | null
}

interface HistoryInvoice {
  id:             string
  invoice_number: string
  status:         string
  total:          number
  due_date:       string | null
  paid_at:        string | null
  invoice_date:   string
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

const STATUS_STYLE: Record<string, string> = {
  scheduled:   'bg-blue/20 text-blue-light',
  in_progress: 'bg-amber-500/20 text-amber-400',
  completed:   'bg-success/20 text-success',
  cancelled:   'bg-white/10 text-white/40',
  draft:       'bg-white/10 text-white/50',
  sent:        'bg-blue/20 text-blue-light',
  paid:        'bg-success/20 text-success',
  overdue:     'bg-danger/20 text-danger',
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
}

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

const emptyProperty = () => ({
  name: '', address: '', city: '', state: '', zip: '',
  square_footage: '', lot_size_acres: '', gate_code: '',
  dog_on_property: false, property_notes: '',
})

type PropertyForm = ReturnType<typeof emptyProperty>

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [jobs,     setJobs]     = useState<HistoryJob[]>([])
  const [invoices, setInvoices] = useState<HistoryInvoice[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const [showPropForm, setShowPropForm] = useState(false)
  const [editingProp,  setEditingProp]  = useState<string | null>(null)
  const [propForm,     setPropForm]     = useState<PropertyForm>(emptyProperty)
  const [propError,    setPropError]    = useState<string | null>(null)
  const [savingProp,   setSavingProp]   = useState(false)
  const [deletingProp, setDeletingProp] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/customers/${customerId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load this customer.')
      setCustomer(json.customer)
      setJobs(json.jobs ?? [])
      setInvoices(json.invoices ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this customer.')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void load() }, [load])

  function openCreateProp() {
    setEditingProp(null)
    setPropForm(emptyProperty())
    setPropError(null)
    setShowPropForm(true)
  }

  function openEditProp(p: Property) {
    setEditingProp(p.id)
    setPropForm({
      name:            p.name    ?? '',
      address:         p.address ?? '',
      city:            p.city    ?? '',
      state:           p.state   ?? '',
      zip:             p.zip     ?? '',
      square_footage:  p.square_footage != null ? String(p.square_footage) : '',
      lot_size_acres:  p.lot_size_acres != null ? String(p.lot_size_acres) : '',
      gate_code:       p.gate_code      ?? '',
      dog_on_property: p.dog_on_property,
      property_notes:  p.property_notes ?? '',
    })
    setPropError(null)
    setShowPropForm(true)
  }

  async function handlePropSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPropError(null)

    if (!propForm.address.trim()) {
      setPropError('Property address is required.')
      return
    }
    if (propForm.square_footage && Number(propForm.square_footage) < 0) {
      setPropError('Square footage must be a positive number.')
      return
    }

    setSavingProp(true)
    try {
      const res = await fetch(
        editingProp ? `/api/lawn/properties/${editingProp}` : '/api/lawn/properties',
        {
          method:  editingProp ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...propForm, customer_id: customerId }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the property.')
      setShowPropForm(false)
      setEditingProp(null)
      setPropForm(emptyProperty())
      await load()
    } catch (err) {
      setPropError(err instanceof Error ? err.message : 'Could not save the property.')
    } finally {
      setSavingProp(false)
    }
  }

  async function handlePropDelete(p: Property) {
    if (!window.confirm(`Delete the property at ${p.address ?? 'this address'}?`)) return
    setDeletingProp(p.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/properties/${p.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the property.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the property.')
    } finally {
      setDeletingProp(null)
    }
  }

  if (loading) return <p className="text-white/40 text-sm py-12 text-center">Loading customer…</p>

  if (error && !customer) {
    return (
      <div>
        <Link href="/customers" className="text-orange text-sm hover:underline">← Back to customers</Link>
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      </div>
    )
  }

  if (!customer) return null

  const properties = customer.properties ?? []
  const propertyName = (id: string | null) => {
    if (!id) return null
    const p = properties.find(x => x.id === id)
    return p ? (p.name ?? p.address) : null
  }

  return (
    <div>
      <Link href="/customers" className="text-orange text-sm hover:underline inline-block mb-4">
        ← Back to customers
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Contact card */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-5 mb-6">
        <h1 className="font-condensed font-bold text-3xl text-white tracking-wide">
          {customer.full_name ?? 'Unnamed customer'}
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
          <div>
            <span className="text-white/40">Phone</span>
            <p className="text-white">
              {customer.phone
                ? <a href={`tel:${customer.phone}`} className="hover:text-orange">{customer.phone}</a>
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-white/40">Email</span>
            <p className="text-white break-all">
              {customer.email
                ? <a href={`mailto:${customer.email}`} className="hover:text-orange">{customer.email}</a>
                : '—'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-white/40">Billing address</span>
            <p className="text-white">
              {[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
          {customer.notes && (
            <div className="sm:col-span-2">
              <span className="text-white/40">Notes</span>
              <p className="text-white whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Properties */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-condensed font-bold text-xl text-white tracking-wide">PROPERTIES</h2>
        <button
          onClick={openCreateProp}
          className="bg-orange hover:bg-orange-hover text-white font-condensed font-semibold
                     px-4 py-2 rounded-lg text-sm min-h-[40px] transition-colors"
        >
          + Add Property
        </button>
      </div>

      {showPropForm && (
        <form
          onSubmit={handlePropSubmit}
          className="mb-5 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5"
        >
          <h3 className="font-condensed font-bold text-lg text-white mb-4">
            {editingProp ? 'Edit Property' : 'New Property'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nickname</label>
              <input
                type="text" value={propForm.name}
                onChange={e => setPropForm({ ...propForm, name: e.target.value })}
                placeholder="Front house" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Address *</label>
              <input
                type="text" value={propForm.address} required
                onChange={e => setPropForm({ ...propForm, address: e.target.value })}
                placeholder="123 Oak Street" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input
                type="text" value={propForm.city}
                onChange={e => setPropForm({ ...propForm, city: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>State</label>
                <input
                  type="text" value={propForm.state} maxLength={2}
                  onChange={e => setPropForm({ ...propForm, state: e.target.value.toUpperCase() })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ZIP</label>
                <input
                  type="text" value={propForm.zip}
                  onChange={e => setPropForm({ ...propForm, zip: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Square footage</label>
              <input
                type="number" min="0" inputMode="numeric" value={propForm.square_footage}
                onChange={e => setPropForm({ ...propForm, square_footage: e.target.value })}
                placeholder="8500" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Lot size (acres)</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal" value={propForm.lot_size_acres}
                onChange={e => setPropForm({ ...propForm, lot_size_acres: e.target.value })}
                placeholder="0.25" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Gate code</label>
              <input
                type="text" value={propForm.gate_code}
                onChange={e => setPropForm({ ...propForm, gate_code: e.target.value })}
                placeholder="#1234" className={inputCls}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox" checked={propForm.dog_on_property}
                  onChange={e => setPropForm({ ...propForm, dog_on_property: e.target.checked })}
                  className="w-5 h-5 rounded accent-orange"
                />
                <span className="text-sm text-white">Dog on property</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Property notes</label>
              <textarea
                value={propForm.property_notes} rows={3}
                onChange={e => setPropForm({ ...propForm, property_notes: e.target.value })}
                placeholder="Sprinkler heads near the driveway. Bag clippings."
                className={`${inputCls} resize-y`}
              />
            </div>
          </div>

          {propError && (
            <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {propError}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <button
              type="submit" disabled={savingProp}
              className="bg-orange hover:bg-orange-hover disabled:opacity-50 text-white
                         font-condensed font-semibold px-5 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              {savingProp ? 'Saving…' : editingProp ? 'Save Changes' : 'Add Property'}
            </button>
            <button
              type="button"
              onClick={() => { setShowPropForm(false); setEditingProp(null); setPropError(null) }}
              className="text-white/50 hover:text-white px-5 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-8 text-center mb-6">
          <p className="text-white/50 text-sm">No properties yet for this customer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {properties.map(p => (
            <div key={p.id} className="rounded-xl border border-dark-border bg-dark-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-condensed font-bold text-lg text-white truncate">
                    {p.name || p.address}
                  </p>
                  <p className="text-white/50 text-sm truncate">
                    {[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')}
                  </p>
                </div>
                {p.dog_on_property && (
                  <span
                    title="Dog on property"
                    className="flex-shrink-0 rounded-full bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5"
                  >
                    🐕 Dog
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-white/40">
                {p.square_footage != null && <span>{p.square_footage.toLocaleString()} sq ft</span>}
                {p.lot_size_acres != null  && <span>{p.lot_size_acres} acres</span>}
                {p.gate_code               && <span>Gate {p.gate_code}</span>}
              </div>

              {p.property_notes && (
                <p className="mt-2 text-xs text-white/50 whitespace-pre-wrap">{p.property_notes}</p>
              )}

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-dark-border">
                <button
                  onClick={() => openEditProp(p)}
                  className="flex-1 text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg px-3 py-2 min-h-[40px] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handlePropDelete(p)}
                  disabled={deletingProp === p.id}
                  className="flex-1 text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                             rounded-lg px-3 py-2 min-h-[40px] transition-colors"
                >
                  {deletingProp === p.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service history */}
      <h2 className="font-condensed font-bold text-xl text-white tracking-wide mb-3">SERVICE HISTORY</h2>
      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-8 text-center mb-6">
          <p className="text-white/50 text-sm">No jobs recorded for this customer yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dark-border bg-dark-card divide-y divide-dark-border mb-6 overflow-hidden">
          {jobs.map(j => (
            <div key={j.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{j.title ?? 'Job'}</p>
                <p className="text-white/40 text-xs">
                  {fmtDate(j.scheduled_date)}
                  {j.scheduled_time ? ` · ${j.scheduled_time.slice(0, 5)}` : ''}
                  {propertyName(j.property_id) ? ` · ${propertyName(j.property_id)}` : ''}
                </p>
                {j.completion_notes && (
                  <p className="text-white/50 text-xs mt-1 whitespace-pre-wrap">{j.completion_notes}</p>
                )}
              </div>
              <span className={`flex-shrink-0 rounded-full text-xs px-2 py-0.5 ${STATUS_STYLE[j.status] ?? ''}`}>
                {STATUS_LABEL[j.status] ?? j.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Invoice history */}
      <h2 className="font-condensed font-bold text-xl text-white tracking-wide mb-3">INVOICES</h2>
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-8 text-center">
          <p className="text-white/50 text-sm">No invoices for this customer yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dark-border bg-dark-card divide-y divide-dark-border overflow-hidden">
          {invoices.map(inv => (
            <div key={inv.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Invoice #{inv.invoice_number}</p>
                <p className="text-white/40 text-xs">
                  {fmtDate(inv.invoice_date)}
                  {inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-white font-medium text-sm">{fmtMoney(inv.total)}</span>
                <span className={`rounded-full text-xs px-2 py-0.5 ${STATUS_STYLE[inv.status] ?? ''}`}>
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
