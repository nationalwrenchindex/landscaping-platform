import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'job-photos'

const PHOTO_SELECT =
  'id, job_id, user_id, storage_path, public_url, caption, taken_at, created_at'

// ─── PATCH /api/lawn/jobs/[id]/photos/[photoId] ───────────────────────────────
// Updates the caption.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const caption = typeof body.caption === 'string' ? body.caption.trim() : ''

  const { data, error } = await supabase
    .from('job_photos')
    .update({ caption: caption || null })
    .eq('id', photoId)
    .eq('job_id', id)
    .eq('user_id', user.id)
    .select(PHOTO_SELECT)
    .single()

  if (error || !data) {
    console.error('[PATCH /api/lawn/jobs/[id]/photos/[photoId]]', error)
    return NextResponse.json({ error: 'Could not update the caption.' }, { status: 500 })
  }

  return NextResponse.json({ photo: data })
}

// ─── DELETE /api/lawn/jobs/[id]/photos/[photoId] ──────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: photo } = await supabase
    .from('job_photos')
    .select('storage_path')
    .eq('id', photoId)
    .eq('job_id', id)
    .eq('user_id', user.id)
    .single()

  if (!photo) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })

  const { error } = await supabase
    .from('job_photos').delete().eq('id', photoId).eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/jobs/[id]/photos/[photoId]]', error)
    return NextResponse.json({ error: 'Could not delete the photo.' }, { status: 500 })
  }

  // Best-effort storage cleanup — the row is already gone.
  await supabase.storage.from(BUCKET).remove([photo.storage_path as string])

  return NextResponse.json({ success: true })
}
