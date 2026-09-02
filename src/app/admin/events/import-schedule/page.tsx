import Link from 'next/link'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { getCurrentAdmin } from '@/lib/auth'
import ScheduleImportClient from '@/components/admin/ScheduleImportClient'

export default async function ScheduleImportPage() {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin/events/import-schedule')
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')
  return <main className="min-h-screen bg-black p-8 text-white"><div className="mx-auto max-w-5xl"><Link href="/events" className="text-[#B11218]">← Events</Link><h1 className="mt-6 text-4xl font-bold">Import from Encuerado Schedule</h1><p className="mt-3 text-[#B7B7B7]">Preview and review source events before importing. Nothing is written until confirmation.</p><div className="mt-6"><ScheduleImportClient /></div></div></main>
}
