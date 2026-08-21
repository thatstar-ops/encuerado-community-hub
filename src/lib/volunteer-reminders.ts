import { prisma } from './prisma'
import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'
import { eventDateTimeLocalToUtcDate, getEventDateKey, EVENT_TIME_ZONE } from './timezone'
import {
  ensureShiftReminderSettings,
  renderReminderBodyHtml,
  renderReminderSubject,
  type ShiftReminderSettings,
} from './shift-reminder-settings'

const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed']

type ShiftForReminder = {
  id: string
  title: string
  location: string | null
  startsAt: Date
  event: { title: string }
  role: { title: string; description: string } | null
}

type AssignmentForReminder = {
  id: string
  member: {
    id: string
    email: string
    firstName: string
    archivedAt: Date | null
    volunteerProfile: { archivedAt: Date | null; consentToContact: boolean } | null
  }
}

const ASSIGNMENT_SELECT = {
  id: true,
  member: {
    select: {
      id: true,
      email: true,
      firstName: true,
      archivedAt: true,
      volunteerProfile: {
        select: { archivedAt: true, consentToContact: true },
      },
    },
  },
} as const

const SHIFT_SELECT = {
  id: true,
  title: true,
  location: true,
  startsAt: true,
  event: { select: { title: true } },
  role: { select: { title: true, description: true } },
} as const

