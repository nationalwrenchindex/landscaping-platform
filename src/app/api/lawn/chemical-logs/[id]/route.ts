import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHEMICAL_SELECT, buildChemicalRow } from '@/lib/lawn/chemical-utils'

// ─── GET /api/lawn/chemical-logs/[id] ─────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chemical_logs').select(CHEMICAL_SELECT).eq('id', id).eq('user_id', user.id).single()

  if (error || !data) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  return NextResponse.json({ log: data })
}

// ─── PATCH /api/lawn/chemical-logs/[id] ───────────────────────────────────────
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

  const { data: existing } = await supabase
    .from('chemical_logs').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })

  const { row, error: buildErr } = buildChemicalRow(body, user.id)
  if (buildErr || !row) return NextResponse.json({ error: buildErr }, { status: 400 })

  // user_id is immutable on update
  delete row.user_id

  const { data, error } = await supabase
    .from('chemical_logs').update(row).eq('id', id).eq('user_id', user.id)
    .select(CHEMICAL_SELECT).single()

  if (error || !data) {
    console.error('[PATCH /api/lawn/chemical-logs/[id]]', error)
    return NextResponse.json({ error: 'Could not update the application.' }, { status: 500 })
  }

  return NextResponse.json({ log: data })
}

// ─── DELETE /api/lawn/chemical-logs/[id] ──────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('chemical_logs').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/lawn/chemical-logs/[id]]', error)
    return NextResponse.json({ error: 'Could not delete the application.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
