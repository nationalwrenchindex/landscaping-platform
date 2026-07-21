'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Customer } from '@/types/lawn'

const emptyForm = () => ({
  full_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '',
})

type Form = ReturnType<typeof emptyForm>

const inputCls =
  'w-full bg-dark-input border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-white/25 focus:outline-none focus:border-orange transition-colors'

const labelCls = 'block text-xs font-medium text-white/50 mb-1.5'

export default function CustomersClient() {
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<Form>(emptyForm)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = term.trim()
        ? `/api/lawn/customers?search=${encodeURIComponent(term.trim())}`
        : '/api/lawn/customers'
      const res  = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load customers.')
      setCustomers(json.customers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customers.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce so typing in the search box doesn't hammer the API
  useEffect(() => {
    const t = setTimeout(() => { void load(search) }, 250)
    return () => clearTimeout(t)
  }, [search, load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setEditingId(c.id)
    setForm({
      full_name: c.full_name ?? '',
      email:     c.email     ?? '',
      phone:     c.phone     ?? '',
      address:   c.address   ?? '',
      city:      c.city      ?? '',
      state:     c.state     ?? '',
      zip:       c.zip       ?? '',
      notes:     c.notes     ?? '',
    })
    setFormError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.full_name.trim()) {
      setFormError('Customer name is required.')
      return
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(
        editingId ? `/api/lawn/customers/${editingId}` : '/api/lawn/customers',
        {
          method:  editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(form),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the customer.')
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await load(search)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the customer.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(c: Customer) {
    const confirmed = window.confirm(
      `Delete ${c.full_name ?? 'this customer'}? Their properties, jobs and invoices stay linked but the customer record is removed.`,
    )
    if (!confirmed) return

    setDeletingId(c.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/customers/${c.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the customer.')
      await load(search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the customer.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg
            className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or address"
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 bg-orange hover:bg-orange-hover text-white
                     font-condensed font-semibold px-4 py-2.5 rounded-lg text-sm min-h-[44px] whitespace-nowrap transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Customer
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4 sm:p-5"
        >
          <h2 className="font-condensed font-bold text-lg text-white mb-4">
            {editingId ? 'Edit Customer' : 'New Customer'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Name *</label>
              <input
                type="text" value={form.full_name} required
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Jane Doe" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com" className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Billing address</label>
              <input
                type="text" value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="123 Oak Street" className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input
                type="text" value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>State</label>
                <input
                  type="text" value={form.state} maxLength={2}
                  onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ZIP</label>
                <input
                  type="text" value={form.zip}
                  onChange={e => setForm({ ...form, zip: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                value={form.notes} rows={3}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Gate is on the side. Prefers texts."
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
              {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Add Customer'}
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
        <p className="text-white/40 text-sm py-8 text-center">Loading customers…</p>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <p className="text-white/50 text-sm">
            {search ? 'No customers match that search.' : 'No customers yet — add your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {customers.map(c => (
            <div
              key={c.id}
              className="rounded-xl border border-dark-border bg-dark-card p-4 hover:border-orange/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                  <p className="font-condensed font-bold text-lg text-white truncate">
                    {c.full_name ?? 'Unnamed customer'}
                  </p>
                  {c.phone   && <p className="text-white/50 text-sm truncate">{c.phone}</p>}
                  {c.email   && <p className="text-white/40 text-xs truncate">{c.email}</p>}
                  {c.address && <p className="text-white/40 text-xs truncate mt-1">{c.address}</p>}
                </Link>
                <span className="flex-shrink-0 rounded-full bg-orange/15 text-orange text-xs px-2 py-0.5">
                  {c.properties?.length ?? 0} {(c.properties?.length ?? 0) === 1 ? 'property' : 'properties'}
                </span>
              </div>

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-dark-border">
                <Link
                  href={`/customers/${c.id}`}
                  className="flex-1 text-center text-xs text-orange hover:bg-orange/10 rounded-lg px-3 py-2 min-h-[40px]
                             flex items-center justify-center transition-colors"
                >
                  View
                </Link>
                <button
                  onClick={() => openEdit(c)}
                  className="flex-1 text-xs text-white/50 hover:text-white hover:bg-white/5 rounded-lg px-3 py-2 min-h-[40px] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(c)}
                  disabled={deletingId === c.id}
                  className="flex-1 text-xs text-danger/70 hover:text-danger hover:bg-danger/10 disabled:opacity-40
                             rounded-lg px-3 py-2 min-h-[40px] transition-colors"
                >
                  {deletingId === c.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
