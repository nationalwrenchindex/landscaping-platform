import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHEMICAL_SELECT, DATE_RE, buildChemicalRow } from '@/lib/lawn/chemical-utils'

// ─── GET /api/lawn/chemical-logs?from=&to=&property_id=&organic= ───────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp         = request.nextUrl.searchParams
  const from       = sp.get('from')
  const to         = sp.get('to')
  const propertyId = sp.get('property_id')
  const organic    = sp.get('organic') // 'true' | 'false' | null

  let query = supabase
    .from('chemical_logs')
    .select(CHEMICAL_SELECT)
    .eq('user_id', user.id)
    .order('application_date', { ascending: false })
    .order('application_time', { ascending: false, nullsFirst: false })

  if (from && DATE_RE.test(from)) query = query.gte('application_date', from)
  if (to   && DATE_RE.test(to))   query = query.lte('application_date', to)
  if (propertyId)                 query = query.eq('property_id', propertyId)
  if (organic === 'true')         query = query.eq('is_organic', true)
  if (organic === 'false')        query = query.eq('is_organic', false)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/lawn/chemical-logs]', error)
    return NextResponse.json({ error: 'Could not load chemical logs.' }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}

// ─── POST /api/lawn/chemical-logs ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { row, error: buildErr } = buildChemicalRow(body, user.id)
  if (buildErr || !row) return NextResponse.json({ error: buildErr }, { status: 400 })

  const { data, error } = await supabase
    .from('chemical_logs').insert(row).select(CHEMICAL_SELECT).single()

  if (error || !data) {
    console.error('[POST /api/lawn/chemical-logs]', error)
    return NextResponse.json({ error: 'Could not save the application.' }, { status: 500 })
  }

  return NextResponse.json({ log: data }, { status: 201 })
}
