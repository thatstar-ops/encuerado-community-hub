import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

const EVENT_TIME_ZONE = 'America/Los_Angeles'
const SHIRT_SHIFT_THRESHOLD = 3
const BASE_PATH = '/shifts/volunteer-check-in'

function backPath(query: string, shiftId: string) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (shiftId) params.set('shift', shiftId)
  const qs = params.toString()
  return qs ? `${BASE_PATH}?${qs}` : BASE_PATH
}

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

function dayKey(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

async function toggleVolunteerCheckIn(assignmentId: string, query: string, shiftId: string) {
  'use server'
  const admin = await getCurrentAdmin()
  const back = backPath(query, shiftId)
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(back)}`)

  const current = await prisma.volunteerAssignment.findUnique({
    where: { id: assignmentId },
    select: { checkedIn: true },
  })
  const nextCheckedIn = !current?.checkedIn
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: {
      checkedIn: nextCheckedIn,
      status: nextCheckedIn ? 'Attended' : 'Assigned',
    },
  })
  redirect(back)
}

async function toggleShirtGiven(assignmentId: string, query: string, shiftId: string) {
  'use server'
  const admin = await getCurrentAdmin()
  const back = backPath(query, shiftId)
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(back)}`)

  const current = await prisma.volunteerAssignment.findUnique({
    where: { id: assignmentId },
    select: { shirtGiven: true },
  })
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: { shirtGiven: !current?.shirtGiven },
  })
  redirect(back)
}

