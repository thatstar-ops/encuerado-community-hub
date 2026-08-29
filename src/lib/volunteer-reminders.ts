import { prisma } from './prisma'
import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'
import { getDailyEmailBudget } from './email-budget'
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

type ReminderEntry = { assignmentId: string; shift: ShiftForReminder }

/** One shift rendered as plain text for the {{shiftList}} placeholder. */
function formatShiftBlock(
  shift: ShiftForReminder,
  todayKey: string,
  index: number,
  total: number
) {
  const daysUntil = calendarDayDiff(todayKey, getEventDateKey(shift.startsAt))
  const lines = [
    `${total > 1 ? `${index + 1}. ` : ''}${shift.title} (${shift.event.title})`,
    `When: ${formatShiftTime(shift.startsAt)} (${relativeTimeFor(daysUntil)})`,
    `Where: ${shift.location || 'TBC'}`,
  ]
  if (shift.role?.description) {
    lines.push('')
    lines.push('What you will be doing:')
    lines.push(shift.role.description)
  }
  return lines.join('\n')
}

/**
 * ONE email per volunteer, listing every shift they are being reminded about.
 *
 * Previously this sent one email per assignment, so a volunteer with three
 * shifts got three near-identical emails - noisy for them, and with several
 * events in the same week it pushed the daily send count towards Resend's
 * free-tier cap of 100/day. Grouping by person collapses ~116 assignments
 * into ~46 emails.
 *
 * The soonest shift drives the subject line and the "relativeTime" wording.
 * The old single-shift placeholders still resolve (against that soonest
 * shift) so a template that has not been updated keeps working instead of
 * printing raw {{tokens}}.
 */
async function sendVolunteerReminderEmail(
  member: AssignmentForReminder['member'],
  entries: ReminderEntry[],
  settings: ShiftReminderSettings,
  todayKey: string
) {
  const sorted = [...entries].sort(
    (a, b) => a.shift.startsAt.getTime() - b.shift.startsAt.getTime()
  )
  const next = sorted[0].shift
  const daysUntilNext = calendarDayDiff(todayKey, getEventDateKey(next.startsAt))

  const shiftList = sorted
    .map((entry, i) => formatShiftBlock(entry.shift, todayKey, i, sorted.length))
    .join('\n\n- - - - -\n\n')

  const values = {
    firstName: member.firstName,
    shiftCount: String(sorted.length),
    shiftList,
    shiftTitle: sorted.length === 1 ? next.title : `${sorted.length} shifts`,
    eventTitle: next.event.title,
    shiftTime: formatShiftTime(next.startsAt),
    location: next.location || '',
    // Falls back to the full list when there is more than one shift, so an
    // un-updated template still shows every shift rather than just one.
    roleDescription: sorted.length === 1 ? next.role?.description || '' : shiftList,
    relativeTime: relativeTimeFor(daysUntilNext),
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
    console.error('[sendVolunteerReminderEmail]', errorMessage, {
      memberId: member.id,
      shifts: sorted.length,
    })

    await prisma.emailLog.create({
      data: { memberId: member.id, status: 'Failed', error: errorMessage, source: 'ShiftReminder' },
    })

    return false
  }
}

/** Group eligible assignments by volunteer, soonest shift first. */
function groupByVolunteer(
  shifts: Array<ShiftForReminder & { assignments: AssignmentForReminder[] }>
) {
  const byMember = new Map<
    string,
    { member: AssignmentForReminder['member']; entries: ReminderEntry[] }
  >()
  let skipped = 0

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      if (!isEligible(assignment.member)) {
        skipped++
        continue
      }
      const existing = byMember.get(assignment.member.id)
      if (existing) {
        existing.entries.push({ assignmentId: assignment.id, shift })
      } else {
        byMember.set(assignment.member.id, {
          member: assignment.member,
          entries: [{ assignmentId: assignment.id, shift }],
        })
      }
    }
  }

  const soonest = (entries: ReminderEntry[]) =>
    Math.min(...entries.map((entry) => entry.shift.startsAt.getTime()))

  const recipients = [...byMember.values()].sort(
    (a, b) => soonest(a.entries) - soonest(b.entries)
  )

  return { recipients, skipped }
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
  budget,
}: {
  settings: ShiftReminderSettings
  todayKey: string
  daysBefore: number
  sentField: 'reminderSentAt' | 'secondReminderSentAt'
  budget: { remaining: number }
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
    orderBy: { startsAt: 'asc' },
    select: {
      ...SHIFT_SELECT,
      assignments: {
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES }, [sentField]: null },
        select: ASSIGNMENT_SELECT,
      },
    },
  })

  const { recipients, skipped } = groupByVolunteer(shifts)

  let sent = 0
  let failed = 0
  let deferred = 0

  for (const recipient of recipients) {
    // Recipients are ordered soonest-shift-first, so when the daily budget
    // runs out it is the least urgent reminders that get held over.
    if (budget.remaining <= 0) {
      deferred++
      continue
    }

    const ok = await sendVolunteerReminderEmail(
      recipient.member,
      recipient.entries,
      settings,
      todayKey
    )

    if (ok) {
      budget.remaining--
      sent++
      // Stamp every assignment covered by that one email.
      await prisma.volunteerAssignment.updateMany({
        where: { id: { in: recipient.entries.map((entry) => entry.assignmentId) } },
        data: { [sentField]: new Date() },
      })
    } else {
      failed++
    }
  }

  return { shiftsChecked: shifts.length, sent, failed, skipped, deferred }
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

  const { recipients, skipped } = groupByVolunteer(shifts)

  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    const ok = await sendVolunteerReminderEmail(
      recipient.member,
      recipient.entries,
      settings,
      todayKey
    )
    if (ok) sent++
    else failed++
  }

  return { shiftsChecked: shifts.length, sent, failed, skipped, deferred: 0 }
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

  // Campaigns, reminders and transactional email all draw on the same Resend
  // free-tier allowance (100/day). Campaigns already budget themselves; this
  // makes reminders do the same instead of sending until Resend rejects them.
  const snapshot = await getDailyEmailBudget()
  const budget = { remaining: snapshot.remaining }

  // The final "your shift is tomorrow" touchpoint runs first: if the budget
  // runs out, the reminder that matters most is the one already sent.
  const second = await runTouchpoint({
    settings,
    todayKey,
    daysBefore: settings.secondDaysBefore,
    sentField: 'secondReminderSentAt',
    budget,
  })
  const first = await runTouchpoint({
    settings,
    todayKey,
    daysBefore: settings.daysBefore,
    sentField: 'reminderSentAt',
    budget,
  })

  const deferred = first.deferred + second.deferred
  if (deferred > 0) {
    console.warn(
      `[shiftReminders] ${deferred} volunteer(s) held over to tomorrow - daily email budget reached ` +
        `(limit ${snapshot.limit}, campaigns reserved ${snapshot.campaignReserved}, other sends ${snapshot.otherSent}).`
    )
  }

  return {
    shiftsChecked: first.shiftsChecked + second.shiftsChecked,
    sent: first.sent + second.sent,
    failed: first.failed + second.failed,
    skipped: first.skipped + second.skipped,
    deferred,
    budgetRemaining: budget.remaining,
  }
}
