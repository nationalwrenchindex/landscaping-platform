import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getServicesByBusinessType } from '@/lib/scheduler'
import LawnBookingClient from '@/components/booking/LawnBookingClient'

type PageProps = {
  params: Promise<{ techSlug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps) {
  const { techSlug } = await params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('slug', techSlug)
    .single()
  const biz = (data?.business_name as string) || 'Lawn & Landscape'
  return {
    title: `Book ${biz}`,
    description: 'Request professional lawn care and landscaping service online.',
  }
}

export default async function BookingPage({ params }: PageProps) {
  const { techSlug } = await params
  const supabase = createServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, business_name, full_name, phone, service_area_description, business_logo_url, business_type')
    .eq('slug', techSlug)
    .single()

  if (!profile) notFound()

  const p        = profile as Record<string, unknown>
  const services = [...getServicesByBusinessType((p.business_type as string) ?? 'landscaper')]

  return (
    <LawnBookingClient
      slug={techSlug}
      businessName={(profile.business_name as string) || (profile.full_name as string) || 'Lawn & Landscape'}
      businessPhone={(profile.phone as string | null) ?? null}
      serviceArea={(p.service_area_description as string | null) ?? null}
      logoUrl={(p.business_logo_url as string | null) ?? null}
      services={services}
    />
  )
}
