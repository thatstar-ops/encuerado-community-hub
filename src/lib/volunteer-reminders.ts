import { prisma } from './prisma'
import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'
import { eventDateTimeLocalToUtcDate, getEventDateKey, EVENT_TIME_ZONE } from './timezone'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed']

// Pure calendar-day increment on a "YYYY-MM-DD" key. Not timezone sensitive -
// it only does date arithmetic on already-resolved LA calendar dates.
function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate()
  ).padStart(2, '0')}`
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

async function sendShiftReminderEmail(assignment: {
  id: string
  member: { id: string; email: string; firstName: string }
  shift: { title: string; location: string | null; startsAt: Date; event: { title: string } }
}) {
  const { member, shift } = assignment
  const subject = `Reminder: your volunteer shift tomorrow - ${shift.title}`

  const safeFirstName = escapeHtml(member.firstName)
  const safeShiftTitle = escapeHtml(shift.title)
  const safeEventTitle = escapeHtml(shift.event.title)
  const safeLocation = shift.location ? escapeHtml(shift.location) : null
  const safeTime = escapeHtml(formatShiftTime(shift.startsAt))

  const html = `
    <h2>Hello ${safeFirstName},</h2>
    <p>Just a reminder that you're signed up for a volunteer shift tomorrow:</p>
    <p><strong>${safeShiftTitle}</strong> (${safeEventTitle})</p>
    <p><strong>When:</strong> ${safeTime}</p>
    ${safeLocation ? `<p><strong>Where:</strong> ${safeLocation}</p>` : ''}
    <p>Thank you for volunteering - we couldn't do this without you!</p>
    <p>— Encuerado Team</p>
  `

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
      data: { memberId: member.id, status: 'Sent' },
    })

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Shift reminder failed.'
    console.error('[sendShiftReminderEmail]', errorMessage, { assignmentId: assignment.id })

    await prisma.emailLog.create({
      data: { memberId: member.id, status: 'Failed', error: errorMessage },
    })

    return false
  }
}

/**
 * Finds every active (Assigned/Confirmed) volunteer assignment for a shift
 * starting "tomorrow" in America/Los_Angeles wall-clock time, sends a
 * reminder email to each volunteer who hasn't already gotten one for that
 * assignment, and marks reminderSentAt so the daily cron never double-sends.
 *
 * Respects the same volunteer contact consent rule used for campaign
 * targeting (VolunteerProfile.consentToContact / archivedAt) and skips
 * archived members.
 */
export async function processShiftReminders() {
  const todayKey = getEventDateKey(new Date())
  const tomorrowKey = nextDateKey(todayKey)
  const dayAfterKey = nextDateKey(tomorrowKey)

  const windowStart = eventDateTimeLocalToUtcDate(`${tomorrowKey}T00:00`)
  const windowEnd = eventDateTimeLocalToUtcDate(`${dayAfterKey}T00:00`)

  const shifts = await prisma.volunteerShift.findMany({
    where: {
      startsAt: { gte: windowStart, lt: windowEnd },
      archivedAt: null,
      cancelledAt: null,
    },
    select: {
      id: true,
      title: true,
      location: true,
      startsAt: true,
      event: { select: { title: true } },
      assignments: {
        where: {
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
          reminderSentAt: null,
        },
        select: {
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
        },
      },
    },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      const { member } = assignment

      if (
        member.archivedAt ||
        member.volunteerProfile?.archivedAt ||
        member.volunteerProfile?.consentToContact === false
      ) {
        skipped++
        continue
      }

      const ok = await sendShiftReminderEmail({
        id: assignment.id,
        member,
        shift: { title: shift.title, location: shift.location, startsAt: shift.startsAt, event: shift.event },
      })

      await prisma.volunteerAssignment.update({
        where: { id: assignment.id },
        data: { reminderSentAt: new Date() },
      })

      if (ok) sent++
      else failed++
    }
  }

  return { shiftsChecked: shifts.length, sent, failed, skipped }
}