async function setAssignmentStatus(assignmentId: string, query: string, shiftId: string, formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  const back = backPath(query, shiftId)
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(back)}`)

  const status = String(formData.get('status') || 'Assigned').trim()
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: {
      status,
      // Attended implies present; Cancelled / No Show clear the check-in.
      checkedIn: status === 'Attended',
    },
  })
  redirect(back)
}

const STATUS_OPTIONS = ['Assigned', 'Attended', 'Cancelled', 'No Show']

export default async function VolunteerCheckInPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; shift?: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(BASE_PATH)}`)

  const queryParams = searchParams ? await searchParams : {}
  const rawQuery = String(queryParams.q || '').trim()
  const query = rawQuery.toLowerCase()
  const shiftId = String(queryParams.shift || '').trim()

  // A name search always wins - if someone is typing a name, show the person.
  const mode: 'search' | 'shift' | 'browse' = rawQuery ? 'search' : shiftId ? 'shift' : 'browse'

  const now = new Date()

  // ---------- MODE: search by name across every shift ----------
  const assignments =
    mode === 'search'
      ? await prisma.volunteerAssignment.findMany({
          where: { shift: { archivedAt: null, cancelledAt: null } },
          include: {
            member: { include: { volunteerProfile: true } },
            shift: { include: { event: true } },
          },
          orderBy: { shift: { startsAt: 'asc' } },
        })
      : []

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

  // ---------- MODE: one shift's roster ----------
  const shift =
    mode === 'shift'
      ? await prisma.volunteerShift.findUnique({
          where: { id: shiftId },
          include: {
            event: true,
            assignments: {
              include: { member: { include: { volunteerProfile: true } } },
              orderBy: { member: { lastName: 'asc' } },
            },
          },
        })
      : null

  // ---------- MODE: browse all shifts ----------
  const allShifts =
    mode === 'browse'
      ? await prisma.volunteerShift.findMany({
          where: { archivedAt: null, cancelledAt: null },
          include: { event: true, assignments: true },
          orderBy: { startsAt: 'asc' },
        })
      : []

  const shiftGroups: { label: string; shifts: typeof allShifts }[] = []
  for (const s of allShifts) {
    const label = dayKey(s.startsAt)
    const last = shiftGroups[shiftGroups.length - 1]
    if (last && last.label === label) last.shifts.push(s)
    else shiftGroups.push({ label, shifts: [s] })
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-6">
          <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            Dashboard
          </Link>
          <Link href="/shifts" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            Manage Shifts
          </Link>
          <Link href="/shifts/calendar" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            Shift Calendar
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">Volunteer Check-in</h1>
          <p className="mt-3 text-xl text-[#B7B7B7]">
            Search a volunteer by name, or pick a shift below. Both work from this one page.
          </p>

          {/* Search is always on top, in every mode. */}
          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
            <form method="GET" action={BASE_PATH}>
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
                  href={shiftId ? `${BASE_PATH}?shift=${shiftId}` : BASE_PATH}
                  className="rounded-xl border border-[#B11218] px-8 py-5 text-center text-xl font-black uppercase tracking-wide text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Clear
                </Link>
              </div>
            </form>
            {mode === 'search' ? (
              <div className="mt-4 text-sm font-bold text-[#B7B7B7]">
                {volunteers.length} volunteer{volunteers.length === 1 ? '' : 's'} matched &quot;{rawQuery}&quot; across all
                shifts
                {shiftId ? (
                  <>
                    {' '}
                    &middot;{' '}
                    <Link href={`${BASE_PATH}?shift=${shiftId}`} className="text-[#B11218] hover:text-[#D11A22]">
                      back to the shift roster
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* ---------------- SEARCH RESULTS ---------------- */}
          {mode === 'search' ? (
            volunteers.length === 0 ? (
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
                    <div key={volunteer.memberId} className="rounded-2xl border border-[#2A0E10] bg-[#151111] p-6 shadow-xl">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-3xl font-bold text-[#B11218]">{volunteer.name}</h2>
                          <div className="mt-2 text-sm text-[#B7B7B7]">{volunteer.email}</div>
                          {volunteer.phone ? <div className="text-sm text-[#B7B7B7]">{volunteer.phone}</div> : null}
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
                              shirtEligible ? 'border-[#B11218] bg-[#2A0E10]' : 'border-[#3A1215] bg-black'
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
                          const s = assignment.shift
                          const isPast = s.endsAt
                            ? s.endsAt.getTime() < now.getTime()
                            : s.startsAt.getTime() < now.getTime()
                          const endLabel = formatEndTime(s.endsAt)
                          const checkInAction = toggleVolunteerCheckIn.bind(null, assignment.id, rawQuery, shiftId)
                          const shirtAction = toggleShirtGiven.bind(null, assignment.id, rawQuery, shiftId)

                          return (
                            <div
                              key={assignment.id}
                              className={`rounded-xl border p-5 ${
                                assignment.checkedIn ? 'border-[#B11218] bg-[#1B0D0E]' : 'border-[#3A1215] bg-black'
                              } ${isPast && !assignment.checkedIn ? 'opacity-60' : ''}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <div className="text-xl font-bold text-white">{s.title}</div>
                                  <div className="mt-1 text-base text-[#B7B7B7]">
                                    {formatShiftTime(s.startsAt)}
                                    {endLabel ? ` - ${endLabel}` : ''}
                                  </div>
                                  <div className="mt-1 text-sm text-[#8F8F8F]">
                                    {s.event.title}
                                    {s.location ? ` - ${s.location}` : ''}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold uppercase">
                                    <span className="rounded-md border border-[#3A1215] px-2 py-1 text-[#B7B7B7]">
                                      {assignment.status}
                                    </span>
                                    {assignment.checkedIn ? (
                                      <span className="rounded-md bg-[#B11218] px-2 py-1 text-white">Checked In</span>
                                    ) : null}
                                    {assignment.shirtGiven ? (
                                      <span className="rounded-md border border-[#B11218] px-2 py-1 text-[#B11218]">
                                        Shirt Given
                                      </span>
                                    ) : null}
                                    {isPast ? (
                                      <span className="rounded-md border border-[#3A1215] px-2 py-1 text-[#777777]">Past</span>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                  <form action={checkInAction}>
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
                                    <button
                                      type="submit"
                                      className="w-full rounded-xl border border-[#3A1215] px-6 py-3 text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                    >
                                      {assignment.shirtGiven ? 'Undo Shirt Given' : 'Mark Shirt Given'}
                                    </button>
                                  </form>
                                  <Link
                                    href={`${BASE_PATH}?shift=${s.id}`}
                                    className="w-full rounded-xl border border-[#3A1215] px-6 py-3 text-center text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                  >
                                    Open Whole Shift
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
            )
          ) : null}

          {/* ---------------- ONE SHIFT'S ROSTER ---------------- */}
          {mode === 'shift' ? (
            !shift ? (
              <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-8 text-center text-lg text-[#B7B7B7]">
                That shift no longer exists.{' '}
                <Link href={BASE_PATH} className="text-[#B11218] hover:text-[#D11A22]">
                  Back to all shifts
                </Link>
              </div>
            ) : (
              <div className="mt-8">
                <div className="rounded-2xl border border-[#2A0E10] bg-[#151111] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-[#B11218]">{shift.title}</h2>
                      <div className="mt-2 text-lg text-[#B7B7B7]">
                        {formatShiftTime(shift.startsAt)}
                        {formatEndTime(shift.endsAt) ? ` - ${formatEndTime(shift.endsAt)}` : ''}
                      </div>
                      <div className="mt-1 text-sm text-[#8F8F8F]">
                        {shift.event.title}
                        {shift.location ? ` - ${shift.location}` : ''}
                      </div>
                    </div>
                    <Link
                      href={BASE_PATH}
                      className="rounded-xl border border-[#B11218] px-6 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                    >
                      All Shifts
                    </Link>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-[#3A1215] bg-black p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">Needed</div>
                      <div className="mt-2 text-3xl font-black text-white">{shift.neededCount}</div>
                    </div>
                    <div className="rounded-xl border border-[#3A1215] bg-black p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">Assigned</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {shift.assignments.filter((a) => a.status !== 'Cancelled').length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#3A1215] bg-black p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">Checked In</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {shift.assignments.filter((a) => a.checkedIn).length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#3A1215] bg-black p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">Shirts Given</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {shift.assignments.filter((a) => a.shirtGiven).length}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {shift.assignments.length === 0 ? (
                    <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-[#B7B7B7]">
                      No volunteers assigned to this shift yet.
                    </div>
                  ) : (
                    shift.assignments.map((assignment) => {
                      const m = assignment.member
                      const name = `${m.preferredName || m.firstName} ${m.lastName}`.trim()
                      const checkInAction = toggleVolunteerCheckIn.bind(null, assignment.id, rawQuery, shift.id)
                      const shirtAction = toggleShirtGiven.bind(null, assignment.id, rawQuery, shift.id)
                      const statusAction = setAssignmentStatus.bind(null, assignment.id, rawQuery, shift.id)

                      return (
                        <div
                          key={assignment.id}
                          className={`rounded-xl border p-5 ${
                            assignment.checkedIn ? 'border-[#B11218] bg-[#1B0D0E]' : 'border-[#3A1215] bg-[#151111]'
                          } ${assignment.status === 'Cancelled' ? 'opacity-60' : ''}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="text-2xl font-bold text-white">{name}</div>
                              <div className="mt-1 text-sm text-[#B7B7B7]">
                                Shirt size: {m.volunteerProfile?.shirtSize || '--'}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold uppercase">
                                <span className="rounded-md border border-[#3A1215] px-2 py-1 text-[#B7B7B7]">
                                  {assignment.status}
                                </span>
                                {assignment.checkedIn ? (
                                  <span className="rounded-md bg-[#B11218] px-2 py-1 text-white">Checked In</span>
                                ) : null}
                                {assignment.shirtGiven ? (
                                  <span className="rounded-md border border-[#B11218] px-2 py-1 text-[#B11218]">
                                    Shirt Given
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2">
                              <form action={checkInAction}>
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
                                <button
                                  type="submit"
                                  className="w-full rounded-xl border border-[#3A1215] px-6 py-3 text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                >
                                  {assignment.shirtGiven ? 'Undo Shirt Given' : 'Mark Shirt Given'}
                                </button>
                              </form>
                              <form action={statusAction} className="flex gap-2">
                                <select
                                  name="status"
                                  defaultValue={assignment.status}
                                  className="rounded-lg border border-[#3A1215] bg-black p-2 text-sm text-white focus:border-[#B11218] focus:outline-none"
                                >
                                  {STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-bold text-[#B7B7B7] hover:border-[#B11218] hover:text-white"
                                >
                                  Set
                                </button>
                              </form>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          ) : null}

          {/* ---------------- BROWSE ALL SHIFTS ---------------- */}
          {mode === 'browse' ? (
            allShifts.length === 0 ? (
              <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-8 text-center text-lg text-[#B7B7B7]">
                No active shifts.
              </div>
            ) : (
              <div className="mt-8 grid gap-8">
                {shiftGroups.map((group) => (
                  <div key={group.label}>
                    <h2 className="text-2xl font-black uppercase tracking-wide text-white">{group.label}</h2>
                    <div className="mt-4 grid gap-3">
                      {group.shifts.map((s) => {
                        const assignedCount = s.assignments.filter((a) => a.status !== 'Cancelled').length
                        const checkedInCount = s.assignments.filter((a) => a.checkedIn).length
                        const isPast = s.endsAt
                          ? s.endsAt.getTime() < now.getTime()
                          : s.startsAt.getTime() < now.getTime()
                        const endLabel = formatEndTime(s.endsAt)

                        return (
                          <Link
                            key={s.id}
                            href={`${BASE_PATH}?shift=${s.id}`}
                            className={`block rounded-xl border border-[#3A1215] bg-[#151111] p-5 hover:border-[#B11218] ${
                              isPast ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="text-xl font-bold text-[#B11218]">{s.title}</div>
                                <div className="mt-1 text-base text-[#B7B7B7]">
                                  {formatShiftTime(s.startsAt)}
                                  {endLabel ? ` - ${endLabel}` : ''}
                                </div>
                                <div className="mt-1 text-sm text-[#8F8F8F]">
                                  {s.event.title}
                                  {s.location ? ` - ${s.location}` : ''}
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="rounded-xl border border-[#3A1215] bg-black px-5 py-3 text-center">
                                  <div className="text-xs font-semibold uppercase text-[#8F8F8F]">Checked In</div>
                                  <div className="text-2xl font-black text-white">
                                    {checkedInCount}/{assignedCount}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </main>
  )
}
