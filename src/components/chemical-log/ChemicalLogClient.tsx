'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  ChemicalLog, ChemicalUnit, ChemicalMethod, Customer, Property,
} from '@/types/lawn'

// ─── Constants & helpers ────────────────────────────────────────────────────────

const UNITS:   ChemicalUnit[]   = ['oz', 'lb', 'gal', 'qt']
const METHODS: ChemicalMethod[] = ['spray', 'granular', 'liquid', 'other']

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const fmtNum = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? '' : String(Number(n))

const emptyForm = () => ({
  property_id: '', customer_id: '', product_name: '', manufacturer: '',
  epa_registration_number: '', application_date: todayISO(), application_time: '',
  target_area: '', area_treated_sqft: '', rate_per_1000sqft: '', total_amount_applied: '',
  unit: '' as '' | ChemicalUnit, application_method: '' as '' | ChemicalMethod,
  wind_speed_mph: '', temperature_f: '', reentry_interval_hours: '',
  is_organic: false, notes: '',
})

type Form = ReturnType<typeof emptyForm>

// ─── CSV export ─────────────────────────────────────────────────────────────────

const CSV_COLUMNS: { header: string; value: (l: ChemicalLog) => string | number | null }[] = [
  { header: 'Application Date',   value: l => l.application_date },
  { header: 'Application Time',   value: l => l.application_time ?? '' },
  { header: 'Product',            value: l => l.product_name },
  { header: 'Manufacturer',       value: l => l.manufacturer ?? '' },
  { header: 'EPA Reg #',          value: l => l.epa_registration_number ?? '' },
  { header: 'Organic',            value: l => (l.is_organic ? 'Yes' : 'No') },
  { header: 'Property',           value: l => l.property?.name ?? l.property?.address ?? '' },
  { header: 'Customer',           value: l => l.customer?.full_name ?? '' },
  { header: 'Target Area',        value: l => l.target_area ?? '' },
  { header: 'Area Treated (sqft)', value: l => l.area_treated_sqft ?? '' },
  { header: 'Rate / 1000 sqft',   value: l => l.rate_per_1000sqft ?? '' },
  { header: 'Total Applied',      value: l => l.total_amount_applied ?? '' },
  { header: 'Unit',               value: l => l.unit ?? '' },
  { header: 'Method',             value: l => l.application_method ?? '' },
  { header: 'Wind (mph)',         value: l => l.wind_speed_mph ?? '' },
  { header: 'Temp (°F)',          value: l => l.temperature_f ?? '' },
  { header: 'Re-entry (hrs)',     value: l => l.reentry_interval_hours ?? '' },
  { header: 'Notes',              value: l => l.notes ?? '' },
]

