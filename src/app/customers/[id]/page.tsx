import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/layout/AppNav'
import CustomerDetailClient from '@/components/customers/CustomerDetailClient'

export const metadata = { title: 'Customer' }

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id }   = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, business_name, business_type')
    .eq('id', user.id)
    .single()

  if (!profile?.business_name) redirect('/onboarding')

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!customer) notFound()

  const businessType = (profile as Record<string, unknown>).business_type as string | undefined

  return (
    <div className="min-h-dvh bg-dark flex flex-col">
      <AppNav businessName={profile.business_name} businessType={businessType} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <CustomerDetailClient customerId={id} />
      </main>
    </div>
  )
}
