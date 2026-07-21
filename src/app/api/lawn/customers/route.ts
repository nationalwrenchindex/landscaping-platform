import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CUSTOMER_SELECT = `
  id, user_id, full_name, email, phone, address, city, state, zip, notes,
  created_at, updated_at,
  properties:properties(id, name, address, city, state, zip, dog_on_property)
`

// ─── GET /api/lawn/customers?search= ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = request.nextUrl.searchParams.get('search')?.trim()

  let query = supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('user_id', user.id)
    .order('full_name', { ascending: true })

  if (search) {
    const safe = search.replace(/[%,()]/g, '')
    query = query.or(
      `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%`,
    )
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/lawn/customers]', error)
    return NextResponse.json({ error: 'Could not load customers.' }, { status: 500 })
  }

  return NextResponse.json({ customers: data ?? [] })
}

// ─── POST /api/lawn/customers ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  if (!fullName) {
    return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id:   user.id,
      full_name: fullName,
      email:     email || null,
      phone:     (body.phone   as string) || null,
      address:   (body.address as string) || null,
      city:      (body.city    as string) || null,
      state:     (body.state   as string) || null,
      zip:       (body.zip     as string) || null,
      notes:     (body.notes   as string) || null,
    })
    .select(CUSTOMER_SELECT)
    .single()

  if (error) {
    console.error('[POST /api/lawn/customers]', error)
    return NextResponse.json({ error: 'Could not save the customer.' }, { status: 500 })
  }

  return NextResponse.json({ customer: data }, { status: 201 })
}
