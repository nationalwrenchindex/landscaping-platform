import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'property-photos'
const MAX_PER_TYPE = 5

// Verify the job belongs to the current user; returns { supabase, user, job } or a NextResponse error.
async function authJob(req: NextRequest, jobId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()
  if (!job) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { supabase, user }
}

// GET — list before/after photos for a job, with short-lived signed URLs.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const ctx = await authJob(req, jobId)
  if ('error' in ctx) return ctx.error
  const { supabase } = ctx

  const { data: rows, error } = await supabase
    .from('lawn_property_photos')
    .select('id, photo_type, storage_path, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const photos = await Promise.all((rows ?? []).map(async (r) => {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600)
    return { id: r.id, photo_type: r.photo_type, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json({ photos })
}

// POST — upload one before/after photo (base64), enforce max 5 per type.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const ctx = await authJob(req, jobId)
  if ('error' in ctx) return ctx.error
  const { supabase, user } = ctx

  let body: { photo_type?: string; imageBase64?: string; mimeType?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { photo_type, imageBase64, mimeType } = body
  if (photo_type !== 'before' && photo_type !== 'after') {
    return NextResponse.json({ error: 'photo_type must be before or after' }, { status: 400 })
  }
  if (!imageBase64) return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })

  const { count } = await supabase
    .from('lawn_property_photos')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('photo_type', photo_type)
  if ((count ?? 0) >= MAX_PER_TYPE) {
    return NextResponse.json({ error: `Max ${MAX_PER_TYPE} ${photo_type} photos per job` }, { status: 400 })
  }

  const ext  = (mimeType ?? 'image/jpeg').split('/')[1] || 'jpg'
  const path = `${user.id}/${jobId}/${photo_type}-${Date.now()}.${ext}`
  const buffer = Buffer.from(imageBase64, 'base64')

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType ?? 'image/jpeg',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: row, error } = await supabase
    .from('lawn_property_photos')
    .insert({ job_id: jobId, user_id: user.id, photo_type, storage_path: path })
    .select('id, photo_type')
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ photo: { id: row.id, photo_type: row.photo_type, url: signed?.signedUrl ?? null } })
}

// DELETE — remove a photo (storage + row).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const ctx = await authJob(req, jobId)
  if ('error' in ctx) return ctx.error
  const { supabase, user } = ctx

  const photoId = new URL(req.url).searchParams.get('photoId')
  if (!photoId) return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })

  const { data: row } = await supabase
    .from('lawn_property_photos')
    .select('id, storage_path')
    .eq('id', photoId)
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.storage.from(BUCKET).remove([row.storage_path])
  await supabase.from('lawn_property_photos').delete().eq('id', photoId)
  return NextResponse.json({ ok: true })
}
