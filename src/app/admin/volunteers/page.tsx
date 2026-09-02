import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { ParticipationBadges } from '@/components/ParticipationHistory'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  archiveVolunteerProfile,
  restoreVolunteerProfile,
  addVolunteerAssignmentToMember,
  removeVolunteerAssignmentFromAdmin,
} from '@/lib/admin-record-actions'
import { computeVolunteerReward } from '@/lib/volunteer-rewards'


const EVENT_TIME_ZONE = 'America/Los_Angeles'

const ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

function formatDate(date: Date | null) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function AdminVolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{
    actionMessage?: string
    actionStatus?: string
    search?: string
    status?: string
    year?: string
  }>
}) {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin/volunteers')
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const {
    actionMessage,
    actionStatus,
    search = '',
    status: statusParam = 'active',
    year: yearParam = String(new Date().getFullYear()),
  } = await searchParams

  const year = Number(yearParam)
  const statusFilter = ['active', 'archived', 'all'].includes(statusParam)
    ? statusParam
    : 'active'

  const currentYear = new Date().getFullYear()
  const currentYearStart = new Date(Date.UTC(currentYear, 0, 1))
  const nextYearStart = new Date(Date.UTC(currentYear + 1, 0, 1))

  const recentAssignmentCutoff = new Date()
  recentAssignmentCutoff.setDate(recentAssignmentCutoff.getDate() - 7)

  const volunteerVisibility: Prisma.VolunteerProfileWhereInput =
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

  const [
    totalVolunteers,
    currentYearVolunteers,
    openShifts,
    totalOpenShiftSlots,
    activeAssignments,
    checkedInActiveAssignments,
    recentAssignments,
    openShiftOptions,
  ] = await Promise.all([
    prisma.volunteerProfile.count({ where: volunteerVisibility }),
    prisma.member.count({
      where: {
        archivedAt: null,
        volunteerAssignments: {
          some: {
            status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
            shift: {
              startsAt: {
                gte: currentYearStart,
                lt: nextYearStart,
              },
              archivedAt: null,
              cancelledAt: null,
            },
          },
        },
      },
    }),
    prisma.volunteerShift.count({
      where: { status: 'Open', archivedAt: null, cancelledAt: null },
    }),
    prisma.volunteerShift.aggregate({
      where: {
        status: 'Open',
        archivedAt: null,
        cancelledAt: null,
      },
      _sum: {
        neededCount: true,
      },
    }),
    prisma.volunteerAssignment.count({
      where: {
        status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
        shift: {
          status: 'Open',
          archivedAt: null,
          cancelledAt: null,
        },
      },
    }),
    prisma.volunteerAssignment.count({
      where: {
        checkedIn: true,
        status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
        shift: {
          status: 'Open',
          archivedAt: null,
          cancelledAt: null,
        },
      },
    }),
    prisma.volunteerAssignment.findMany({
      where: {
        createdAt: { gte: recentAssignmentCutoff },
        member: { archivedAt: null },
        shift: {
          archivedAt: null,
          cancelledAt: null,
        },
      },
      include: {
        member: true,
        shift: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.volunteerShift.findMany({
      where: {
        status: 'Open',
        archivedAt: null,
        cancelledAt: null,
      },
      include: {
        event: true,
        assignments: {
          where: {
            status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
          },
          select: { id: true },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
    }),
  ])

  const filters: Prisma.MemberWhereInput[] = []

  if (search) {
    filters.push({
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  if (Number.isInteger(year) && year >= 1900 && year <= 2100) {
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1))

    filters.push({
      OR: [
        {
          participationRecords: {
            some: {
              year,
              type: 'VOLUNTEER',
            },
          },
        },
        {
          volunteerAssignments: {
            some: {
              status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
              shift: {
                startsAt: {
                  gte: yearStart,
                  lt: nextYearStart,
                },
                archivedAt: null,
                cancelledAt: null,
              },
            },
          },
        },
      ],
    })
  }

  const volunteerFilters: Prisma.VolunteerProfileWhereInput[] = [volunteerVisibility]
  if (filters.length) {
    volunteerFilters.push({ member: { is: { AND: filters } } })
  }

  const where: Prisma.VolunteerProfileWhereInput = {
    AND: volunteerFilters,
  }

  const volunteerProfiles = await prisma.volunteerProfile.findMany({
    where,
    select: {
      id: true,
      status: true,
      preferredRoles: true,
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
          participationRecords: {
            orderBy: [{ year: 'desc' }, { type: 'asc' }],
          },
          volunteerAssignments: {
            where: {
              status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
              shift: {
                archivedAt: null,
                cancelledAt: null,
              },
            },
            select: {
              id: true,
              status: true,
              checkedIn: true,
              shift: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  endsAt: true,
                  archivedAt: true,
                  cancelledAt: true,
                  event: {
                    select: {
                      title: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              shift: {
                startsAt: 'asc',
              },
            },
          },
        },
      },
    },
    orderBy: [
      { member: { firstName: 'asc' } },
      { member: { lastName: 'asc' } },
      { createdAt: 'desc' },
    ],
  })

  const totalVolunteerSlotsNeeded = totalOpenShiftSlots._sum.neededCount || 0
  const openVolunteerSlotsToFill = Math.max(totalVolunteerSlotsNeeded - activeAssignments, 0)

  const returnParams = new URLSearchParams()
  if (statusFilter !== 'active') returnParams.set('status', statusFilter)
  if (yearParam) returnParams.set('year', yearParam)
  if (search) returnParams.set('search', search)

  const returnQuery = returnParams.toString()
  const returnTo = `/admin/volunteers${returnQuery ? `?${returnQuery}` : ''}`

  const directoryYearLabel =
    Number.isInteger(year) && year >= 1900 && year <= 2100
      ? `${year} Volunteer Directory`
      : 'All Volunteer Profiles'


  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <ActionNotice message={actionMessage} status={actionStatus} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteer Operations</h1>
            <p className="mt-2 text-lg text-[#B7B7B7]">
              Manage current volunteers, prior volunteer history, shift assignments, and volunteer rewards.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/volunteer-shifts"
              className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Public Signup
            </Link>
            <Link
              href="/shifts/new"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              New Shift
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Link href="/admin/volunteers" className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 hover:border-[#B11218] hover:bg-[#151111]">
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">{currentYear} Volunteers</div>
            <div className="mt-3 text-5xl font-extrabold text-white">{currentYearVolunteers}</div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">All volunteer profiles: {totalVolunteers}</div>
          </Link>

          <Link href="/shifts?needs=1" className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 hover:border-[#B11218] hover:bg-[#151111]">
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">Shifts to Fill</div>
            <div className="mt-3 text-5xl font-extrabold text-white">{openVolunteerSlotsToFill}</div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">{activeAssignments} of {totalVolunteerSlotsNeeded} slots assigned</div>
          </Link>

          <Link href="/shifts?shiftStatus=Open" className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 hover:border-[#B11218] hover:bg-[#151111]">
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">Open Shifts</div>
            <div className="mt-3 text-5xl font-extrabold text-white">{openShifts}</div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">Shift records still open</div>
          </Link>

          {/* Not a Link: there's no single filtered view of "all active
              assignments across every shift" to send someone to - assignment
              detail lives per-shift on /shifts. */}
          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5">
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">Active Assignments</div>
            <div className="mt-3 text-5xl font-extrabold text-white">{activeAssignments}</div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">Checked in: {checkedInActiveAssignments}</div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
          <h2 className="text-2xl font-bold text-white">Recent Assignments</h2>
          {recentAssignments.length === 0 ? (
            <p className="mt-4 text-[#B7B7B7]">No recent assignments.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {recentAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-lg border border-[#2A0E10] bg-[#151111] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/members/${assignment.member.id}`}
                      className="font-bold text-[#B11218] hover:underline"
                    >
                      {assignment.member.preferredName || assignment.member.firstName}{' '}
                      {assignment.member.lastName}
                    </Link>
                    <span className="text-sm text-[#B7B7B7]">
                      {assignment.shift.title} - {formatDate(assignment.shift.startsAt)}
                    </span>
                    <span className="text-sm text-[#8F8F8F]">
                      {assignment.status} - {assignment.checkedIn ? 'Checked In' : 'Not Checked In'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-white">{directoryYearLabel}</h2>
            <div className="flex flex-wrap gap-3">
              <form method="GET" className="flex gap-2">
                <input
                  name="search"
                  type="text"
                  placeholder="Search volunteers..."
                  defaultValue={search}
                  className="rounded-lg border border-[#3A1215] bg-[#151111] px-4 py-2 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />
                <select
                  name="year"
                  defaultValue={Number.isInteger(year) ? String(year) : ''}
                  className="rounded-lg border border-[#3A1215] bg-[#151111] px-4 py-2 text-white"
                >
                  <option value="">All years</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
                <input name="status" type="hidden" value={statusFilter} />
                <button
                  type="submit"
                  className="rounded-lg bg-[#B11218] px-4 py-2 font-bold text-white hover:bg-[#D11A22]"
                >
                  Search
                </button>
              </form>
              <Link
                href={`/api/admin/volunteers/export?status=${statusFilter}`}
                className="rounded-lg border border-[#B11218] px-4 py-2 font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
              >
                Export CSV
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {[
              ['active', 'Active Profiles'],
              ['archived', 'Archived Profiles'],
              ['all', 'All Profiles'],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={`/admin/volunteers?status=${value}&year=${Number.isInteger(year) ? year : ''}`}
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

          <div className="mt-5 rounded-lg border border-[#2A0E10] bg-[#151111] p-4 text-sm text-[#B7B7B7]">
            <span className="font-bold text-[#B11218]">Note:</span>{' '}
            Prior-year volunteers are kept as volunteer history and outreach contacts. Use the year filter to view 2025, 2026, or all years.
          </div>

          <div className="mt-4 grid gap-4">
            {volunteerProfiles.map((profile) => {
              const reward = computeVolunteerReward(profile.member.volunteerAssignments)
              const volunteerName =
                `${profile.member.preferredName || profile.member.firstName} ${profile.member.lastName}`

              return (
                <div key={profile.id} className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                  <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr]">
                    <div>
                      <Link
                        href={`/members/${profile.member.id}`}
                        className="text-xl font-black uppercase tracking-wide text-[#B11218] hover:underline"
                      >
                        {volunteerName}
                      </Link>
                      {(profile.archivedAt || profile.member.archivedAt) && (
                        <div className="mt-2 inline-block rounded-full bg-[#2A0E10] px-3 py-1 text-xs font-bold text-white">
                          Archived
                        </div>
                      )}
                      <div className="mt-3 text-base font-medium text-[#B7B7B7]">{profile.member.email}</div>
                      <div className="text-sm text-[#B7B7B7]">{profile.member.phone || '-'}</div>
                      <div className="mt-3 text-base font-medium text-[#B7B7B7]">Status: {profile.status}</div>
                      <div className="text-sm text-[#B7B7B7]">Shirt size: {profile.shirtSize || '-'}</div>
                      <div className="mt-2">
                        <ParticipationBadges records={profile.member.participationRecords} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">
                        Volunteer Reward
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">{reward.label}</div>
                      <div className="mt-1 text-sm text-[#B7B7B7]">
                        Active shifts: {reward.rawActiveShiftCount}
                        {reward.rawActiveShiftCount > 3 ? ' - over public signup limit' : ''}
                      </div>
                      {reward.items.length > 0 ? (
                        <ul className="mt-3 grid gap-1 text-sm text-[#B7B7B7]">
                          {reward.items.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-3 text-sm text-[#8F8F8F]">No reward yet.</div>
                      )}
                    </div>

                    <div>
                      <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">
                        Add Shift
                      </div>
                      <form
                        action={addVolunteerAssignmentToMember.bind(null, profile.member.id, returnTo)}
                        className="mt-3 grid gap-2"
                      >
                        <select
                          name="shiftId"
                          required
                          className="rounded-lg border border-[#3A1215] bg-black p-3 text-sm text-white"
                        >
                          <option value="">Choose open shift</option>
                          {openShiftOptions.map((shift) => {
                            const spotsLeft = Math.max(shift.neededCount - shift.assignments.length, 0)
                            return (
                              <option key={shift.id} value={shift.id}>
                                {shift.event.title} - {shift.title} - {formatDate(shift.startsAt)} - {spotsLeft} spots left
                              </option>
                            )
                          })}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                        >
                          Add Shift
                        </button>
                        <div className="text-xs text-[#8F8F8F]">
                          Admin can add more than 3 shifts if intentional. A warning will show after saving.
                        </div>
                      </form>

                      <div className="mt-5 grid gap-2">
                        <Link
                          href={`/members/${profile.member.id}/edit`}
                          className="text-sm font-bold text-[#B11218] hover:underline"
                        >
                          Edit attendee profile
                        </Link>

                        {profile.archivedAt ? (
                          <form
                            action={restoreVolunteerProfile.bind(null, profile.id, returnTo)}
                          >
                            <button
                              type="submit"
                              className="rounded border border-[#B11218] px-3 py-2 text-xs font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                            >
                              Restore Volunteer
                            </button>
                          </form>
                        ) : (
                          <details className="rounded-lg border border-[#3A1215] p-2">
                            <summary className="cursor-pointer text-xs font-bold text-[#B11218]">
                              Archive Volunteer
                            </summary>
                            <p className="mt-2 text-xs text-[#B7B7B7]">
                              Keeps the member and assignment history.
                            </p>
                            <form
                              action={archiveVolunteerProfile.bind(null, profile.id, returnTo)}
                              className="mt-2"
                            >
                              <button
                                type="submit"
                                className="rounded border border-[#B11218] px-3 py-2 text-xs font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                              >
                                Archive Volunteer
                              </button>
                            </form>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
                    <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">
                      Active Shift Assignments
                    </div>

                    {profile.member.volunteerAssignments.length === 0 ? (
                      <div className="mt-3 text-sm text-[#8F8F8F]">No active shifts assigned.</div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {profile.member.volunteerAssignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2A0E10] bg-[#151111] p-3"
                          >
                            <div>
                              <div className="font-bold text-white">{assignment.shift.title}</div>
                              <div className="text-sm text-[#B7B7B7]">{assignment.shift.event.title}</div>
                              <div className="text-sm text-[#8F8F8F]">
                                {formatDate(assignment.shift.startsAt)}
                                {assignment.shift.endsAt ? ` - ${formatDate(assignment.shift.endsAt)}` : ''}
                              </div>
                              <div className="text-xs text-[#8F8F8F]">
                                {assignment.status} - {assignment.checkedIn ? 'Checked In' : 'Not Checked In'}
                              </div>
                            </div>
                            <form
                              action={removeVolunteerAssignmentFromAdmin.bind(null, assignment.id, returnTo)}
                            >
                              <button
                                type="submit"
                                className="rounded-lg border border-[#B11218] px-3 py-2 text-xs font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                              >
                                Remove Assignment
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {volunteerProfiles.length === 0 && (
              <p className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-center text-[#8F8F8F]">
                No volunteers found
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}