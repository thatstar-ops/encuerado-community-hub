'use server'

import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import { requireNonCheckInAdmin } from './auth'
import { ensureShiftReminderSettings } from './shift-reminder-settings'
import { processShiftReminders } from './volunteer-reminders'

function redirectWithNotice(status: 'success' | 'blocked', message: string): never {
  const params = new URLSearchParams({ actionStatus: status, actionMessage: message })
  redirect(`/admin/volunteer-shift-reminders?${params.toString()}`)
}

export async function updateShiftReminderSettings(formData: FormData) {
  const admin = await requireNonCheckInAdmin()

  const daysBeforeRaw = String(formData.get('daysBefore') || '').trim()
  const secondDaysBeforeRaw = String(formData.get('secondDaysBefore') || '').trim()
  const subjectTemplate = String(formData.get('subjectTemplate') || '').trim()
  const bodyTemplate = String(formData.get('bodyTemplate') || '').trim()

  const daysBefore = Number(daysBeforeRaw)
  const secondDaysBefore = Number(secondDaysBeforeRaw)

  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 30) {
    redirectWithNotice('blocked', 'First reminder timing must be a whole number between 0 and 30 days before.')
  }

  if (!Number.isInteger(secondDaysBefore) || secondDaysBefore < 0 || secondDaysBefore > 30) {
    redirectWithNotice('blocked', 'Second reminder timing must be a whole number between 0 and 30 days before.')
  }

  if (!subjectTemplate) {
    redirectWithNotice('blocked', 'Subject line is required.')
  }

  if (!bodyTemplate) {
    redirectWithNotice('blocked', 'Email body is required.')
  }

  const settings = await ensureShiftReminderSettings()

  await prisma.shiftReminderSettings.update({
    where: { id: settings.id },
    data: {
      daysBefore,
      secondDaysBefore,
      subjectTemplate,
      bodyTemplate,
      updatedByEmail: admin.email,
    },
  })

  redirectWithNotice('success', 'Shift reminder settings saved.')
}

// Unrestricted manual blast: sends to every active assignment on every
// upcoming shift, no window, no dedup. This intentionally does NOT reuse the
// automatic cron's dedup bookkeeping - it will re-send to volunteers already
// reminded (duplicates are allowed on purpose) and never touches
// reminderSentAt/secondReminderSentAt, so it can't suppress a future
// automatic touchpoint. The only filter left is the standard consent/archived
// guard.
export async function sendShiftRemindersNowAction(formData: FormData) {
  await requireNonCheckInAdmin()

  const confirmed = formData.get('confirmSendNow')
  if (confirmed !== 'yes') {
    redirectWithNotice('blocked', 'Please confirm before sending reminders now.')
  }

  const result = await processShiftReminders({ mode: 'manual' })

  const message =
    result.sent === 0 && result.failed === 0
      ? `No reminders sent - no upcoming shifts have active assignments (checked ${result.shiftsChecked} shift(s)).`
      : `Sent ${result.sent} reminder(s), ${result.failed} failed, ${result.skipped} skipped (no consent/archived) - checked ${result.shiftsChecked} upcoming shift(s), all assignments regardless of prior sends (duplicates allowed).`

  redirectWithNotice(result.failed > 0 ? 'blocked' : 'success', message)
}
