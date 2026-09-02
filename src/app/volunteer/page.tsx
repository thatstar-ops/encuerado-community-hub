import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  archiveVolunteerProfile,
  restoreVolunteerProfile,
} from '@/lib/admin-record-actions'

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
    status?: string
  }>
}) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/volunteers')
  }
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const params = searchParams ? await searchParams : {}
  const requestedStatus = String(params.status || 'active')
  const statusFilter = ['active', 'archived', 'all'].includes(requestedStatus)
    ? requestedStatus
    : 'active'

  const where: Prisma.VolunteerProfileWhereInput =
    statusFilter === 'all'
      ? {}
      : statusFilter === 'archived'
        ? {
            OR: [
              { archivedAt: { not: null } },
              { member: { is: { archivedAt: { not: null } } } },
            ],
          }
        : {
            archivedAt: null,
            member: { is: { archivedAt: null } },
          }

  const volunteerProfiles = await prisma.volunteerProfile.findMany({
    where,
    select: {
      id: true,
      status: true,
      preferredRoles: true,
      availability: true,
      shirtSize: true,
      archivedAt: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          email: true,
          phone: true,
          archivedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <ActionNotice
          message={params.actionMessage}
          status={params.actionStatus}
        />

        <div className="mb-6">
          <Link
            href="/admin"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteers</h1>
              <p className="mt-3 text-lg text-[#B7B7B7]">
                Review public volunteer signups and volunteer interest.
              </p>
            </div>

            <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center">
              <div className="text-sm font-semibold text-[#B7B7B7]">Total</div>
              <div className="text-3xl font-bold text-white">
                {volunteerProfiles.length}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {[
              ['active', 'Active'],
              ['archived', 'Archived'],
              ['all', 'All'],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={value === 'active' ? '/volunteers' : `/volunteers?status=${value}`}
                className={
                  statusFilter === value
                    ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white'
                    : 'rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]'
                }
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-[#3A1215]">
            <table className="w-full text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr><th className="p-4 font-bold">Name</th><th className="p-4 font-bold">Email</th><th className="p-4 font-bold">Phone</th><th className="p-4 font-bold">Status</th><th className="p-4 font-bold">Preferred Roles</th><th className="p-4 font-bold">Availability</th><th className="p-4 font-bold">Shirt Size</th><th className="p-4 font-bold">Actions</th></tr>
              </thead>
              <tbody>
                {volunteerProfiles.map((profile) => {
                  const restoreUrl = `/volunteers${statusFilter === 'active' ? '' : `?status=${statusFilter}`}`
                  const archiveUrl = `/volunteers${statusFilter === 'active' ? '' : `?status=${statusFilter}`}`
                  const phoneLink = phoneHref(profile.member.phone)
                  return (
                    <tr key={profile.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]"><td className="p-4 font-semibold"><Link href={`/members/${profile.member.id}`} className="text-[#B11218] hover:text-[#D11A22] hover:underline">{profile.member.preferredName || profile.member.firstName} {profile.member.lastName}</Link>{(profile.archivedAt || profile.member.archivedAt) ? (<div className="mt-2 inline-block rounded-full bg-[#2A0E10] px-3 py-1 text-xs font-bold text-white">Archived</div>) : null}</td><td className="p-4 text-[#D11A22]">{profile.member.email}</td><td className="p-4 text-white">{phoneLink ? <a href={phoneLink} className="text-[#B11218] hover:underline">{profile.member.phone}</a> : '—'}</td><td className="p-4 text-white">{profile.status}</td><td className="p-4 text-white">{profile.preferredRoles || '—'}</td><td className="p-4 text-white">{profile.availability || '—'}</td><td className="p-4 text-white">{profile.shirtSize || '—'}</td><td className="p-4">{(profile.archivedAt) ? (<details className="rounded-lg border border-[#B11218] p-3"><summary className="cursor-pointer text-sm font-bold text-[#B11218]">Restore Volunteer</summary><form action={restoreVolunteerProfile.bind(null, profile.id, restoreUrl)} className="mt-3"><button type="submit" className="rounded bg-[#B11218] px-3 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Restore Volunteer</button></form></details>) : (<details className="rounded-lg border border-[#3A1215] p-3"><summary className="cursor-pointer text-sm font-bold text-[#B11218]">Archive Volunteer</summary><p className="mt-2 text-xs text-[#B7B7B7]">Keeps the member and assignment history.</p><form action={archiveVolunteerProfile.bind(null, profile.id, archiveUrl)} className="mt-3"><button type="submit" className="rounded border border-[#B11218] px-3 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Archive Volunteer</button></form></details>)}</td></tr>
                  )
                })}
              </tbody>
            </table>

            {volunteerProfiles.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
                No volunteer signups yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}