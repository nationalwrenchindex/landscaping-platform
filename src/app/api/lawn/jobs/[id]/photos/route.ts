import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'job-photos'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const PHOTO_SELECT =
  'id, job_id, user_id, storage_path, public_url, caption, taken_at, created_at'

// ─── GET /api/lawn/jobs/[id]/photos ───────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('job_photos')
    .select(PHOTO_SELECT)
    .eq('job_id', id)
    .eq('user_id', user.id)
    .order('taken_at', { ascending: true })

  if (error) {
    console.error('[GET /api/lawn/jobs/[id]/photos]', error)
    return NextResponse.json({ error: 'Could not load photos.' }, { status: 500 })
  }

  return NextResponse.json({ photos: data ?? [] })
}

// ─── POST /api/lawn/jobs/[id]/photos ──────────────────────────────────────────
// Multipart upload: fields `file` (image) and optional `caption`.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The job must belong to this user before we let them attach photos.
  const { data: job } = await supabase
    .from('jobs').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
  }

  const file    = formData.get('file')
  const caption = formData.get('caption')

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files can be uploaded.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Photos must be 10 MB or smaller.' }, { status: 400 })
  }

  const rawName = (file instanceof File && file.name) ? file.name : 'photo.jpg'
  const ext     = (rawName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const stamp   = new Date().toISOString().replace(/[^0-9]/g, '')
  const rand    = Math.random().toString(36).slice(2, 8)
  const path    = `${user.id}/${id}/${stamp}-${rand}.${ext}`

  const { error: uploadErr } = await supabase
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[POST /api/lawn/jobs/[id]/photos] upload', uploadErr)
    return NextResponse.json({ error: 'Could not upload the photo.' }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { data: photo, error: insertErr } = await supabase
    .from('job_photos')
    .insert({
      job_id:       id,
      user_id:      user.id,
      storage_path: path,
      public_url:   pub.publicUrl,
      caption:      typeof caption === 'string' && caption.trim() ? caption.trim() : null,
    })
    .select(PHOTO_SELECT)
    .single()

  if (insertErr || !photo) {
    // Roll back the orphaned upload so storage doesn't drift from the table.
    await supabase.storage.from(BUCKET).remove([path])
    console.error('[POST /api/lawn/jobs/[id]/photos] insert', insertErr)
    return NextResponse.json({ error: 'Could not save the photo.' }, { status: 500 })
  }

  return NextResponse.json({ photo }, { status: 201 })
}
