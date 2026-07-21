'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Customer, Property, LawnInvoice, LawnInvoiceStatus, InvoiceLineItem } from '@/types/lawn'

const fmtMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

const STATUS_META: Record<LawnInvoiceStatus, { label: string; badge: string }> = {
  draft:   { label: 'Draft',   badge: 'bg-white/10 text-white/50' },
  sent:    { label: 'Sent',    badge: 'bg-blue/20 text-blue-light' },
  paid:    { label: 'Paid',    badge: 'bg-success/20 text-success' },
  overdue: { label: 'Overdue', badge: 'bg-danger/20 text-danger' },
}

const FILTERS: { value: LawnInvoiceStatus | ''; label: string }[] = [
  { value: '',        label: 'All'     },
  { value: 'draft',   label: 'Draft'   },
  { value: 'sent',    label: 'Sent'    },
  { value: 'paid',    label: 'Paid'    },
  { value: 'overdue', label: 'Overdue' },
]

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

const emptyLine = (): InvoiceLineItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 })

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

const emptyForm = () => ({
  customer_id: '', property_id: '',
  line_items:  [emptyLine()] as InvoiceLineItem[],
  tax_percent: 0,
  due_date:    defaultDueDate(),
  notes:       '',
})

type Form = ReturnType<typeof emptyForm>

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function InvoiceListTab() {
  const [invoices,   setInvoices]   = useState<LawnInvoice[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [filter,     setFilter]     = useState<LawnInvoiceStatus | ''>('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [notice,     setNotice]     = useState<string | null>(null)

  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState<Form>(emptyForm)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId,     setBusyId]     = useState<string | null>(null)

  const load = useCallback(async (status: LawnInvoiceStatus | '') => {
    setLoading(true)
    setError(null)
    try {
      const url  = status ? `/api/lawn/invoices?status=${status}` : '/api/lawn/invoices'
      const res  = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load invoices.')
      setInvoices(json.invoices)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoices.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(filter) }, [filter, load])

  useEffect(() => {
    fetch('/api/lawn/customers')
      .then(r => r.json())
      .then(j => { if (Array.isArray(j.customers)) setCustomers(j.customers) })
      .catch(() => {})
    fetch('/api/lawn/properties')
      .then(r => r.json())
      .then(j => { if (Array.isArray(j.properties)) setProperties(j.properties) })
      .catch(() => {})
  }, [])

  const customerProperties = properties.filter(p => p.customer_id === form.customer_id)

  const subtotal  = round2(form.line_items.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0,
  ))
  const taxAmount = round2(subtotal * ((Number(form.tax_percent) || 0) / 100))
  const total     = round2(subtotal + taxAmount)

  function updateLine(idx: number, patch: Partial<InvoiceLineItem>) {
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.customer_id) { setFormError('Choose a customer.'); return }
    if (!form.line_items.some(l => l.description.trim())) {
      setFormError('Add at least one line item with a description.')
      return
    }
    if (form.tax_percent < 0 || form.tax_percent > 100) {
      setFormError('Tax percent must be between 0 and 100.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/lawn/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, property_id: form.property_id || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not create the invoice.')
      setShowForm(false)
      setForm(emptyForm())
      await load(filter)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  async function sendInvoice(inv: LawnInvoice) {
    setBusyId(inv.id)
    setError(null)
    setNotice(null)
    try {
      const res  = await fetch(`/api/lawn/invoices/${inv.id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not send the invoice.')
      setNotice(`Invoice #${inv.invoice_number} emailed to ${json.sent_to}.`)
      await load(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invoice.')
    } finally {
      setBusyId(null)
    }
  }

  async function setStatus(inv: LawnInvoice, status: LawnInvoiceStatus) {
    setBusyId(inv.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/invoices/${inv.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not update the invoice.')
      await load(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the invoice.')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteInvoice(inv: LawnInvoice) {
    if (!window.confirm(`Delete invoice #${inv.invoice_number}?`)) return
    setBusyId(inv.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/invoices/${inv.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the invoice.')
      await load(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the invoice.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {/* Filters + create */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap min-h-[40px] transition-colors ${
                filter === f.value
                  ? 'bg-orange/15 text-orange'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setFormError(null); setShowForm(true) }}
          className="flex items-center justify-center gap-2 bg-orange hover:bg-orange-hover text-white
                     font-condensed font-semibold px-4 py-2.5 rounded-lg text-sm min-h-[44px] whitespace-nowrap transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Invoice
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5"
        >
          <h2 className="font-condensed font-bold text-lg text-white mb-4">New Invoice</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Customer *</label>
              <select
                value={form.customer_id} required
                onChange={e => setForm({ ...form, customer_id: e.target.value, property_id: '' })}
                className={inputCls}
              >
                <option value="">— Choose a customer —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name ?? 'Unnamed'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Property</label>
              <select
                value={form.property_id}
                onChange={e => setForm({ ...form, property_id: e.target.value })}
                disabled={!form.customer_id}
                className={`${inputCls} disabled:opacity-40`}
              >
                <option value="">
                  {form.customer_id ? '— No property —' : 'Pick a customer first'}
                </option>
                {customerProperties.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.address}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Line items */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Line items</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, line_items: [...f.line_items, emptyLine()] }))}
                className="text-xs text-orange hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {form.line_items.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text" value={l.description}
                    onChange={e => updateLine(i, { description: e.target.value })}
                    placeholder="Weekly mow — May"
                    className={`${inputCls} col-span-12 sm:col-span-6`}
                  />
                  <input
                    type="number" min="0" step="0.5" inputMode="decimal" value={l.quantity}
                    onChange={e => updateLine(i, { quantity: Number(e.target.value) })}
                    placeholder="Qty" className={`${inputCls} col-span-4 sm:col-span-2`}
                  />
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal" value={l.unit_price}
                    onChange={e => updateLine(i, { unit_price: Number(e.target.value) })}
                    placeholder="Rate" className={`${inputCls} col-span-5 sm:col-span-3`}
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      line_items: f.line_items.length > 1 ? f.line_items.filter((_, x) => x !== i) : f.line_items,
                    }))}
                    aria-label="Remove line"
                    className="col-span-3 sm:col-span-1 text-white/30 hover:text-danger text-sm min-h-[44px] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            <div>
              <label className={labelCls}>Tax percent</label>
              <input
                type="number" min="0" max="100" step="0.001" inputMode="decimal"
                value={form.tax_percent}
                onChange={e => setForm({ ...form, tax_percent: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input
                type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                value={form.notes} rows={2}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Thanks for your business! Checks payable to…"
                className={`${inputCls} resize-y`}
              />
            </div>
          </div>

          {/* Totals */}
          <div className="mt-5 rounded-lg bg-dark-lighter p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-white/50">
              <span>Subtotal</span><span className="text-white">{fmtMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-white/50">
              <span>Tax ({form.tax_percent}%)</span><span className="text-white">{fmtMoney(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-medium pt-1.5 border-t border-dark-border">
              <span className="text-white">Total</span><span className="text-orange">{fmtMoney(total)}</span>
            </div>
          </div>

          {formError && (
            <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <button
              type="submit" disabled={submitting}
              className="bg-orange hover:bg-orange-hover disabled:opacity-50 text-white
                         font-condensed font-semibold px-5 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Invoice'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="text-white/50 hover:text-white px-5 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <p className="text-white/50 text-sm">
            {filter ? `No ${filter} invoices.` : 'No invoices yet — create your first one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const meta       = STATUS_META[inv.status] ?? STATUS_META.draft
            const isExpanded = expandedId === inv.id
            const items      = (inv.items ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            return (
              <div key={inv.id} className="rounded-xl border border-dark-border bg-dark-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-condensed font-bold text-lg text-white">
                        #{inv.invoice_number}
                      </span>
                      <span className={`rounded-full text-xs px-2 py-0.5 ${meta.badge}`}>{meta.label}</span>
                      {inv.recurring_invoice_id && (
                        <span className="rounded-full bg-orange/15 text-orange text-xs px-2 py-0.5">Recurring</span>
                      )}
                    </div>
                    <p className="text-white/50 text-sm mt-0.5 truncate">
                      {inv.customer?.full_name ?? 'No customer'}
                      {inv.property ? ` · ${inv.property.name || inv.property.address}` : ''}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      Issued {fmtDate(inv.invoice_date)}
                      {inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}
                      {inv.paid_at ? ` · paid ${fmtDate(inv.paid_at)}` : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-white font-medium">{fmtMoney(inv.total)}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-dark-border p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-white/40 text-xs">
                          <th className="text-left  font-medium pb-2">Description</th>
                          <th className="text-right font-medium pb-2">Qty</th>
                          <th className="text-right font-medium pb-2">Rate</th>
                          <th className="text-right font-medium pb-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-white/70">
                        {items.map((l, i) => (
                          <tr key={l.id ?? i} className="border-t border-dark-border">
                            <td className="py-2 pr-2">{l.description}</td>
                            <td className="py-2 text-right">{Number(l.quantity)}</td>
                            <td className="py-2 text-right">{fmtMoney(l.unit_price)}</td>
                            <td className="py-2 text-right text-white">{fmtMoney(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-3 text-sm space-y-1 max-w-xs ml-auto">
                      <div className="flex justify-between text-white/50">
                        <span>Subtotal</span><span className="text-white">{fmtMoney(inv.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-white/50">
                        <span>Tax ({inv.tax_percent ?? 0}%)</span>
                        <span className="text-white">{fmtMoney(inv.tax_amount)}</span>
                      </div>
                      <div className="flex justify-between font-medium pt-1.5 border-t border-dark-border">
                        <span className="text-white">Total</span>
                        <span className="text-orange">{fmtMoney(inv.total)}</span>
                      </div>
                    </div>

                    {inv.notes && (
                      <p className="mt-3 text-xs text-white/50 whitespace-pre-wrap">{inv.notes}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1 mt-4 pt-3 border-t border-dark-border">
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => void sendInvoice(inv)}
                          disabled={busyId === inv.id}
                          className="bg-orange hover:bg-orange-hover disabled:opacity-40 text-white text-xs
                                     font-condensed font-semibold px-4 py-2 rounded-lg min-h-[40px] transition-colors"
                        >
                          {busyId === inv.id ? 'Working…' : inv.sent_at ? 'Resend' : 'Send Invoice'}
                        </button>
                      )}
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => void setStatus(inv, 'paid')}
                          disabled={busyId === inv.id}
                          className="text-xs text-success hover:bg-success/10 disabled:opacity-40
                                     rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                        >
                          Mark as Paid
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <button
                          onClick={() => void setStatus(inv, 'sent')}
                          disabled={busyId === inv.id}
                          className="text-xs text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-40
                                     rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                        >
                          Undo Payment
                        </button>
                      )}
                      <a
                        href={`/invoices/${inv.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg px-4 py-2
                                   min-h-[40px] flex items-center transition-colors"
                      >
                        Download PDF
                      </a>
                      <button
                        onClick={() => void deleteInvoice(inv)}
                        disabled={busyId === inv.id}
                        className="text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                                   rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
