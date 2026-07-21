'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Customer, Property, LawnJob, LawnJobStatus, JobService } from '@/types/lawn'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO(): string {
  return toISO(new Date())
}

/** Sunday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(12, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

const fmtDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })

const fmtLongDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

const fmtTime = (t: string | null) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Status colors: blue scheduled, amber in progress, green completed
const STATUS_META: Record<LawnJobStatus, { label: string; badge: string; bar: string }> = {
  scheduled:   { label: 'Scheduled',   badge: 'bg-blue/20 text-blue-light',      bar: 'border-l-blue' },
  in_progress: { label: 'In Progress', badge: 'bg-amber-500/20 text-amber-400',  bar: 'border-l-amber-500' },
  completed:   { label: 'Completed',   badge: 'bg-success/20 text-success',      bar: 'border-l-success' },
  cancelled:   { label: 'Cancelled',   badge: 'bg-white/10 text-white/40',       bar: 'border-l-white/20' },
}

const NEXT_STATUS: Partial<Record<LawnJobStatus, LawnJobStatus>> = {
  scheduled:   'in_progress',
  in_progress: 'completed',
}

const NEXT_STATUS_LABEL: Partial<Record<LawnJobStatus, string>> = {
  scheduled:   'Start Job',
  in_progress: 'Complete',
}

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

const emptyService = (): JobService => ({ service_name: '', quantity: 1, unit_price: 0, total: 0 })

const emptyForm = () => ({
  customer_id: '', property_id: '', title: '', description: '',
  scheduled_date: todayISO(), scheduled_time: '', duration_minutes: '',
  crew_notes: '', services: [emptyService()] as JobService[],
})

type Form = ReturnType<typeof emptyForm>

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleClient() {
  const [weekStart,  setWeekStart]  = useState(() => startOfWeek(new Date()))
  const [jobs,       setJobs]       = useState<LawnJob[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const [selectedDay, setSelectedDay] = useState<string>(todayISO())
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [form,        setForm]        = useState<Form>(emptyForm)
  const [formError,   setFormError]   = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [busyJobId,   setBusyJobId]   = useState<string | null>(null)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i))),
    [weekStart],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = weekDays[0]
      const to   = weekDays[6]
      const res  = await fetch(`/api/lawn/jobs?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load the schedule.')
      setJobs(json.jobs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the schedule.')
    } finally {
      setLoading(false)
    }
  }, [weekDays])

  useEffect(() => { void load() }, [load])

  // Customers and properties power the new-job form's selects
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

  const jobsByDay = useMemo(() => {
    const map: Record<string, LawnJob[]> = {}
    for (const day of weekDays) map[day] = []
    for (const job of jobs) {
      const key = job.scheduled_date?.slice(0, 10)
      if (key && map[key]) map[key].push(job)
    }
    return map
  }, [jobs, weekDays])

  const dayJobs = jobsByDay[selectedDay] ?? []

  const customerProperties = properties.filter(p => p.customer_id === form.customer_id)

  const servicesTotal = form.services.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0,
  )

  // ── Form handling ──

  function openCreate(day?: string) {
    setEditingId(null)
    setForm({ ...emptyForm(), scheduled_date: day ?? selectedDay })
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(job: LawnJob) {
    setEditingId(job.id)
    setForm({
      customer_id:      job.customer_id ?? '',
      property_id:      job.property_id ?? '',
      title:            job.title       ?? '',
      description:      job.description ?? '',
      scheduled_date:   job.scheduled_date.slice(0, 10),
      scheduled_time:   job.scheduled_time?.slice(0, 5) ?? '',
      duration_minutes: job.duration_minutes != null ? String(job.duration_minutes) : '',
      crew_notes:       job.crew_notes ?? '',
      services:         job.services && job.services.length > 0
        ? job.services.map(s => ({
            service_name: s.service_name,
            quantity:     Number(s.quantity),
            unit_price:   Number(s.unit_price),
            total:        Number(s.total),
          }))
        : [emptyService()],
    })
    setFormError(null)
    setShowForm(true)
  }

  function updateService(idx: number, patch: Partial<JobService>) {
    setForm(f => {
      const services = f.services.map((s, i) => (i === idx ? { ...s, ...patch } : s))
      return { ...f, services }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.title.trim()) { setFormError('A job title is required.'); return }
    if (!form.scheduled_date) { setFormError('Pick a date for this job.'); return }
    if (form.duration_minutes && Number(form.duration_minutes) <= 0) {
      setFormError('Duration must be greater than zero.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        property_id: form.property_id || null,
        customer_id: form.customer_id || null,
        services:    form.services.filter(s => s.service_name.trim()),
      }
      const res = await fetch(
        editingId ? `/api/lawn/jobs/${editingId}` : '/api/lawn/jobs',
        {
          method:  editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the job.')
      setShowForm(false)
      setEditingId(null)
      setSelectedDay(form.scheduled_date)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the job.')
    } finally {
      setSubmitting(false)
    }
  }

  async function advanceStatus(job: LawnJob) {
    const next = NEXT_STATUS[job.status]
    if (!next) return
    setBusyJobId(job.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/jobs/${job.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not update the job.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the job.')
    } finally {
      setBusyJobId(null)
    }
  }

  async function cancelJob(job: LawnJob) {
    if (!window.confirm(`Cancel "${job.title ?? 'this job'}"?`)) return
    setBusyJobId(job.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/jobs/${job.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'cancelled' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not cancel the job.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the job.')
    } finally {
      setBusyJobId(null)
    }
  }

  async function deleteJob(job: LawnJob) {
    if (!window.confirm(`Permanently delete "${job.title ?? 'this job'}"?`)) return
    setBusyJobId(job.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/jobs/${job.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the job.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the job.')
    } finally {
      setBusyJobId(null)
    }
  }

  // ── Render ──

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={() => { setWeekStart(startOfWeek(new Date())); setSelectedDay(todayISO()) }}
            className="text-xs text-white/50 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 min-h-[40px] transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 bg-orange hover:bg-orange-hover text-white font-condensed font-semibold
                     px-4 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Job
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Weekly calendar — horizontally scrollable on phones */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {weekDays.map(day => {
          const isToday    = day === todayISO()
          const isSelected = day === selectedDay
          const dayList    = jobsByDay[day] ?? []
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`text-left rounded-xl border p-2.5 min-h-[92px] transition-colors ${
                isSelected
                  ? 'border-orange bg-orange/10'
                  : 'border-dark-border bg-dark-card hover:border-orange/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-medium ${isToday ? 'text-orange' : 'text-white/50'}`}>
                  {fmtDayLabel(day)}
                </span>
                {dayList.length > 0 && (
                  <span className="text-[10px] text-white/40">{dayList.length}</span>
                )}
              </div>
              <div className="space-y-1">
                {dayList.slice(0, 3).map(j => (
                  <div
                    key={j.id}
                    className={`text-[11px] truncate rounded px-1.5 py-0.5 ${STATUS_META[j.status].badge}`}
                  >
                    {fmtTime(j.scheduled_time) ? `${fmtTime(j.scheduled_time)} ` : ''}{j.title}
                  </div>
                ))}
                {dayList.length > 3 && (
                  <div className="text-[10px] text-white/30">+{dayList.length - 3} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Add / edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5"
        >
          <h2 className="font-condensed font-bold text-lg text-white mb-4">
            {editingId ? 'Edit Job' : 'New Job'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="sm:col-span-2">
              <label className={labelCls}>Job title *</label>
              <input
                type="text" value={form.title} required
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Weekly mow &amp; edge" className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Date *</label>
              <input
                type="date" value={form.scheduled_date} required
                onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Time</label>
                <input
                  type="time" value={form.scheduled_time}
                  onChange={e => setForm({ ...form, scheduled_time: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Minutes</label>
                <input
                  type="number" min="1" inputMode="numeric" value={form.duration_minutes}
                  onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
                  placeholder="45" className={inputCls}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea
                value={form.description} rows={2}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className={`${inputCls} resize-y`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Crew notes</label>
              <textarea
                value={form.crew_notes} rows={2}
                onChange={e => setForm({ ...form, crew_notes: e.target.value })}
                placeholder="Bring the 21&quot; mower — back gate is narrow."
                className={`${inputCls} resize-y`}
              />
            </div>
          </div>

          {/* Services */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Services</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, services: [...f.services, emptyService()] }))}
                className="text-xs text-orange hover:underline"
              >
                + Add service
              </button>
            </div>
            <div className="space-y-2">
              {form.services.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text" value={s.service_name}
                    onChange={e => updateService(i, { service_name: e.target.value })}
                    placeholder="Mow, trim &amp; blow"
                    className={`${inputCls} col-span-12 sm:col-span-6`}
                  />
                  <input
                    type="number" min="0" step="0.5" inputMode="decimal" value={s.quantity}
                    onChange={e => updateService(i, { quantity: Number(e.target.value) })}
                    placeholder="Qty" className={`${inputCls} col-span-4 sm:col-span-2`}
                  />
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal" value={s.unit_price}
                    onChange={e => updateService(i, { unit_price: Number(e.target.value) })}
                    placeholder="Rate" className={`${inputCls} col-span-5 sm:col-span-3`}
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      services: f.services.length > 1 ? f.services.filter((_, x) => x !== i) : f.services,
                    }))}
                    aria-label="Remove service"
                    className="col-span-3 sm:col-span-1 text-white/30 hover:text-danger text-sm min-h-[44px] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-right text-sm text-white/50 mt-2">
              Job total <span className="text-white font-medium">{fmtMoney(servicesTotal)}</span>
            </p>
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
              {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Schedule Job'}
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

      {/* Selected day's job list */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-condensed font-bold text-xl text-white tracking-wide">
          {selectedDay === todayISO() ? "TODAY'S JOBS" : fmtLongDate(selectedDay).toUpperCase()}
        </h2>
        <button
          onClick={() => openCreate(selectedDay)}
          className="text-xs text-orange hover:underline"
        >
          + Add to this day
        </button>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Loading schedule…</p>
      ) : dayJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <p className="text-white/50 text-sm">Nothing scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayJobs.map(job => {
            const meta      = STATUS_META[job.status]
            const nextLabel = NEXT_STATUS_LABEL[job.status]
            const jobTotal  = (job.services ?? []).reduce((s, x) => s + (Number(x.total) || 0), 0)
            return (
              <div
                key={job.id}
                className={`rounded-xl border border-dark-border border-l-4 ${meta.bar} bg-dark-card p-4`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-condensed font-bold text-lg text-white">{job.title}</p>
                      <span className={`rounded-full text-xs px-2 py-0.5 ${meta.badge}`}>{meta.label}</span>
                    </div>
                    <p className="text-white/50 text-sm mt-0.5">
                      {fmtTime(job.scheduled_time) ?? 'No time set'}
                      {job.duration_minutes ? ` · ${job.duration_minutes} min` : ''}
                      {job.customer?.full_name ? ` · ${job.customer.full_name}` : ''}
                    </p>
                    {job.property && (
                      <p className="text-white/40 text-xs mt-1">
                        {job.property.name || job.property.address}
                        {job.property.gate_code   ? ` · Gate ${job.property.gate_code}` : ''}
                        {job.property.dog_on_property ? ' · 🐕 Dog on property' : ''}
                      </p>
                    )}
                    {job.description && (
                      <p className="text-white/50 text-sm mt-2 whitespace-pre-wrap">{job.description}</p>
                    )}
                    {job.crew_notes && (
                      <p className="text-amber-400/80 text-xs mt-2 whitespace-pre-wrap">
                        Crew: {job.crew_notes}
                      </p>
                    )}
                    {(job.services?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {job.services!.map(s => (
                          <li key={s.id ?? s.service_name} className="text-xs text-white/40">
                            {s.service_name} × {Number(s.quantity)} — {fmtMoney(Number(s.total))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {jobTotal > 0 && (
                    <span className="flex-shrink-0 text-white font-medium text-sm">{fmtMoney(jobTotal)}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1 mt-3 pt-3 border-t border-dark-border">
                  {nextLabel && (
                    <button
                      onClick={() => void advanceStatus(job)}
                      disabled={busyJobId === job.id}
                      className="bg-orange hover:bg-orange-hover disabled:opacity-40 text-white text-xs
                                 font-condensed font-semibold px-4 py-2 rounded-lg min-h-[40px] transition-colors"
                    >
                      {busyJobId === job.id ? 'Working…' : nextLabel}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(job)}
                    className="text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                  >
                    Edit
                  </button>
                  {job.status !== 'cancelled' && (
                    <button
                      onClick={() => void cancelJob(job)}
                      disabled={busyJobId === job.id}
                      className="text-xs text-white/40 hover:text-white/70 hover:bg-white/5 disabled:opacity-40
                                 rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => void deleteJob(job)}
                    disabled={busyJobId === job.id}
                    className="text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                               rounded-lg px-4 py-2 min-h-[40px] transition-colors"
                  >
                    Delete
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
