import { prisma } from './prisma'

// ============================================================
// SHARED DAILY EMAIL BUDGET
// ============================================================
// Resend's free tier allows 100 emails per calendar day. Everything this app
// sends draws on that one allowance: scheduled campaigns, volunteer shift
// reminders, and transactional confirmations.
//
// Campaigns have always budgeted themselves (DAILY_CAMPAIGN_EMAIL_LIMIT, 95,
// leaving 5 for transactional traffic) by spreading recipients across days.
// The shift reminder cron did not - it sent to every eligible assignment in
// one pass. With several events in the same week, one run can approach 100 on
// its own, and anything past the cap is rejected by Resend. A rejected
// reminder is retried the next day, which may be after the shift has already
// happened.
//
// This module is the shared view of what is left today so the reminder cron
// can stop before it starts producing failures.

// Kept a little under Resend's real 100 so transactional email (registration
// confirmations) still has room.
export const DAILY_EMAIL_LIMIT = 95

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * How many more emails can safely be sent today.
 *
 * Campaign capacity is counted from the queue (rows *scheduled* for today),
 * matching how the campaign scheduler reserves its slots - a campaign queued
 * but not yet processed must still be treated as spoken for. Everything else
 * is counted from EmailLog rows actually sent today.
 */
export async function getDailyEmailBudget(now: Date = new Date()) {
  const dayStart = startOfUtcDay(now)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const [campaignReserved, otherSent] = await Promise.all([
    prisma.emailCampaignRecipientQueue.count({
      where: {
        scheduledFor: { gte: dayStart, lt: dayEnd },
        status: { in: ['Scheduled', 'Sending', 'Sent'] },
      },
    }),
    prisma.emailLog.count({
      where: {
        sentAt: { gte: dayStart, lt: dayEnd },
        campaignId: null, // campaign sends are already counted above
        status: 'Sent',
      },
    }),
  ])

  const used = campaignReserved + otherSent
  return {
    limit: DAILY_EMAIL_LIMIT,
    campaignReserved,
    otherSent,
    used,
    remaining: Math.max(0, DAILY_EMAIL_LIMIT - used),
  }
}
