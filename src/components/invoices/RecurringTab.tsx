'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Customer, Property, RecurringInvoice, RecurringFrequency, InvoiceLineItem } from '@/types/lawn'
import { FREQUENCY_LABELS, DAY_OF_WEEK_LABELS, monthlyValue, templateTotal } from '@/lib/lawn/recurring'

const fmtMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

const FREQUENCIES: RecurringFrequency[] =
  ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual']

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

const emptyLine = (): InvoiceLineItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 })

const emptyForm = () => ({
  title: '', customer_id: '', property_id: '',
  frequency: 'monthly' as RecurringFrequency,
  day_of_week: '0', day_of_month: '1',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  line_items: [emptyLine()] as InvoiceLineItem[],
  tax_percent: 0,
  auto_send: false,
  notes: '',
})

type Form = ReturnType<typeof emptyForm>

export default function RecurringTab() {
  const [recurring,  setRecurring]  = useState<RecurringInvoice[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState<Form>(emptyForm)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyId,     setBusyId]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/lawn/recurring-invoices')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load recurring invoices.')
      setRecurring(json.recurring)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recurring invoices.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

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

  // Monthly recurring revenue — active templates only, normalized to a month
  const mrr = recurring
    .filter(r => r.active)
    .reduce((sum, r) => sum + monthlyValue(r.line_items ?? [], Number(r.tax_percent) || 0, r.frequency), 0)

  const customerProperties = properties.filter(p => p.customer_id === form.customer_id)
  const isWeekly = form.frequency === 'weekly' || form.frequency === 'biweekly'
  const formTotals = templateTotal(form.line_items, Number(form.tax_percent) || 0)

  function updateLine(idx: number, patch: Partial<InvoiceLineItem>) {
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.title.trim())  { setFormError('Give this recurring invoice a title.'); return }
    if (!form.customer_id)   { setFormError('Choose a customer.'); return }
    if (!form.line_items.some(l => l.description.trim())) {
      setFormError('Add at least one line item with a description.')
      return
    }
    if (form.end_date && form.end_date < form.start_date) {
      setFormError('End date must fall after the start date.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/lawn/recurring-invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          property_id:  form.property_id || null,
          end_date:     form.end_date || null,
          day_of_week:  isWeekly  ? Number(form.day_of_week)  : null,
          day_of_month: !isWeekly ? Number(form.day_of_month) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the recurring invoice.')
      setShowForm(false)
      setForm(emptyForm())
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the recurring invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  async function togglePause(r: RecurringInvoice) {
    setBusyId(r.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/recurring-invoices/${r.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: !r.active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not update the recurring invoice.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the recurring invoice.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelRecurring(r: RecurringInvoice) {
    if (!window.confirm(`Cancel "${r.title}"? This deletes the template — invoices already generated are kept.`)) return
    setBusyId(r.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/recurring-invoices/${r.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not cancel the recurring invoice.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the recurring invoice.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {/* MRR banner */}
      <div className="rounded-xl border border-orange/30 bg-orange/10 p-4 mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-white/50 text-xs uppercase tracking-wide">Monthly recurring revenue</p>
          <p className="font-condensed font-bold text-3xl text-orange">{fmtMoney(mrr)}</p>
        </div>
        <p className="text-white/40 text-xs text-right">
          {recurring.filter(r => r.active).length} active
          {recurring.some(r => !r.active) ? ` · ${recurring.filter(r => !r.active).length} paused` : ''}
        </p>
      </div>

      <div className="flex justify-end mb-5">
        <button
          onClick={() => { setForm(emptyForm()); setFormError(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-orange hover:bg-orange-hover text-white
                     font-condensed font-semibold px-4 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Recurring Invoice
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5"
        >
          <h2 className="font-condensed font-bold text-lg text-white mb-4">New Recurring Invoice</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title *</label>
              <input
                type="text" value={form.title} required
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Weekly lawn maintenance" className={inputCls}
              />
            </div>
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

            <div>
              <label className={labelCls}>Frequency *</label>
              <select
                value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value as RecurringFrequency })}
                className={inputCls}
              >
                {FREQUENCIES.map(f => (
                  <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isWeekly ? 'Day of week' : 'Day of month'}</label>
              {isWeekly ? (
                <select
                  value={form.day_of_week}
                  onChange={e => setForm({ ...form, day_of_week: e.target.value })}
                  className={inputCls}
                >
                  {DAY_OF_WEEK_LABELS.map((d, i) => (
                    <option key={d} value={String(i)}>{d}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number" min="1" max="31" inputMode="numeric" value={form.day_of_month}
                  onChange={e => setForm({ ...form, day_of_month: e.target.value })}
                  className={inputCls}
                />
              )}
            </div>

            <div>
              <label className={labelCls}>Start date *</label>
              <input
                type="date" value={form.start_date} required
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End date (optional)</label>
              <input
                type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className={inputCls}
              />
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
                    placeholder="Mow, trim &amp; blow"
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
            <div className="flex items-end">
              <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox" checked={form.auto_send}
                  onChange={e => setForm({ ...form, auto_send: e.target.checked })}
                  className="w-5 h-5 rounded accent-orange"
                />
                <span className="text-sm text-white">
                  Auto-send by email
                  <span className="block text-xs text-white/40">Emails the customer the day it generates</span>
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                value={form.notes} rows={2}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className={`${inputCls} resize-y`}
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-dark-lighter p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-white/50">
              <span>Per invoice</span><span className="text-white">{fmtMoney(formTotals.total)}</span>
            </div>
            <div className="flex justify-between font-medium pt-1.5 border-t border-dark-border">
              <span className="text-white">Adds to monthly revenue</span>
              <span className="text-orange">
                {fmtMoney(monthlyValue(form.line_items, Number(form.tax_percent) || 0, form.frequency))}
              </span>
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
              {submitting ? 'Saving…' : 'Create Recurring Invoice'}
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
        <p className="text-white/40 text-sm py-8 text-center">Loading recurring invoices…</p>
      ) : recurring.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <p className="text-white/50 text-sm">
            No recurring invoices yet — set one up to bill customers automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map(r => {
            const totals = templateTotal(r.line_items ?? [], Number(r.tax_percent) || 0)
            return (
              <div
                key={r.id}
                className={`rounded-xl border bg-dark-card p-4 ${
                  r.active ? 'border-dark-border' : 'border-dark-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-condensed font-bold text-lg text-white">{r.title}</p>
                      <span className={`rounded-full text-xs px-2 py-0.5 ${
                        r.active ? 'bg-success/20 text-success' : 'bg-white/10 text-white/40'
                      }`}>
                        {r.active ? 'Active' : 'Paused'}
                      </span>
                      {r.auto_send && (
                        <span className="rounded-full bg-blue/20 text-blue-light text-xs px-2 py-0.5">
                          Auto-send
                        </span>
                      )}
                    </div>
                    <p className="text-white/50 text-sm mt-0.5 truncate">
                      {r.customer?.full_name ?? 'No customer'}
                      {r.property ? ` · ${r.property.name || r.property.address}` : ''}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      {FREQUENCY_LABELS[r.frequency]}
                      {r.day_of_week  != null ? ` on ${DAY_OF_WEEK_LABELS[r.day_of_week]}` : ''}
                      {r.day_of_month != null ? ` on day ${r.day_of_month}` : ''}
                      {' · '}next invoice {fmtDate(r.next_invoice_date)}
                      {r.end_date ? ` · ends ${fmtDate(r.end_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-white font-medium">{fmtMoney(totals.total)}</p>
                    <p className="text-white/40 text-xs">
                      {fmtMoney(monthlyValue(r.line_items ?? [], Number(r.tax_percent) || 0, r.frequency))}/mo
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1 mt-3 pt-3 border-t border-dark-border">
                  <button
                    onClick={() => void togglePause(r)}
                    disabled={busyId === r.id}
                    className="text-xs text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-40
                               rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                  >
                    {busyId === r.id ? 'Working…' : r.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => void cancelRecurring(r)}
                    disabled={busyId === r.id}
                    className="text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                               rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
