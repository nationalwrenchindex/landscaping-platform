'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type PhotoType = 'before' | 'after'
interface Photo { id: string; photo_type: PhotoType; url: string | null }

// Downscale to <=1280px longest edge, return base64 (no prefix).
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const maxEdge = 1280
      let { width, height } = img
      if (width > maxEdge || height > maxEdge) {
        const s = maxEdge / Math.max(width, height)
        width = Math.round(width * s); height = Math.round(height * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Could not process image.')); return }
      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      URL.revokeObjectURL(url)
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image.')) }
    img.src = url
  })
}

function Section({ jobId, type, photos, onChange }: {
  jobId: string; type: PhotoType; photos: Photo[]; onChange: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = photos.filter(p => p.photo_type === type)
  const full = mine.length >= 5

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      const { base64, mimeType } = await fileToBase64(file)
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_type: type, imageBase64: base64, mimeType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(id: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos?photoId=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-white/40 text-[11px] uppercase tracking-widest">{type} Photos ({mine.length}/5)</p>
        {!full && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-xs text-orange hover:text-orange-hover font-medium disabled:opacity-50"
          >
            {busy ? 'Uploading…' : '+ Add'}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      {mine.length === 0 ? (
        <p className="text-white/20 text-xs italic">No {type} photos yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {mine.map(p => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-black/20 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt={`${type}`} className="w-full h-full object-cover" />}
              <button
                onClick={() => remove(p.id)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white/80 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete photo"
              >×</button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-danger text-xs mt-1">{error}</p>}
    </div>
  )
}

export default function PropertyPhotoLog({ jobId }: { jobId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`)
      const json = await res.json()
      if (res.ok) setPhotos(json.photos ?? [])
    } finally { setLoaded(true) }
  }, [jobId])

  useEffect(() => { load() }, [load])

  return (
    <div className="border-t border-dark-border pt-3 space-y-3">
      <p className="text-white/30 text-[10px] uppercase tracking-widest">Property Photos</p>
      {!loaded ? (
        <p className="text-white/20 text-xs">Loading photos…</p>
      ) : (
        <div className="space-y-3">
          <Section jobId={jobId} type="before" photos={photos} onChange={load} />
          <Section jobId={jobId} type="after"  photos={photos} onChange={load} />
        </div>
      )}
    </div>
  )
}
