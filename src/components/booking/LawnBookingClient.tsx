'use client'

import { useState } from 'react'

interface Props {
  slug:          string
  businessName:  string
  businessPhone: string | null
  serviceArea:   string | null
  logoUrl:       string | null
  services:      string[]
}

const CUSTOM = 'Custom Service'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const field =
  'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-3 text-[15px] text-gray-900 ' +
  'placeholder:text-gray-400 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 transition-colors'

const label = 'block text-sm font-medium text-gray-700 mb-1.5'

export default function LawnBookingClient({
  slug, businessName, businessPhone, serviceArea, logoUrl, services,
}: Props) {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [address,  setAddress]  = useState('')
  const [service,  setService]  = useState('')
  const [custom,   setCustom]   = useState('')
  const [date,     setDate]     = useState('')
  const [notes,    setNotes]    = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState(false)

  const isCustom = service === CUSTOM

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const chosenService = isCustom ? custom.trim() : service
    if (!name.trim())                      return setError('Please enter your name.')
    if (!EMAIL_RE.test(email.trim()))      return setError('Please enter a valid email address.')
    if (phone.replace(/\D/g, '').length < 10) return setError('Please enter a valid phone number.')
    if (!address.trim())                   return setError('Please enter your property address.')
    if (!chosenService)                    return setError('Please choose a service.')
    if (!date)                             return setError('Please choose a preferred date.')

    setSubmitting(true)
    try {
      const res = await fetch(`/api/book/${slug}/lawn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           name.trim(),
          email:          email.trim(),
          phone:          phone.trim(),
          address:        address.trim(),
          service:        chosenService,
          preferred_date: date,
          notes:          notes.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not submit your booking.')
      setDone(true)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your booking.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* Header */}
      <header
        className="px-5 py-8 sm:py-12 text-white"
        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #052e16 100%)' }}
      >
        <div className="max-w-xl mx-auto flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              className="h-14 w-14 rounded-xl object-cover bg-white/10 flex-shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path d="M12 22c4-2 7-6 7-11a7 7 0 0 0-14 0c0 5 3 9 7 11z" />
                <path d="M12 22V8" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{businessName}</h1>
            <p className="text-white/80 text-sm">
              {serviceArea ? serviceArea : 'Request a service online'}
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-5 py-6 sm:py-10">
        <div className="max-w-xl mx-auto">
          {done ? (
            <div className="rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Request received!</h2>
              <p className="mt-2 text-gray-600 text-sm">
                Thanks, {name.split(' ')[0] || 'there'}. {businessName} has your request and will reach out
                shortly to confirm. A confirmation email is on its way to {email}.
              </p>
              {businessPhone && (
                <p className="mt-4 text-sm text-gray-500">
                  Questions? Call <a href={`tel:${businessPhone}`} className="text-green-700 font-medium">{businessPhone}</a>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Book a service</h2>
              <p className="text-sm text-gray-500 mb-5">
                Fill in the details below and we&apos;ll get back to you to confirm.
              </p>

              <div className="space-y-4">
                <div>
                  <label className={label}>Full name *</label>
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Jane Doe" className={field} autoComplete="name"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Email *</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="jane@example.com" className={field} autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className={label}>Phone *</label>
                    <input
                      type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="(555) 123-4567" className={field} autoComplete="tel"
                    />
                  </div>
                </div>

                <div>
                  <label className={label}>Property address *</label>
                  <input
                    type="text" value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="123 Oak Street, Springfield" className={field} autoComplete="street-address"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Service requested *</label>
                    <select value={service} onChange={e => setService(e.target.value)} className={field}>
                      <option value="">Choose a service…</option>
                      {services.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Preferred date *</label>
                    <input
                      type="date" value={date} min={todayISO()}
                      onChange={e => setDate(e.target.value)} className={field}
                    />
                  </div>
                </div>

                {isCustom && (
                  <div>
                    <label className={label}>Describe the service *</label>
                    <input
                      type="text" value={custom} onChange={e => setCustom(e.target.value)}
                      placeholder="Tell us what you need" className={field}
                    />
                  </div>
                )}

                <div>
                  <label className={label}>Notes (optional)</label>
                  <textarea
                    value={notes} rows={3} onChange={e => setNotes(e.target.value)}
                    placeholder="Gate code, dog on property, anything we should know…"
                    className={`${field} resize-y`}
                  />
                </div>
              </div>

              {error && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit" disabled={submitting}
                className="mt-6 w-full rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60
                           text-white font-semibold text-[15px] py-3.5 min-h-[48px] transition-colors"
              >
                {submitting ? 'Submitting…' : 'Request Booking'}
              </button>
              <p className="mt-3 text-center text-xs text-gray-400">
                This is a request — {businessName} will confirm your appointment.
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            Powered by LawnPlatform
          </p>
        </div>
      </main>
    </div>
  )
}
