import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImportWizard from './ImportWizard'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load camps + programs this user has admin access to
  const { data: roles } = await supabase
    .from('staff_camp_roles')
    .select('camp_id, role, camps(id, name)')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'admin', 'staff_admin'])

  const campIds = (roles ?? []).map((r) => r.camp_id)

  const { data: programs } = campIds.length > 0
    ? await supabase
        .from('programs')
        .select('id, name, camp_id, start_date, end_date')
        .in('camp_id', campIds)
        .eq('is_active', true)
        .order('start_date', { ascending: true })
    : { data: [] }

  const camps = (roles ?? [])
    .flatMap((r) => (Array.isArray(r.camps) ? r.camps : r.camps ? [r.camps] : []))
    .filter((c): c is { id: string; name: string } => !!c.id)

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Import Roster</h1>
      <p className="text-gray-500 text-sm mb-8">
        Upload a CSV export from your registration system to add campers and guardians.
      </p>
      <ImportWizard camps={camps} programs={programs ?? []} />
    </div>
  )
}
