'use client'

// Google review link for the landscaping review request
// (lib/landscaping/review-requests.ts, sent once when an invoice is marked paid).
// Writes profiles.google_review_url via PUT /api/user/profile.
// Deliberately NOT the TorqueWrench settings: that is a separate, gated review
// pipeline, and using both would let a customer get two review texts.

import { useState } from 'react'

export default function GoogleReviewUrlCard({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl]       = useState(initialUrl ?? '')
  const [saved, setSaved]   = useState(initialUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [done, setDone]     = useState(false)

  const dirty = url.trim() !== saved

  async function save() {
    setSaving(true)
    setError(null)
    setDone(false)
    try {
      const res  = await fetch('/api/user/profile', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ google_review_url: url.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not save the review link.')
      setSaved(url.trim())
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the review link.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#333] bg-[#222] px-5 py-4 mb-6">
      <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Reviews</p>
      <label htmlFor="google-review-url" className="font-semibold text-white text-sm block">
        Google review link
      </label>
      <p className="text-white/40 text-xs mt-0.5 mb-3">
        When you mark an invoice paid, the customer gets one text with this link.
        Find it in your Google Business Profile under &ldquo;Ask for reviews&rdquo;.
        Leave blank to send no review requests.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="google-review-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setDone(false) }}
          placeholder="https://g.page/r/..."
          className="nwi-input text-sm flex-1"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary text-sm px-5 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-danger text-xs mt-2">{error}</p>}
      {done && !error && (
        <p className="text-success text-xs mt-2">
          {saved ? 'Saved. Review requests will use this link.' : 'Cleared. No review requests will be sent.'}
        </p>
      )}
    </div>
  )
}
