import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/layout/AppNav'
import ScheduleClient from '@/components/schedule/ScheduleClient'

export const metadata = { title: 'Schedule' }

export default async function SchedulePage() {
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
            SCHEDULE
          </h1>
          <p className="text-white/40 text-sm">
            This week&apos;s route, today&apos;s stops, and crew notes.
          </p>
        </div>
        <ScheduleClient />
      </main>
    </div>
  )
}
