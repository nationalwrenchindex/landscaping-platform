import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/layout/AppNav'
import LawnInvoicesClient from '@/components/invoices/LawnInvoicesClient'

export const metadata = { title: 'Invoices' }

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, business_name, business_type')
    .eq('id', user.id)
    .single()

  if (!profile?.business_name) redirect('/onboarding')

  const businessType = (profile as Record<string, unknown>).business_type as string | undefined

  return (
    <div className="min-h-dvh bg-dark flex flex-col">
      <AppNav businessName={profile.business_name} businessType={businessType} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="font-condensed font-bold text-3xl text-white tracking-wide">
            INVOICES
          </h1>
          <p className="text-white/40 text-sm">
            Bill customers, track payments, and automate recurring service.
          </p>
        </div>
        <LawnInvoicesClient />
      </main>
    </div>
  )
}