// Pure calendar-day increment on a "YYYY-MM-DD" key. Not timezone sensitive -
// it only does date arithmetic on already-resolved LA calendar dates.
function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate()
  ).padStart(2, '0')}`
}

function addDaysToDateKey(dateKey: string, days: number): string {
  let key = dateKey
  for (let i = 0; i < days; i++) key = nextDateKey(key)
  return key
}

function formatShiftTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

// Calendar-day difference between two "YYYY-MM-DD" keys. Used to describe
// how far out a shift actually is in the email copy - NOT derived from
// either touchpoint setting, which only control when the automatic cron
// fires, not how far away any given shift really is (especially since
// manual sends can reach shifts at any distance).
function calendarDayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const fromUTC = Date.UTC(fy, fm - 1, fd)
  const toUTC = Date.UTC(ty, tm - 1, td)
  return Math.round((toUTC - fromUTC) / 86400000)
}

function relativeTimeFor(daysUntilShift: number) {
  if (daysUntilShift <= 0) return 'today'
  if (daysUntilShift === 1) return 'tomorrow'
  return `in ${daysUntilShift} days`
}

async function sendShiftReminderEmail(
  assignment: { id: string; member: AssignmentForReminder['member']; shift: ShiftForReminder },
  settings: ShiftReminderSettings,
  todayKey: string
) {
  const { member, shift } = assignment
  const shiftDateKey = getEventDateKey(shift.startsAt)
  const daysUntilShift = calendarDayDiff(todayKey, shiftDateKey)

  const values = {
    firstName: member.firstName,
    shiftTitle: shift.title,
    eventTitle: shift.event.title,
    shiftTime: formatShiftTime(shift.startsAt),
    location: shift.location || '',
    roleDescription: shift.role?.description || '',
    relativeTime: relativeTimeFor(daysUntilShift),
  }

  const subject = renderReminderSubject(settings.subjectTemplate, values)
  const html = renderReminderBodyHtml(settings.bodyTemplate, values)

  try {
    const fromEmail = getFromEmail()
    await withRetry(async () => {
      const { error } = await getResendClient().emails.send({
        from: fromEmail,
        to: [member.email],
        subject,
        html,
      })

      if (error) throw error
    })

    await prisma.emailLog.create({
      data: { memberId: member.id, status: 'Sent', source: 'ShiftReminder' },
    })

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Shift reminder failed.'
    console.error('[sendShiftReminderEmail]', errorMessage, { assignmentId: assignment.id })

    await prisma.emailLog.create({
      data: { memberId: member.id, status: 'Failed', error: errorMessage, source: 'ShiftReminder' },
    })

    return false
  }
}

function isEligible(member: AssignmentForReminder['member']) {
  return !(
    member.archivedAt ||
    member.volunteerProfile?.archivedAt ||
    member.volunteerProfile?.consentToContact === false
  )
}

/**
 * Runs one automatic touchpoint (the "7 days out" one or the "1 day out"
 * one): finds active assignments for shifts starting within the window
 * (today through `daysBefore` days out) that haven't gotten *this specific*
 * touchpoint yet (`sentField` still null), sends, and stamps `sentField` on
 * success only - a failed send is retried on tomorrow's run.
 */
async function runTouchpoint({
  settings,
  todayKey,
  daysBefore,
  sentField,
}: {
  settings: ShiftReminderSettings
  todayKey: string
  daysBefore: number
  sentField: 'reminderSentAt' | 'secondReminderSentAt'
}) {
  const clamped = Math.max(0, Math.min(60, Math.round(daysBefore)))
  const windowStart = eventDateTimeLocalToUtcDate(`${todayKey}T00:00`)
  const cutoffKey = addDaysToDateKey(todayKey, clamped)
  const windowEnd = eventDateTimeLocalToUtcDate(`${nextDateKey(cutoffKey)}T00:00`)

  const shifts = await prisma.volunteerShift.findMany({
    where: {
      startsAt: { gte: windowStart, lt: windowEnd },
      archivedAt: null,
      cancelledAt: null,
    },
    select: {
      ...SHIFT_SELECT,
      assignments: {
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES }, [sentField]: null },
        select: ASSIGNMENT_SELECT,
      },
    },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      if (!isEligible(assignment.member)) {
        skipped++
        continue
      }

      const ok = await sendShiftReminderEmail(
        { id: assignment.id, member: assignment.member, shift },
        settings,
        todayKey
      )

      if (ok) {
        sent++
        await prisma.volunteerAssignment.update({
          where: { id: assignment.id },
          data: { [sentField]: new Date() },
        })
      } else {
        failed++
      }
    }
  }

  return { shiftsChecked: shifts.length, sent, failed, skipped }
}

/**
 * The manual "Send Now" button: sends to every active assignment on every
 * upcoming shift, no window, no dedup - deliberately unrestricted per
 * request, including re-sending to someone already reminded (duplicates on
 * purpose). Does NOT touch reminderSentAt/secondReminderSentAt, so it can
 * never suppress or interfere with the automatic touchpoints' own
 * bookkeeping. Still skips archived/no-consent members - that's a contact
 * preference guard, not a timing restriction.
 */
async function runManualBlast(settings: ShiftReminderSettings, todayKey: string) {
  const windowStart = eventDateTimeLocalToUtcDate(`${todayKey}T00:00`)

  const shifts = await prisma.volunteerShift.findMany({
    where: {
      startsAt: { gte: windowStart },
      archivedAt: null,
      cancelledAt: null,
    },
    select: {
      ...SHIFT_SELECT,
      assignments: {
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
        select: ASSIGNMENT_SELECT,
      },
    },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      if (!isEligible(assignment.member)) {
        skipped++
        continue
      }

      const ok = await sendShiftReminderEmail(
        { id: assignment.id, member: assignment.member, shift },
        settings,
        todayKey
      )

      if (ok) sent++
      else failed++
    }
  }

  return { shiftsChecked: shifts.length, sent, failed, skipped }
}

/**
 * Automatic mode (default, called by the daily cron): runs both fixed
 * touchpoints - the early one (settings.daysBefore, default 7) and the
 * final one (settings.secondDaysBefore, default 1) - each independently
 * deduped, so an assignment can get both without either suppressing the
 * other.
 *
 * Manual mode ({ mode: 'manual' }, called by the admin's "Send Now"
 * button): unrestricted blast, see runManualBlast above.
 */
export async function processShiftReminders(options?: { mode?: 'manual' }) {
  const settings = await ensureShiftReminderSettings()
  const todayKey = getEventDateKey(new Date())

  if (options?.mode === 'manual') {
    return runManualBlast(settings, todayKey)
  }

  const first = await runTouchpoint({
    settings,
    todayKey,
    daysBefore: settings.daysBefore,
    sentField: 'reminderSentAt',
  })
  const second = await runTouchpoint({
    settings,
    todayKey,
    daysBefore: settings.secondDaysBefore,
    sentField: 'secondReminderSentAt',
  })

  return {
    shiftsChecked: first.shiftsChecked + second.shiftsChecked,
    sent: first.sent + second.sent,
    failed: first.failed + second.failed,
    skipped: first.skipped + second.skipped,
  }
}
