'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { JobPhoto } from '@/types/lawn'

export default function JobPhotos({ jobId }: { jobId: string }) {
  const [open,      setOpen]      = useState(false)
  const [photos,    setPhotos]    = useState<JobPhoto[]>([])
  const [loading,   setLoading]   = useState(false)
  const [loaded,    setLoaded]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [busyId,    setBusyId]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/jobs/${jobId}/photos`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load photos.')
      setPhotos(json.photos)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load photos.')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { if (open && !loaded) void load() }, [open, loaded, load])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res  = await fetch(`/api/lawn/jobs/${jobId}/photos`, { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not upload the photo.')
        setPhotos(prev => [...prev, json.photo])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveCaption(photo: JobPhoto, caption: string) {
    if ((photo.caption ?? '') === caption) return
    setBusyId(photo.id)
    try {
      const res  = await fetch(`/api/lawn/jobs/${jobId}/photos/${photo.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ caption }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the caption.')
      setPhotos(prev => prev.map(p => (p.id === photo.id ? json.photo : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the caption.')
    } finally {
      setBusyId(null)
    }
  }

  async function deletePhoto(photo: JobPhoto) {
    if (!window.confirm('Delete this photo?')) return
    setBusyId(photo.id)
    setError(null)
    try {
      const res  = await fetch(`/api/lawn/jobs/${jobId}/photos/${photo.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the photo.')
      setPhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the photo.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-dark-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        Photos{loaded && photos.length > 0 ? ` (${photos.length})` : ''}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={e => void handleFiles(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-orange hover:bg-orange-hover disabled:opacity-50 text-white text-xs
                       font-condensed font-semibold px-4 py-2 rounded-lg min-h-[40px] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'Uploading…' : 'Upload Photos'}
          </button>

          {error && (
            <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-white/40 text-xs mt-3">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="text-white/30 text-xs mt-3">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {photos.map(photo => (
                <div key={photo.id} className="rounded-lg border border-dark-border bg-dark-input overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={photo.public_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={photo.public_url}
                      alt={photo.caption ?? 'Job photo'}
                      className="w-full h-28 object-cover"
                      loading="lazy"
                    />
                  </a>
                  <div className="p-2">
                    <input
                      type="text"
                      defaultValue={photo.caption ?? ''}
                      placeholder="Add a caption"
                      disabled={busyId === photo.id}
                      onBlur={e => void saveCaption(photo, e.target.value.trim())}
                      className="w-full bg-transparent border-none text-xs text-white/70 placeholder:text-white/25
                                 focus:outline-none focus:text-white p-0"
                    />
                    <button
                      onClick={() => void deletePhoto(photo)}
                      disabled={busyId === photo.id}
                      className="mt-1 text-[11px] text-danger/70 hover:text-danger disabled:opacity-40 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
