import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PROPERTY_SELECT = `
  *, customer:customers(id, full_name, phone, email)
`

// ─── GET /api/lawn/properties?customer_id= ────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = request.nextUrl.searchParams.get('customer_id')

  let query = supabase
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (customerId) query = query.eq('customer_id', customerId)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/lawn/properties]', error)
    return NextResponse.json({ error: 'Could not load properties.' }, { status: 500 })
  }

  return NextResponse.json({ properties: data ?? [] })
}

// ─── POST /api/lawn/properties ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id : ''
  const address    = typeof body.address === 'string' ? body.address.trim() : ''
  if (!customerId) return NextResponse.json({ error: 'A customer is required.' }, { status: 400 })
  if (!address)    return NextResponse.json({ error: 'Property address is required.' }, { status: 400 })

  const sqft = body.square_footage === '' || body.square_footage == null
    ? null : Number(body.square_footage)
  if (sqft !== null && (!Number.isFinite(sqft) || sqft < 0)) {
    return NextResponse.json({ error: 'Square footage must be a positive number.' }, { status: 400 })
  }

  const acres = body.lot_size_acres === '' || body.lot_size_acres == null
    ? null : Number(body.lot_size_acres)
  if (acres !== null && (!Number.isFinite(acres) || acres < 0)) {
    return NextResponse.json({ error: 'Lot size must be a positive number.' }, { status: 400 })
  }

  // Confirm the customer belongs to this user before attaching a property
  const { data: owned } = await supabase
    .from('customers').select('id').eq('id', customerId).eq('user_id', user.id).single()
  if (!owned) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

  const { data, error } = await supabase
    .from('properties')
    .insert({
      user_id:         user.id,
      customer_id:     customerId,
      name:            (body.name as string) || null,
      address,
      city:            (body.city  as string) || null,
      state:           (body.state as string) || null,
      zip:             (body.zip   as string) || null,
      square_footage:  sqft,
      lot_size_acres:  acres,
      gate_code:       (body.gate_code      as string) || null,
      dog_on_property: Boolean(body.dog_on_property),
      property_notes:  (body.property_notes as string) || null,
    })
    .select(PROPERTY_SELECT)
    .single()

  if (error) {
    console.error('[POST /api/lawn/properties]', error)
    return NextResponse.json({ error: 'Could not save the property.' }, { status: 500 })
  }

  return NextResponse.json({ property: data }, { status: 201 })
}
