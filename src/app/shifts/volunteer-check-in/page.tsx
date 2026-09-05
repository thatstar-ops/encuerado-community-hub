import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

const EVENT_TIME_ZONE = 'America/Los_Angeles'
const SHIRT_SHIFT_THRESHOLD = 3

function formatShiftTime(date: Date | null) {
  if (!date) return 'No time set'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatEndTime(date: Date | null) {
  if (!date) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

async function toggleVolunteerCheckIn(assignmentId: string, query: string, formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  const back = `/shifts/volunteer-check-in${query ? `?q=${encodeURIComponent(query)}` : ''}`
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(back)}`)

  const nextCheckedIn = String(formData.get('nextCheckedIn') || '') === 'true'
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: {
      checkedIn: nextCheckedIn,
      status: nextCheckedIn ? 'Attended' : 'Assigned',
    },
  })
  redirect(back)
}

async function toggleShirtGiven(assignmentId: string, query: string, formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  const back = `/shifts/volunteer-check-in${query ? `?q=${encodeURIComponent(query)}` : ''}`
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(back)}`)

  const nextShirtGiven = String(formData.get('nextShirtGiven') || '') === 'true'
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: { shirtGiven: nextShirtGiven },
  })
  redirect(back)
}

export default async function VolunteerCheckInSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/shifts/volunteer-check-in')

  const queryParams = searchParams ? await searchParams : {}
  const rawQuery = String(queryParams.q || '').trim()
  const query = rawQuery.toLowerCase()

  const assignments = rawQuery
    ? await prisma.volunteerAssignment.findMany({
        where: {
          shift: { archivedAt: null, cancelledAt: null },
        },
        include: {
          member: { include: { volunteerProfile: true } },
          shift: { include: { event: true } },
        },
        orderBy: { shift: { startsAt: 'asc' } },
      })
    : []

  // Match on the whole name so "jane smith" works, not just one field at a time.
  const matched = assignments.filter((assignment) => {
    const m = assignment.member
    const searchable = [
      m.firstName,
      m.lastName,
      m.preferredName,
      `${m.firstName} ${m.lastName}`,
      `${m.preferredName || ''} ${m.lastName}`,
      m.email,
      m.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchable.includes(query)
  })

  type Grouped = {
    memberId: string
    name: string
    email: string
    phone: string | null
    shirtSize: string | null
    rows: typeof matched
  }

  const groupMap = new Map<string, Grouped>()
  for (const assignment of matched) {
    const m = assignment.member
    if (!groupMap.has(m.id)) {
      groupMap.set(m.id, {
        memberId: m.id,
        name: `${m.preferredName || m.firstName} ${m.lastName}`.trim(),
        email: m.email,
        phone: m.phone,
        shirtSize: m.volunteerProfile?.shirtSize || null,
        rows: [],
      })
    }
    groupMap.get(m.id)!.rows.push(assignment)
  }

  const volunteers = Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  const now = new Date()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-6">
          <Link href="/shifts" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            Volunteer Shifts
          </Link>
          <Link href="/shifts/calendar" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            Shift Calendar
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">Volunteer Check-in</h1>
          <p className="mt-3 text-xl text-[#B7B7B7]">
            Search a volunteer by name. You will see every shift they signed up for, and can check them in on the right one.
          </p>

          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
            <form method="GET" action="/shifts/volunteer-check-in">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                <input
                  name="q"
                  defaultValue={rawQuery}
                  autoFocus
                  placeholder="Type volunteer name..."
                  className="rounded-xl border border-[#3A1215] bg-black p-5 text-2xl text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#B11218] px-8 py-5 text-xl font-bold text-white hover:bg-[#D11A22]"
                >
                  Search
                </button>
                <Link
                  href="/shifts/volunteer-check-in"
                  className="rounded-xl border border-[#B11218] px-8 py-5 text-center text-xl font-black uppercase tracking-wide text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Clear
                </Link>
              </div>
            </form>
            {rawQuery ? (
              <div className="mt-4 text-sm font-bold text-[#B7B7B7]">
                {volunteers.length} volunteer{volunteers.length === 1 ? '' : 's'} matched &quot;{rawQuery}&quot;
              </div>
            ) : null}
          </div>

          {!rawQuery ? (
            <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-8 text-center text-lg text-[#B7B7B7]">
              Type a name above to begin.
            </div>
          ) : volunteers.length === 0 ? (
            <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-8 text-center text-lg text-[#B7B7B7]">
              No volunteer found for &quot;{rawQuery}&quot;. Check the spelling, or try just the first name.
            </div>
          ) : (
            <div className="mt-8 grid gap-6">
              {volunteers.map((volunteer) => {
                const activeRows = volunteer.rows.filter((r) => r.status !== 'Cancelled')
                const shiftCount = activeRows.length
                const shirtEligible = shiftCount >= SHIRT_SHIFT_THRESHOLD
                const shirtAlreadyGiven = volunteer.rows.some((r) => r.shirtGiven)

                return (
                  <div
                    key={volunteer.memberId}
                    className="rounded-2xl border border-[#2A0E10] bg-[#151111] p-6 shadow-xl"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-3xl font-bold text-[#B11218]">{volunteer.name}</h2>
                        <div className="mt-2 text-sm text-[#B7B7B7]">{volunteer.email}</div>
                        {volunteer.phone ? (
                          <div className="text-sm text-[#B7B7B7]">{volunteer.phone}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div className="rounded-xl border border-[#3A1215] bg-black px-5 py-3 text-center">
                          <div className="text-xs font-semibold uppercase text-[#8F8F8F]">Shifts</div>
                          <div className="text-2xl font-black text-white">{shiftCount}</div>
                        </div>
                        <div className="rounded-xl border border-[#3A1215] bg-black px-5 py-3 text-center">
                          <div className="text-xs font-semibold uppercase text-[#8F8F8F]">Shirt Size</div>
                          <div className="text-2xl font-black text-white">{volunteer.shirtSize || '--'}</div>
                        </div>
                        <div
                          className={`rounded-xl border px-5 py-3 text-center ${
                            shirtEligible
                              ? 'border-[#B11218] bg-[#2A0E10]'
                              : 'border-[#3A1215] bg-black'
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase text-[#8F8F8F]">Shirt</div>
                          <div className="text-lg font-black text-white">
                            {shirtAlreadyGiven ? 'GIVEN' : shirtEligible ? 'ELIGIBLE' : 'NO'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3">
                      {volunteer.rows.map((assignment) => {
                        const shift = assignment.shift
                        const isPast = shift.endsAt
                          ? shift.endsAt.getTime() < now.getTime()
                          : shift.startsAt.getTime() < now.getTime()
                        const endLabel = formatEndTime(shift.endsAt)
                        const checkInAction = toggleVolunteerCheckIn.bind(
                          null,
                          assignment.id,
                          rawQuery,
                        )
                        const shirtAction = toggleShirtGiven.bind(null, assignment.id, rawQuery)

                        return (
                          <div
                            key={assignment.id}
                            className={`rounded-xl border p-5 ${
                              assignment.checkedIn
                                ? 'border-[#B11218] bg-[#1B0D0E]'
                                : 'border-[#3A1215] bg-black'
                            } ${isPast && !assignment.checkedIn ? 'opacity-60' : ''}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="text-xl font-bold text-white">{shift.title}</div>
                                <div className="mt-1 text-base text-[#B7B7B7]">
                                  {formatShiftTime(shift.startsAt)}
                                  {endLabel ? ` - ${endLabel}` : ''}
                                </div>
                                <div className="mt-1 text-sm text-[#8F8F8F]">
                                  {shift.event.title}
                                  {shift.location ? ` - ${shift.location}` : ''}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold uppercase">
                                  <span className="rounded-md border border-[#3A1215] px-2 py-1 text-[#B7B7B7]">
                                    {assignment.status}
                                  </span>
                                  {assignment.checkedIn ? (
                                    <span className="rounded-md bg-[#B11218] px-2 py-1 text-white">
                                      Checked In
                                    </span>
                                  ) : null}
                                  {assignment.shirtGiven ? (
                                    <span className="rounded-md border border-[#B11218] px-2 py-1 text-[#B11218]">
                                      Shirt Given
                                    </span>
                                  ) : null}
                                  {isPast ? (
                                    <span className="rounded-md border border-[#3A1215] px-2 py-1 text-[#777777]">
                                      Past
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2">
                                <form action={checkInAction}>
                                  <input
                                    type="hidden"
                                    name="nextCheckedIn"
                                    value={assignment.checkedIn ? 'false' : 'true'}
                                  />
                                  <button
                                    type="submit"
                                    className={
                                      assignment.checkedIn
                                        ? 'w-full rounded-xl border border-[#B11218] px-6 py-4 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white'
                                        : 'w-full rounded-xl bg-[#B11218] px-6 py-4 text-lg font-bold text-white hover:bg-[#D11A22]'
                                    }
                                  >
                                    {assignment.checkedIn ? 'Undo Check-in' : 'Check In'}
                                  </button>
                                </form>
                                <form action={shirtAction}>
                                  <input
                                    type="hidden"
                                    name="nextShirtGiven"
                                    value={assignment.shirtGiven ? 'false' : 'true'}
                                  />
                                  <button
                                    type="submit"
                                    className="w-full rounded-xl border border-[#3A1215] px-6 py-3 text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                  >
                                    {assignment.shirtGiven ? 'Undo Shirt Given' : 'Mark Shirt Given'}
                                  </button>
                                </form>
                                <Link
                                  href={`/shifts/${shift.id}/check-in`}
                                  className="w-full rounded-xl border border-[#3A1215] px-6 py-3 text-center text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                >
                                  Open Shift
                                </Link>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
