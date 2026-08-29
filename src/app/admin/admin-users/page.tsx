import { AdminMoneyTallies } from '@/components/admin/AdminMoneyTallies'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { getCurrentAdmin, isSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminUserList from '@/components/admin/AdminUserList'

export default async function AdminUsersPage() {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin || !isSuperAdmin(admin)) redirect('/admin')

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
        <AdminMoneyTallies />
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold text-white">Admin Users</h1>
        <p className="mt-2 text-[#B7B7B7]">Manage administrator accounts.</p>

        {/* Import / Export / Reports Section */}
        <div className="mt-6 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
          <h2 className="text-2xl font-bold text-white">Import / Export / Reports</h2>
          <p className="mt-1 text-[#B7B7B7]">Import or export attendee and volunteer data, and access reports.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/imports" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Import Attendees CSV</Link>
            <Link href="/api/admin/members/export" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Export Attendees CSV</Link>
            <Link href="/api/admin/volunteers/export" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Export Volunteers CSV</Link>
            <Link href="/api/admin/volunteer-schedule/export?view=shift" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Export Shift Schedule CSV (by time)</Link>
            <Link href="/api/admin/volunteer-schedule/export?view=volunteer" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Export Volunteer Schedule CSV (by person)</Link>
            <Link href="/admin/shirt-sizes" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Fill Missing Shirt Sizes</Link>
            <Link href="/api/admin/shirt-size-summary/export" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Export Shirt Order Summary CSV</Link>
            <Link href="/reports" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Reports</Link>
            <Link href="/api/admin/contacts/export" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Full Contact Export</Link>
            <Link href="/admin/sponsors/new" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Add Sponsor / Attendee (Manual)</Link>
            <Link href="/admin/members/merge" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Merge Duplicate Members</Link>
            <Link href="/admin/volunteer-bible" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Print Volunteer Bible</Link>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#B11218] bg-[#151111] p-6">
          <h2 className="text-2xl font-bold text-white">External Contact Lists</h2>
          <p className="mt-1 text-[#B7B7B7]">
            Import and manage external contact lists for future communications. Contacts are not attendees.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link href="/admin/admin-users/import-external-contacts" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">
              Import External Contact List
            </Link>
            <Link href="/admin/admin-users/external-contact-lists" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
              View External Contact Lists
            </Link>
          </div>
        </div>
<AdminUserList admins={admins} currentAdminId={admin.id} />
      </div>
    </main>
  )
}