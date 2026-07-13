'use client'

import { useEffect, useState, useCallback } from 'react'

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

const EMPTY = {
  product_name: '', product_epa_number: '', application_rate: '', target_area: '',
  target_pest_or_weed: '', application_date: '', re_entry_interval_hours: '', notes: '',
  notify_customer: true,
}

export default function ChemicalLog({ jobId, customerPhone }: { jobId: string; customerPhone?: string | null }) {
  const [logs, setLogs] = useState<ChemLog[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/chemicals`)
      const json = await res.json()
      if (res.ok) setLogs(json.logs ?? [])
    } finally { setLoaded(true) }
  }, [jobId])

  useEffect(() => { load() }, [load])

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form.product_name.trim()) { setError('Product name is required.'); return }
    setSaving(true); setError(null); setFlash(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/chemicals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setForm({ ...EMPTY })
      setAdding(false)
      if (json.sms?.success) setFlash('Saved · re-entry text sent to customer')
      else if (json.sms && !json.sms.success) setFlash('Saved · SMS not sent (' + (json.sms.error || 'no phone') + ')')
      else setFlash('Saved')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/jobs/${jobId}/chemicals?logId=${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const inputCls = 'nwi-input !py-2 text-sm'

  return (
    <div className="border-t border-dark-border pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-white/30 text-[10px] uppercase tracking-widest">Chemical Applications</p>
        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <a
              href={`/jobs/${jobId}/chemical-record`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-light hover:text-blue font-medium"
            >
              🖨️ Printable record
            </a>
          )}
          {!adding && (
            <button onClick={() => { setAdding(true); setFlash(null) }} className="text-xs text-orange hover:text-orange-hover font-medium">
              + Add Chemical
            </button>
          )}
        </div>
      </div>

      {flash && <p className="text-success text-xs">{flash}</p>}

      {!loaded ? (
        <p className="text-white/20 text-xs">Loading…</p>
      ) : (
        <>
          {logs.length === 0 && !adding && <p className="text-white/20 text-xs italic">No chemicals applied on this job.</p>}

          {logs.map(c => (
            <div key={c.id} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{c.product_name}</p>
                  <p className="text-white/40 text-xs">
                    {[c.application_rate, c.target_pest_or_weed, c.target_area].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {c.re_entry_interval_hours != null && (
                    <p className="text-amber-400 text-xs mt-0.5">Re-entry: keep off {c.re_entry_interval_hours}h</p>
                  )}
                </div>
                <button onClick={() => remove(c.id)} className="text-white/30 hover:text-danger text-xs ml-2" aria-label="Delete">×</button>
              </div>
            </div>
          ))}

          {adding && (
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
              <input className={inputCls} placeholder="Product name *" value={form.product_name} onChange={e => set('product_name', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="EPA # (optional)" value={form.product_epa_number} onChange={e => set('product_epa_number', e.target.value)} />
                <input className={inputCls} placeholder="Application rate" value={form.application_rate} onChange={e => set('application_rate', e.target.value)} />
                <input className={inputCls} placeholder="Target area" value={form.target_area} onChange={e => set('target_area', e.target.value)} />
                <input className={inputCls} placeholder="Target pest/weed" value={form.target_pest_or_weed} onChange={e => set('target_pest_or_weed', e.target.value)} />
                <input className={inputCls} type="date" value={form.application_date} onChange={e => set('application_date', e.target.value)} />
                <input className={inputCls} type="number" min="0" placeholder="Re-entry hours" value={form.re_entry_interval_hours} onChange={e => set('re_entry_interval_hours', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input type="checkbox" checked={form.notify_customer} onChange={e => set('notify_customer', e.target.checked)} />
                Text customer a re-entry notice{customerPhone ? '' : ' (no customer phone on file)'}
              </label>
              {error && <p className="text-danger text-xs">{error}</p>}
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="text-xs rounded-lg px-3 py-1.5 font-medium bg-orange hover:bg-orange-hover text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Application'}
                </button>
                <button onClick={() => { setAdding(false); setError(null); setForm({ ...EMPTY }) }} className="text-xs rounded-lg px-3 py-1.5 font-medium border border-white/15 text-white/60 hover:text-white">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
