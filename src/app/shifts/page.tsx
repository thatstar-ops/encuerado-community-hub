import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'

const EVENT_TIME_ZONE = 'America/Los_Angeles'
const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
    status?: string
    needs?: string
    shiftStatus?: string
  }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/shifts')

  const params = searchParams ? await searchParams : {}
  const requestedStatus = String(params.status || 'active')
  const statusFilter = ['active', 'archived', 'all'].includes(requestedStatus) ? requestedStatus : 'active'
  // "Needs volunteers" = still-open shifts that haven't hit their headcount
  // yet. This is computed after fetching (it depends on comparing each
  // shift's active-assignment count to neededCount, not a plain column), so
  // it's applied as a post-fetch filter below rather than in `where`.
  const needsVolunteersOnly = params.needs === '1'
  // Filters to the VolunteerShift.status field specifically (Open/Full/
  // Closed/Cancelled) - independent of the active/archived/all tabs above,
  // which filter on archivedAt/cancelledAt instead.
  const shiftStatusFilter = ['Open', 'Full', 'Closed', 'Cancelled'].includes(String(params.shiftStatus || ''))
    ? String(params.shiftStatus)
    : null

  const where: Prisma.VolunteerShiftWhereInput =
    statusFilter === 'all'
      ? {}
      : statusFilter === 'archived'
        ? { OR: [{ archivedAt: { not: null } }, { cancelledAt: { not: null } }, { status: 'Cancelled' }, { event: { is: { archivedAt: { not: null } } } }, { event: { is: { cancelledAt: { not: null } } } }] }
        : { archivedAt: null, cancelledAt: null, NOT: { status: 'Cancelled' }, event: { is: { archivedAt: null, cancelledAt: null, NOT: { status: 'Cancelled' } } } }

  // shiftStatus is applied after fetching (below) so the button labels can show
  // honest counts for whichever Active/Archived/All tab is selected.

  const allShifts = await prisma.volunteerShift.findMany({
    where,
    include: { event: true, assignments: { include: { member: true }, orderBy: [{ member: { firstName: 'asc' } }, { member: { lastName: 'asc' } }] } },
    orderBy: { startsAt: 'asc' },
  })

  const activeAssignmentCount = (shift: (typeof allShifts)[number]) =>
    shift.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)).length

  const isUnderStaffed = (shift: (typeof allShifts)[number]) =>
    shift.status === 'Open' && activeAssignmentCount(shift) < shift.neededCount

  // Counts for the button labels, so a filter that would change nothing is
  // obvious before you click it rather than looking broken afterwards.
  const needsCount = allShifts.filter(isUnderStaffed).length
  const openCount = allShifts.filter((shift) => shift.status === 'Open').length

  const shifts = allShifts
    .filter((shift) => (needsVolunteersOnly ? isUnderStaffed(shift) : true))
    .filter((shift) => (shiftStatusFilter ? shift.status === shiftStatusFilter : true))

  const isCheckIn = admin.role === 'CHECK_IN'
  const shiftDetailPath = (shiftId: string) => (isCheckIn ? `/shifts/volunteer-check-in?shift=${shiftId}` : `/shifts/${shiftId}/edit`)

  const filterQuery = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (statusFilter !== 'active') p.set('status', statusFilter)
    for (const [key, value] of Object.entries(extra)) {
      if (value) p.set(key, value)
    }
    const qs = p.toString()
    return qs ? `/shifts?${qs}` : '/shifts'
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <ActionNotice message={params.actionMessage} status={params.actionStatus} />
        <div className="mb-6">
          <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">← Dashboard</Link>
        </div>
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteer Shifts</h1>
              <p className="mt-3 text-lg text-[#B7B7B7]">Manage volunteer shift needs, coverage, status, and check-in.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/shifts/volunteer-check-in" className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]">Volunteer Check-in</Link>
              <Link href="/shifts/calendar" className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Calendar View</Link>
              {!isCheckIn && <Link href="/shifts/new" className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]">Add Shift</Link>}
              <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center">
                <div className="text-sm font-semibold text-[#B7B7B7]">Showing</div>
                <div className="text-3xl font-bold text-white">{shifts.length}</div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {[['active', 'Active'], ['archived', 'Archived'], ['all', 'All']].map(([value, label]) => (
              <Link key={value} href={value === 'active' ? '/shifts' : `/shifts?status=${value}`} className={statusFilter === value && !needsVolunteersOnly && !shiftStatusFilter ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white' : 'rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]'}>
                {label}
              </Link>
            ))}

            <span className="mx-1 self-center text-[#3A1215]">|</span>

            <Link
              href={filterQuery({
              needs: needsVolunteersOnly ? '' : '1',
              shiftStatus: shiftStatusFilter || '',
            })}
              className={needsVolunteersOnly ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white' : 'rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white'}
            >
              Needs Volunteers
            </Link>

            <Link
              href={filterQuery({
              needs: needsVolunteersOnly ? '1' : '',
              shiftStatus: shiftStatusFilter === 'Open' ? '' : 'Open',
            })}
              className={shiftStatusFilter === 'Open' && !needsVolunteersOnly ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white' : 'rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]'}
            >
              Open Only
            </Link>
          </div>
          <div className="mt-8 grid gap-5">
            {shifts.map((shift) => {
              const activeAssignments = shift.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status))
              const assignedCount = activeAssignments.length
              const checkedInCount = shift.assignments.filter((a) => a.checkedIn).length
              const attendedCount = shift.assignments.filter((a) => a.status === 'Attended').length
              const cancelledCount = shift.assignments.filter((a) => a.status === 'Cancelled').length
              const noShowCount = shift.assignments.filter((a) => a.status === 'No Show').length
              const remainingCount = Math.max(shift.neededCount - assignedCount, 0)
              return (
                <div key={shift.id} className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link href={shiftDetailPath(shift.id)} className="text-2xl font-bold text-[#B11218] hover:text-[#D11A22] hover:underline">{shift.title}</Link>
                      <p className="mt-2 text-[#B7B7B7]">{shift.description || 'No description yet.'}</p>
                      <p className="mt-2 text-sm text-[#D11A22]">Event: {shift.event.title}</p>
                      <p className="mt-2 text-sm font-bold text-[#B7B7B7]">Click shift title to {isCheckIn ? 'check in volunteers' : 'manage shift'}.</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <span className="rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white">{shift.status}</span>
                      {shift.archivedAt && <span className="rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white">Archived</span>}
                      {(shift.cancelledAt || shift.status === 'Cancelled') && <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-bold text-white">Cancelled</span>}
                      <Link href={shiftDetailPath(shift.id)} className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
                        {isCheckIn ? 'Check‑in' : 'Edit / Status'}
                      </Link>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Starts</div><div className="mt-2 font-bold text-white">{formatDate(shift.startsAt)}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Location</div><div className="mt-2 font-bold text-white">{shift.location || '—'}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Assigned</div><div className="mt-2 font-bold text-white">{assignedCount} / {shift.neededCount}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Still Needed</div><div className="mt-2 font-bold text-white">{remainingCount}</div></div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Checked In</div><div className="mt-2 text-2xl font-bold text-white">{checkedInCount}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Attended</div><div className="mt-2 text-2xl font-bold text-white">{attendedCount}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">Cancelled</div><div className="mt-2 text-2xl font-bold text-white">{cancelledCount}</div></div>
                    <div className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4"><div className="text-sm font-semibold text-[#8F8F8F]">No Show</div><div className="mt-2 text-2xl font-bold text-white">{noShowCount}</div></div>
                  </div>
                  {shift.assignments.length > 0 && (
                    <div className="mt-5 rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4">
                      <div className="text-sm font-semibold text-[#8F8F8F]">Assigned Volunteers</div>
                      <div className="mt-3 grid gap-2">
                        {shift.assignments.map((assignment) => (
                          <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#151111] px-4 py-3">
                            {isCheckIn ? (
                              <span className="font-bold text-white">{assignment.member.preferredName || assignment.member.firstName} {assignment.member.lastName}</span>
                            ) : (
                              <Link href={`/members/${assignment.member.id}`} className="font-bold text-[#B11218] hover:text-[#D11A22] hover:underline">{assignment.member.preferredName || assignment.member.firstName} {assignment.member.lastName}</Link>
                            )}
                            <div className="flex flex-wrap gap-2 text-sm">
                              <span className="rounded-full bg-[#2A0E10] px-3 py-1 font-bold text-white">{assignment.status}</span>
                              <span className="rounded-full bg-[#2A0E10] px-3 py-1 font-bold text-white">Checked In: {assignment.checkedIn ? 'Yes' : 'No'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {shifts.length === 0 && <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-[#B7B7B7]">No volunteer shifts yet.</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
