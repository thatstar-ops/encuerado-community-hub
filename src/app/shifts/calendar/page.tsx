import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import {
  EVENT_TIME_ZONE,
  getEventDateKey,
  getEventHour,
  eventDateKeyAndHourToDateTimeLocal,
  eventDateTimeLocalToUtcDate,
} from '@/lib/timezone'

function startOfWeek(date: Date): Date {
  const dayKey = getEventDateKey(date);
  const [y, m, d] = dayKey.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const sundayDate = new Date(y, m - 1, d - dayOfWeek);
  const sundayKey = `${sundayDate.getFullYear()}-${String(sundayDate.getMonth() + 1).padStart(2, '0')}-${String(sundayDate.getDate()).padStart(2, '0')}`;
  return eventDateTimeLocalToUtcDate(`${sundayKey}T00:00`);
}

function addDays(date: Date, days: number): Date {
  const key = getEventDateKey(date);
  const [y, m, d] = key.split('-').map(Number);
  const future = new Date(y, m - 1, d + days);
  const futureKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  return eventDateTimeLocalToUtcDate(`${futureKey}T00:00`);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatWeekRange(start: Date, end: Date) {
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(start)} – ${new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end)}`;
}

function getHourLabel(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${suffix}`;
}

function toWeekParam(date: Date) {
  return getEventDateKey(date);
}

function parseWeekParam(value: string | undefined): Date {
  if (!value) return new Date();
  return eventDateTimeLocalToUtcDate(`${value}T00:00`);
}

