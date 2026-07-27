import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin, requireNonCheckInAdmin, isSuperAdmin } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import { ParticipationBadges } from '@/components/ParticipationHistory'
import ActionNotice from '@/components/admin/ActionNotice'

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    year?: string
    participation?: string
    status?: string
    type?: string
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/members')

  const queryParams = searchParams ? await searchParams : {}
  const query = String(queryParams.q || '').trim()
  const yearParam = String(queryParams.year || '')
  const participation = String(queryParams.participation || '')
  const typeParam = String(queryParams.type || '')
  const requestedStatus = String(queryParams.status || 'active')
  const statusFilter = ['active', 'archived', 'all'].includes(requestedStatus)
    ? requestedStatus
    : 'active'

  const currentYear = new Date().getFullYear()

  // Resolve year filter
  let yearFilter: number | null = null
  let yearIsCurrent = false
  if (yearParam === 'current') {
    yearFilter = currentYear
    yearIsCurrent = true
  } else if (yearParam === 'all') {
    yearFilter = null
  } else {
    const parsed = Number(yearParam)
    if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100) {
      yearFilter = parsed
    }
  }

  const filters: Prisma.MemberWhereInput[] = []
  if (statusFilter === 'active') filters.push({ archivedAt: null })
  if (statusFilter === 'archived') filters.push({ archivedAt: { not: null } })
  if (query) filters.push({ OR: [
    { firstName: { contains: query } }, { lastName: { contains: query } },
    { preferredName: { contains: query } }, { email: { contains: query } },
    { phone: { contains: query } }, { city: { contains: query } },
    { state: { contains: query } }, { notes: { contains: query } },
  ] })

  // Year filter via participation records
  if (yearFilter !== null) {
    const typeToFilter = (typeParam === 'attendee' || typeParam === 'volunteer')
      ? (typeParam === 'attendee' ? 'ATTENDEE' : 'VOLUNTEER')
      : null

    if (typeToFilter) {
      filters.push({
        participationRecords: { some: { year: yearFilter, type: typeToFilter } },
      })
    } else {
      filters.push({
        participationRecords: { some: { year: yearFilter } },
      })
    }
  } else if (participation && Number.isInteger(yearFilter === null ? 0 : 1)) {
    // Fallback to old participation filter if year not set and participation is explicit
    const oldYear = Number(queryParams.year || '')
    if (Number.isInteger(oldYear) && oldYear >= 1900 && oldYear <= 2100) {
      if (participation === 'BOTH') filters.push({ AND: [
        { participationRecords: { some: { year: oldYear, type: 'ATTENDEE' } } },
        { participationRecords: { some: { year: oldYear, type: 'VOLUNTEER' } } },
      ] })
      else if (participation === 'ATTENDEE' || participation === 'VOLUNTEER') filters.push({ participationRecords: { some: { year: oldYear, type: participation } } })
    }
  }

  const attendees = await prisma.member.findMany({
    where: filters.length ? { AND: filters } : undefined,
    include: {
      registrations: true,
      volunteerProfile: true,
      volunteerAssignments: true,
      ticketPurchases: true,
      participationRecords: { orderBy: [{ year: 'desc' }, { type: 'asc' }] },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  function getTicketBadge(ticketPurchases: any[]) {
    if (!ticketPurchases || ticketPurchases.length === 0) return null;
    const types = ticketPurchases.map((tp: any) => tp.purchaseType);
    if (types.includes('VIP Pass')) return 'VIP Pass';
    if (types.includes('Weekend Pass')) return 'Weekend Pass';
    if (ticketPurchases.some((tp: any) => tp.sponsorNeedsReview)) return 'Sponsor Review';
    if (types.includes('Individual Ticket')) return 'Individual Ticket';
    return 'Ticket Purchase';
  }

  // Re-sort: current-year attendees first, then past, within each group alphabetical by firstName
  const sortedAttendees = [...attendees].sort((a, b) => {
    const aCurrent = a.participationRecords.some(r => r.year === currentYear && r.type === 'ATTENDEE')
    const bCurrent = b.participationRecords.some(r => r.year === currentYear && r.type === 'ATTENDEE')
    if (aCurrent && !bCurrent) return -1
    if (!aCurrent && bCurrent) return 1
    const firstNameCompare = (a.firstName || '').localeCompare(b.firstName || '')
    if (firstNameCompare !== 0) return firstNameCompare
    return (a.lastName || '').localeCompare(b.lastName || '')
  })

  const countWhere: Prisma.MemberWhereInput =
    statusFilter === 'active'
      ? { archivedAt: null }
      : statusFilter === 'archived'
        ? { archivedAt: { not: null } }
        : {}

  const totalAttendees = await prisma.member.count({ where: countWhere })

  const attendeeCountCurrentYear = await prisma.member.count({
    where: {
      ...countWhere,
      participationRecords: { some: { year: currentYear, type: 'ATTENDEE' } },
    },
  })

  const attendeeCountPast = await prisma.member.count({
    where: {
      ...countWhere,
      participationRecords: { some: { year: { lt: currentYear }, type: 'ATTENDEE' } },
    },
  })

  const currentYearWeekendPassCount = await prisma.member.count({
    where: {
      ...countWhere,
      participationRecords: { some: { year: currentYear, type: 'ATTENDEE' } },
      ticketPurchases: {
        some: {
          purchaseType: 'Weekend Pass',
        },
      },
    },
  })

  const currentYearVipPassCount = await prisma.member.count({
    where: {
      ...countWhere,
      participationRecords: { some: { year: currentYear, type: 'ATTENDEE' } },
      ticketPurchases: {
        some: {
          purchaseType: 'VIP Pass',
        },
      },
    },
  })

  const currentYearSponsorCount = await prisma.sponsorFulfillment.count({
    where: {
      eventYear: currentYear,
      member: {
        archivedAt: null,
      },
    },
  })

  const currentYearPackageCount =
    currentYearWeekendPassCount + currentYearVipPassCount + currentYearSponsorCount

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <ActionNotice
          message={queryParams.actionMessage}
          status={queryParams.actionStatus}
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/admin"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Dashboard
          </Link>

          {admin && (
            <Link
              href="/members/new"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Add Attendee
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-5xl font-black uppercase tracking-wide text-white">Attendees</h1>
              <p className="mt-4 max-w-3xl text-xl text-[#B7B7B7]">
                Search attendee profiles, contact details, event history, and volunteer activity.
              </p>
              {isSuperAdmin(admin) && (
                <Link
                  href="/admin/members/merge"
                  className="mt-3 inline-block text-sm font-semibold text-[#B11218] hover:text-[#D11A22]"
                >
                  Found a duplicate? Merge two records →
                </Link>
              )}
            </div>

            <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center">
              <div className="text-sm font-semibold text-[#B7B7B7]">
                Showing
              </div>
              <div className="text-3xl font-bold text-white">
                {sortedAttendees.length}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Link
              href="/members?year=current&type=attendee"
              className="rounded-xl border border-[#2A0E10] bg-black p-6 transition-colors hover:border-[#B11218] hover:bg-[#0B0B0B]"
            >
              <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
                {currentYear} Attendees
              </div>
              <div className="mt-3 text-5xl font-extrabold text-white">
                {attendeeCountCurrentYear}
              </div>
              <div className="mt-3 text-base font-medium text-[#B7B7B7]">
                Total attendee profiles: {totalAttendees} · Past attendees: {attendeeCountPast}
              </div>
            </Link>

            <Link
              href="/members?year=current&type=attendee"
              className="rounded-xl border border-[#2A0E10] bg-black p-6 transition-colors hover:border-[#B11218] hover:bg-[#0B0B0B]"
            >
              <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
                {currentYear} Passes / VIP / Sponsors
              </div>
              <div className="mt-3 text-5xl font-extrabold text-white">
                {currentYearPackageCount}
              </div>
              <div className="mt-3 text-base font-medium text-[#B7B7B7]">
                Weekend Pass: {currentYearWeekendPassCount} · VIP Pass: {currentYearVipPassCount} · Sponsors: {currentYearSponsorCount}
              </div>
            </Link>
          </div>

          {/* Import / Export section removed — now only on /admin/admin-users */}

          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <h2 className="text-2xl font-bold text-white">Search Attendees</h2>
            <p className="mt-2 text-[#B7B7B7]">
              Search by name, email, phone, city, state, or notes.
            </p>
            <form method="GET" action="/members" className="mt-5">
              <div className="grid gap-4 md:grid-cols-4">
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search attendee..."
                  className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4 text-lg text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />
                <select
                  name="year"
                  defaultValue={yearParam || ''}
                  className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4 text-white"
                >
                  <option value="">All years</option>
                  <option value="current">{currentYear} (current)</option>
                  {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select name="type" defaultValue={typeParam} className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4 text-white">
                  <option value="">All types</option>
                  <option value="attendee">Attendees</option>
                  <option value="volunteer">Volunteers</option>
                </select>
                <input name="status" type="hidden" value={statusFilter} />

                <button
                  type="submit"
                  className="rounded-lg bg-[#B11218] px-6 py-4 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  Search
                </button>

                <Link
                  href="/members"
                  className="rounded-lg border border-[#B11218] px-6 py-4 text-center text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Clear
                </Link>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap gap-3">
              {[
                ['active', 'Active'],
                ['archived', 'Archived'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  href={value === 'active' ? '/members' : `/members?status=${value}`}
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
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full min-w-[1100px] text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Attendee</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Phone</th>
                  <th className="p-4 font-bold">Location</th>
                  <th className="p-4 font-bold">Event Registrations</th>
                  <th className="p-4 font-bold">Participation History</th>
                  <th className="p-4 font-bold">Volunteer</th>
                  <th className="p-4 font-bold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {sortedAttendees.map((attendee) => {
                  const phoneLink = phoneHref(attendee.phone)
                  return (
                    <tr
                      key={attendee.id}
                      className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]"
                    >
                      <td className="p-4 font-semibold">
                        <Link
                          href={`/members/${attendee.id}`}
                          className="text-[#B11218] hover:text-[#D11A22] hover:underline"
                        >
                          {attendee.preferredName || attendee.firstName}{' '}
                          {attendee.lastName}
                        </Link>

                        <div className="mt-1 text-sm text-[#8F8F8F]">
                          First year: {attendee.firstYearAttended}
                        </div>
                        {attendee.archivedAt && (
                          <div className="mt-2 inline-block rounded-full bg-[#2A0E10] px-3 py-1 text-xs font-bold text-white">
                            Archived
                          </div>
                        )}
                        {(() => { const badge = getTicketBadge(attendee.ticketPurchases); if (badge) return <div className="mt-2 inline-block rounded-full bg-[#B11218] px-3 py-1 text-xs font-bold text-white">{badge}</div>; if (attendee.participationRecords.some(r => r.source === 'TicketSpice')) return <div className="mt-2 inline-block rounded-full bg-[#B11218] px-3 py-1 text-xs font-bold text-white">TicketSpice</div>; return null; })()}
                      </td>

                      <td className="p-4 text-[#D11A22]">{attendee.email}</td>

                      <td className="p-4 text-white">
                        {phoneLink ? (
                          <a href={phoneLink} className="text-[#B11218] hover:underline">
                            {attendee.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="p-4 text-white">
                        {[attendee.city, attendee.state].filter(Boolean).join(', ') ||
                          '—'}
                      </td>

                      <td className="p-4">
                        <span className="rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white">
                          {attendee.registrations.length}
                        </span>
                      </td>

                      <td className="p-4"><ParticipationBadges records={attendee.participationRecords} /></td>

                      <td className="p-4">
                        <span
                          className={
                            attendee.volunteerProfile
                              ? 'rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white'
                              : 'rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white'
                          }
                        >
                          {attendee.volunteerProfile
                            ? attendee.volunteerProfile.status
                            : 'No'}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/members/${attendee.id}`}
                            className="rounded bg-[#B11218] px-3 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                          >
                            View
                          </Link>

                          {admin && (
                            <Link
                              href={`/members/${attendee.id}/edit`}
                              className="rounded border border-[#B11218] px-3 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {sortedAttendees.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
                No attendees found.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