function toCsv(logs: ChemicalLog[]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = CSV_COLUMNS.map(c => esc(c.header)).join(',')
  const rows = logs.map(l => CSV_COLUMNS.map(c => esc(c.value(l))).join(','))
  return [head, ...rows].join('\r\n')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChemicalLogClient() {
  const [logs,       setLogs]       = useState<ChemicalLog[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  // Filters
  const [fFrom,     setFFrom]     = useState('')
  const [fTo,       setFTo]       = useState('')
  const [fProperty, setFProperty] = useState('')
  const [fOrganic,  setFOrganic]  = useState<'' | 'true' | 'false'>('')

  // Form
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<Form>(emptyForm)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (fFrom)     qs.set('from', fFrom)
      if (fTo)       qs.set('to', fTo)
      if (fProperty) qs.set('property_id', fProperty)
      if (fOrganic)  qs.set('organic', fOrganic)
      const res  = await fetch(`/api/lawn/chemical-logs?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load chemical logs.')
      setLogs(json.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chemical logs.')
    } finally {
      setLoading(false)
    }
  }, [fFrom, fTo, fProperty, fOrganic])

  useEffect(() => { void load() }, [load])

  // Properties & customers power the form selects
  useEffect(() => {
    fetch('/api/lawn/properties')
      .then(r => r.json())
      .then(j => { if (Array.isArray(j.properties)) setProperties(j.properties) })
      .catch(() => {})
    fetch('/api/lawn/customers')
      .then(r => r.json())
      .then(j => { if (Array.isArray(j.customers)) setCustomers(j.customers) })
      .catch(() => {})
  }, [])

  const customerProperties = useMemo(
    () => (form.customer_id ? properties.filter(p => p.customer_id === form.customer_id) : properties),
    [properties, form.customer_id],
  )

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(l: ChemicalLog) {
    setEditingId(l.id)
    setForm({
      property_id:             l.property_id ?? '',
      customer_id:             l.customer_id ?? '',
      product_name:            l.product_name,
      manufacturer:            l.manufacturer ?? '',
      epa_registration_number: l.epa_registration_number ?? '',
      application_date:        l.application_date.slice(0, 10),
      application_time:        l.application_time?.slice(0, 5) ?? '',
      target_area:             l.target_area ?? '',
      area_treated_sqft:       fmtNum(l.area_treated_sqft),
      rate_per_1000sqft:       fmtNum(l.rate_per_1000sqft),
      total_amount_applied:    fmtNum(l.total_amount_applied),
      unit:                    l.unit ?? '',
      application_method:      l.application_method ?? '',
      wind_speed_mph:          fmtNum(l.wind_speed_mph),
      temperature_f:           fmtNum(l.temperature_f),
      reentry_interval_hours:  fmtNum(l.reentry_interval_hours),
      is_organic:              l.is_organic,
      notes:                   l.notes ?? '',
    })
    setFormError(null)
    setShowForm(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.product_name.trim()) { setFormError('A product name is required.'); return }
    if (!form.application_date)     { setFormError('Pick an application date.'); return }

    setSubmitting(true)
    try {
      const payload = { ...form, unit: form.unit || null, application_method: form.application_method || null }
      const res = await fetch(
        editingId ? `/api/lawn/chemical-logs/${editingId}` : '/api/lawn/chemical-logs',
        {
          method:  editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the application.')
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the application.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(l: ChemicalLog) {
    if (!window.confirm(`Delete the ${l.product_name} application from ${fmtDate(l.application_date)}?`)) return
    setDeletingId(l.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/chemical-logs/${l.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the application.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the application.')
    } finally {
      setDeletingId(null)
    }
  }

  function exportCsv() {
    if (logs.length === 0) return
    const blob = new Blob([toCsv(logs)], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `chemical-log-${todayISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setFFrom(''); setFTo(''); setFProperty(''); setFOrganic('')
  }

  const hasFilters = fFrom || fTo || fProperty || fOrganic

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <p className="text-sm text-white/40 flex-1">
          {logs.length} {logs.length === 1 ? 'application' : 'applications'}
          {hasFilters ? ' (filtered)' : ''}
        </p>
        <button
          onClick={exportCsv}
          disabled={logs.length === 0}
          className="flex items-center justify-center gap-2 border border-dark-border text-white/70 hover:text-white
                     hover:border-orange/40 disabled:opacity-40 disabled:hover:border-dark-border
                     px-4 py-2.5 rounded-lg text-sm min-h-[44px] whitespace-nowrap transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 bg-orange hover:bg-orange-hover text-white
                     font-condensed font-semibold px-4 py-2.5 rounded-lg text-sm min-h-[44px] whitespace-nowrap transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Application
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Property</label>
            <select value={fProperty} onChange={e => setFProperty(e.target.value)} className={inputCls}>
              <option value="">All properties</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.address || 'Unnamed'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select
              value={fOrganic}
              onChange={e => setFOrganic(e.target.value as '' | 'true' | 'false')}
              className={inputCls}
            >
              <option value="">Organic &amp; non-organic</option>
              <option value="true">Organic only</option>
              <option value="false">Non-organic only</option>
            </select>
          </div>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="mt-3 text-xs text-orange hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5">
          <h2 className="font-condensed font-bold text-lg text-white mb-4">
            {editingId ? 'Edit Application' : 'New Application'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Product name *</label>
              <input
                type="text" value={form.product_name} required
                onChange={e => setForm({ ...form, product_name: e.target.value })}
                placeholder="Roundup PROMAX" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Manufacturer</label>
              <input
                type="text" value={form.manufacturer}
                onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                placeholder="Bayer" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>EPA registration #</label>
              <input
                type="text" value={form.epa_registration_number}
                onChange={e => setForm({ ...form, epa_registration_number: e.target.value })}
                placeholder="524-579" className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Customer</label>
              <select
                value={form.customer_id}
                onChange={e => setForm({ ...form, customer_id: e.target.value, property_id: '' })}
                className={inputCls}
              >
                <option value="">— No customer —</option>
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
                className={inputCls}
              >
                <option value="">— No property —</option>
                {customerProperties.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.address || 'Unnamed'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Application date *</label>
              <input
                type="date" value={form.application_date} required
                onChange={e => setForm({ ...form, application_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Application time</label>
              <input
                type="time" value={form.application_time}
                onChange={e => setForm({ ...form, application_time: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Target area</label>
              <input
                type="text" value={form.target_area}
                onChange={e => setForm({ ...form, target_area: e.target.value })}
                placeholder="Front lawn, flower beds" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Area treated (sq ft)</label>
              <input
                type="number" min="0" inputMode="numeric" value={form.area_treated_sqft}
                onChange={e => setForm({ ...form, area_treated_sqft: e.target.value })}
                placeholder="5000" className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Rate / 1000 sqft</label>
                <input
                  type="number" min="0" step="0.001" inputMode="decimal" value={form.rate_per_1000sqft}
                  onChange={e => setForm({ ...form, rate_per_1000sqft: e.target.value })}
                  placeholder="2.5" className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Total applied</label>
                <input
                  type="number" min="0" step="0.001" inputMode="decimal" value={form.total_amount_applied}
                  onChange={e => setForm({ ...form, total_amount_applied: e.target.value })}
                  placeholder="12.5" className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unit</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value as '' | ChemicalUnit })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Method</label>
                <select
                  value={form.application_method}
                  onChange={e => setForm({ ...form, application_method: e.target.value as '' | ChemicalMethod })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {METHODS.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <div>
                <label className={labelCls}>Wind (mph)</label>
                <input
                  type="number" min="0" step="0.1" inputMode="decimal" value={form.wind_speed_mph}
                  onChange={e => setForm({ ...form, wind_speed_mph: e.target.value })}
                  placeholder="5" className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Temp (°F)</label>
                <input
                  type="number" step="0.1" inputMode="decimal" value={form.temperature_f}
                  onChange={e => setForm({ ...form, temperature_f: e.target.value })}
                  placeholder="72" className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Re-entry (hrs)</label>
                <input
                  type="number" min="0" step="0.5" inputMode="decimal" value={form.reentry_interval_hours}
                  onChange={e => setForm({ ...form, reentry_interval_hours: e.target.value })}
                  placeholder="24" className={inputCls}
                />
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="is_organic" type="checkbox" checked={form.is_organic}
                onChange={e => setForm({ ...form, is_organic: e.target.checked })}
                className="w-4 h-4 accent-orange"
              />
              <label htmlFor="is_organic" className="text-sm text-white/70 select-none">
                Organic / OMRI-listed product
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                value={form.notes} rows={2}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Spot treatment only. Reapply in 14 days if needed."
                className={`${inputCls} resize-y`}
              />
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
              {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Log Application'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); setFormError(null) }}
              className="text-white/50 hover:text-white px-5 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Loading applications…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <p className="text-white/50 text-sm">
            {hasFilters
              ? 'No applications match these filters.'
              : 'No applications logged yet — record your first one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(l => (
            <div key={l.id} className="rounded-xl border border-dark-border bg-dark-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-condensed font-bold text-lg text-white">{l.product_name}</p>
                    {l.is_organic ? (
                      <span className="rounded-full text-xs px-2 py-0.5 bg-success/20 text-success">Organic</span>
                    ) : (
                      <span className="rounded-full text-xs px-2 py-0.5 bg-white/10 text-white/50">Non-organic</span>
                    )}
                  </div>
                  <p className="text-white/50 text-sm mt-0.5">
                    {fmtDate(l.application_date)}
                    {l.application_time ? ` · ${l.application_time.slice(0, 5)}` : ''}
                    {l.manufacturer ? ` · ${l.manufacturer}` : ''}
                    {l.epa_registration_number ? ` · EPA ${l.epa_registration_number}` : ''}
                  </p>
                  <p className="text-white/40 text-xs mt-1">
                    {l.property?.name || l.property?.address || 'No property'}
                    {l.customer?.full_name ? ` · ${l.customer.full_name}` : ''}
                    {l.target_area ? ` · ${l.target_area}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-white/40">
                    {l.area_treated_sqft != null && <span>{l.area_treated_sqft} sq ft</span>}
                    {l.rate_per_1000sqft != null && <span>Rate {Number(l.rate_per_1000sqft)}/1k</span>}
                    {l.total_amount_applied != null && (
                      <span>Applied {Number(l.total_amount_applied)}{l.unit ? ` ${l.unit}` : ''}</span>
                    )}
                    {l.application_method && <span className="capitalize">{l.application_method}</span>}
                    {l.wind_speed_mph != null && <span>Wind {Number(l.wind_speed_mph)} mph</span>}
                    {l.temperature_f != null && <span>{Number(l.temperature_f)}°F</span>}
                    {l.reentry_interval_hours != null && (
                      <span className="text-amber-400/80">Re-entry {Number(l.reentry_interval_hours)}h</span>
                    )}
                  </div>
                  {l.notes && <p className="text-white/50 text-sm mt-2 whitespace-pre-wrap">{l.notes}</p>}
                </div>
              </div>

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-dark-border">
                <button
                  onClick={() => openEdit(l)}
                  className="text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(l)}
                  disabled={deletingId === l.id}
                  className="text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                             rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                >
                  {deletingId === l.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