export default async function ShiftCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/shifts/calendar')

  const params = searchParams ? await searchParams : {}
  let selectedDate: Date;
  if (params.week) {
    selectedDate = parseWeekParam(params.week);
  } else {
    const nextUpcomingEvent = await prisma.event.findFirst({
      where: { startsAt: { gte: new Date() }, archivedAt: null, cancelledAt: null, NOT: { status: 'Cancelled' } },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true },
    });
    selectedDate = nextUpcomingEvent?.startsAt || new Date();
  }

  const weekStart = startOfWeek(selectedDate)
  const weekEnd = addDays(weekStart, 7)
  const displayWeekEnd = addDays(weekStart, 6)

  const previousWeek = addDays(weekStart, -7)
  const nextWeek = addDays(weekStart, 7)
  const thisWeek = startOfWeek(new Date())

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const hours = Array.from({ length: 15 }, (_, index) => index + 7)

  const shifts = await prisma.volunteerShift.findMany({
    where: {
      startsAt: { gte: weekStart, lt: weekEnd },
      archivedAt: null,
      cancelledAt: null,
      NOT: { status: 'Cancelled' },
      event: { is: { archivedAt: null, cancelledAt: null, NOT: { status: 'Cancelled' } } },
    },
    include: { event: true, assignments: true },
    orderBy: { startsAt: 'asc' },
  })

  const isCheckIn = admin.role === 'CHECK_IN'
  const shiftDetailPath = (shiftId: string) => (isCheckIn ? `/shifts/volunteer-check-in?shift=${shiftId}` : `/shifts/${shiftId}/edit`)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/shifts" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">← Back to shifts</Link>
          <Link href="/shifts/volunteer-check-in" className="ml-6 text-base font-semibold text-[#B11218] hover:text-[#D11A22]">Volunteer Check-in</Link>
          <div className="flex flex-wrap gap-3">
            {!isCheckIn && <Link href="/shifts/new" className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]">Add Shift</Link>}
            {!isCheckIn && <Link href="/admin/volunteer-roles" className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Manage Roles</Link>}
            {!isCheckIn && <Link href="/admin/volunteer-shift-reminders" className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Reminder Email</Link>}
            <Link href="/volunteer-shifts" className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Public Signup View</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteer Shift Calendar</h1>
              <p className="mt-3 text-lg text-[#B7B7B7]">Click an empty slot to add a shift. Click an existing shift to {isCheckIn ? 'check in volunteers' : 'edit it'}.</p>
            </div>
            <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center"><div className="text-sm font-semibold text-[#B7B7B7]">Shifts This Week</div><div className="text-2xl font-bold text-white">{shifts.length}</div></div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <div><div className="text-sm font-bold text-[#8F8F8F]">Viewing Week</div><div className="mt-1 text-2xl font-bold text-white">{formatWeekRange(weekStart, displayWeekEnd)}</div></div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/shifts/calendar?week=${toWeekParam(previousWeek)}`} className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">← Previous Week</Link>
              <Link href={`/shifts/calendar?week=${toWeekParam(thisWeek)}`} className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">This Week</Link>
              <Link href={`/shifts/calendar?week=${toWeekParam(nextWeek)}`} className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Next Week →</Link>
            </div>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[#2A0E10]">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[90px_repeat(7,1fr)] border-b border-[#2A0E10] bg-[#151111]">
                <div className="p-3 text-sm font-bold text-[#B7B7B7]">Time</div>
                {days.map((day) => (
                  <div key={day.toISOString()} className="border-l border-[#2A0E10] p-3 text-center"><div className="text-sm font-bold text-white">{formatDay(day)}</div></div>
                ))}
              </div>
              {hours.map((hour) => (
                <div key={hour} className="grid min-h-[90px] grid-cols-[90px_repeat(7,1fr)] border-b border-slate-800">
                  <div className="bg-[#0B0B0B] p-3 text-sm font-bold text-[#8F8F8F]">{getHourLabel(hour)}</div>
                  {days.map((day) => {
                    const dayKey = getEventDateKey(day);
                    const startsAtValue = eventDateKeyAndHourToDateTimeLocal(dayKey, hour);
                    const endsAtValue = eventDateKeyAndHourToDateTimeLocal(dayKey, hour + 3);
                    const shiftsInSlot = shifts.filter((shift) => {
                      return getEventDateKey(shift.startsAt) === dayKey && getEventHour(shift.startsAt) === hour;
                    });
                    return (
                      <div key={`${day.toISOString()}-${hour}`} className="border-l border-slate-800 bg-black p-2 hover:bg-[#0B0B0B]">
                        {shiftsInSlot.length === 0 && !isCheckIn && (
                          <Link href={`/shifts/new?startsAt=${encodeURIComponent(startsAtValue)}&endsAt=${encodeURIComponent(endsAtValue)}`} className="flex h-full min-h-[70px] items-center justify-center rounded-lg border border-dashed border-[#2A0E10] text-xs font-bold text-[#777777] hover:border-[#B11218] hover:text-[#B11218]">
                            + Add shift
                          </Link>
                        )}
                        {shiftsInSlot.map((shift) => {
                          const assignedCount = shift.assignments.length
                          const checkedInCount = shift.assignments.filter((a) => a.checkedIn).length
                          const spotsLeft = Math.max(shift.neededCount - assignedCount, 0)
                          return (
                            <Link key={shift.id} href={shiftDetailPath(shift.id)} className="mb-2 block rounded-lg border border-[#B11218] bg-[#151111] p-3 shadow hover:bg-[#2A0E10]">
                              <div className="text-sm font-bold text-white">{shift.title}</div>
                              <div className="mt-1 text-xs text-[#D11A22]">{shift.event.title}</div>
                              <div className="mt-2 text-xs text-[#B7B7B7]">{formatTime(shift.startsAt)}{shift.endsAt ? ` – ${formatTime(shift.endsAt)}` : ''}</div>
                              <div className="mt-2 text-xs font-bold text-white">{assignedCount}/{shift.neededCount} assigned · {spotsLeft} left</div>
                              <div className="mt-1 text-xs font-bold text-white">Checked in: {checkedInCount}</div>
                              <div className="mt-2 text-xs font-bold text-[#B11218]">Click to {isCheckIn ? 'check in' : 'edit'}</div>
                            </Link>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <h2 className="text-xl font-bold text-white">How this works</h2>
            <p className="mt-2 text-[#B7B7B7]">Use Previous Week / This Week / Next Week to plan future shifts. Empty slot = add a new shift. Existing shift = edit that shift.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
