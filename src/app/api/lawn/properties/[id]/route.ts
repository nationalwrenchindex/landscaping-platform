import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const NUMERIC_FIELDS = ['square_footage', 'lot_size_acres', 'lat', 'lng']
const TEXT_FIELDS    = ['name', 'address', 'city', 'state', 'zip', 'gate_code', 'property_notes']

// ─── PATCH /api/lawn/properties/[id] ──────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  for (const key of TEXT_FIELDS) {
    if (key in body) {
      const value = typeof body[key] === 'string' ? (body[key] as string).trim() : body[key]
      patch[key] = value === '' ? null : value
    }
  }

  for (const key of NUMERIC_FIELDS) {
    if (key in body) {
      const raw = body[key]
      if (raw === '' || raw == null) { patch[key] = null; continue }
      const num = Number(raw)
      if (!Number.isFinite(num)) {
        return NextResponse.json({ error: `${key.replace(/_/g, ' ')} must be a number.` }, { status: 400 })
      }
      patch[key] = num
    }
  }

  if ('dog_on_property' in body) patch.dog_on_property = Boolean(body.dog_on_property)

  if ('address' in patch && !patch.address) {
    return NextResponse.json({ error: 'Property address is required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, customer:customers(id, full_name, phone, email)')
    .single()

  if (error || !data) {
    console.error('[PATCH /api/lawn/properties/[id]]', error)
    return NextResponse.json({ error: 'Could not update the property.' }, { status: 500 })
  }

  return NextResponse.json({ property: data })
}

// ─── DELETE /api/lawn/properties/[id] ─────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/properties/[id]]', error)
    return NextResponse.json({ error: 'Could not delete the property.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
