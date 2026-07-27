import { prisma } from './prisma'
import { sendPromotionalEmail } from './email'
import { resolveCampaignRecipients, RecipientType } from './recipients'
import { parseCampaignContent, renderCampaignHtml, validateCampaignContent } from './campaign-content'

export const DAILY_CAMPAIGN_EMAIL_LIMIT = 95

const ACTIVE_QUEUE_STATUSES = ['Scheduled', 'Sending', 'Sent']

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function formatDateForMessage(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
  }).format(date)
}

async function usedQueueCapacityForDay(dayStart: Date) {
  const dayEnd = addUtcDays(dayStart, 1)

  return prisma.emailCampaignRecipientQueue.count({
    where: {
      scheduledFor: {
        gte: dayStart,
        lt: dayEnd,
      },
      status: {
        in: ACTIVE_QUEUE_STATUSES,
      },
    },
  })
}

async function nextScheduleSlot(cursor: Date) {
  let day = startOfUtcDay(cursor)

  for (let safety = 0; safety < 365; safety++) {
    const used = await usedQueueCapacityForDay(day)

    if (used < DAILY_CAMPAIGN_EMAIL_LIMIT) {
      return {
        day,
        remaining: DAILY_CAMPAIGN_EMAIL_LIMIT - used,
      }
    }

    day = addUtcDays(day, 1)
  }

  throw new Error('Could not find an available campaign email schedule day.')
}

async function ensureMemberForRecipient(email: string, name?: string | null) {
  const existing = await prisma.member.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  })

  if (existing) return existing

  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] || 'Email'
  const lastName = parts.slice(1).join(' ') || 'Recipient'

  return prisma.member.create({
    data: {
      email,
      firstName,
      lastName,
    },
    select: {
      id: true,
    },
  })
}

export async function sendCampaign(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      queues: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  })

  if (!campaign) throw new Error('Campaign not found')

  if (campaign.status === 'Sent') {
    throw new Error('This campaign has already been sent and cannot be sent again.')
  }

  if (campaign.status === 'Sending') {
    throw new Error('This campaign is already sending.')
  }

  if (campaign.status === 'Scheduled' || campaign.queues.length > 0) {
    throw new Error('This campaign has already been scheduled. Duplicate it to create a new campaign.')
  }

  if (process.env.NODE_ENV === 'development') {
    throw new Error('Campaign scheduling is disabled during local development.')
  }

  const blocks = parseCampaignContent(campaign.content)

  if (blocks) {
    const validation = validateCampaignContent(blocks)
    if (validation) throw new Error(validation)
  } else if (!campaign.body.trim()) {
    throw new Error('Campaign content is required.')
  }

  const resolution = await resolveCampaignRecipients({
    recipientType: campaign.recipientType as RecipientType,
    recipientEventId: campaign.recipientEventId,
    manualEmails: campaign.manualEmails,
    audienceConfig: campaign.audienceConfig,
  })

  const recipients = resolution.recipients
  const total = recipients.length

  if (!total) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'Failed',
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
      },
    })

    throw new Error('This campaign has no valid recipients.')
  }

  const scheduledRows: {
    campaignId: string
    memberId: string
    email: string
    name?: string | null
    source?: string | null
    status: string
    scheduledFor: Date
    batchNumber: number
  }[] = []

  let cursor = new Date()
  let slot = await nextScheduleSlot(cursor)
  let batchNumber = 1
  let usedInThisBatch = 0
  let firstScheduledFor: Date | null = null
  let lastScheduledFor: Date | null = null

  for (const recipient of recipients) {
    if (slot.remaining <= 0) {
      cursor = addUtcDays(slot.day, 1)
      slot = await nextScheduleSlot(cursor)
      batchNumber++
      usedInThisBatch = 0
    }

    if (usedInThisBatch >= DAILY_CAMPAIGN_EMAIL_LIMIT) {
      cursor = addUtcDays(slot.day, 1)
      slot = await nextScheduleSlot(cursor)
      batchNumber++
      usedInThisBatch = 0
    }

    const member = await ensureMemberForRecipient(recipient.email, recipient.name)

    scheduledRows.push({
      campaignId,
      memberId: member.id,
      email: recipient.email,
      name: recipient.name || null,
      source: recipient.source || null,
      status: 'Scheduled',
      scheduledFor: slot.day,
      batchNumber,
    })

    firstScheduledFor ||= slot.day
    lastScheduledFor = slot.day

    slot.remaining--
    usedInThisBatch++
  }

  await prisma.emailCampaignRecipientQueue.createMany({
    data: scheduledRows,
    skipDuplicates: true,
  })

  const actualQueuedCount = await prisma.emailCampaignRecipientQueue.count({
    where: {
      campaignId,
    },
  })

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'Scheduled',
      recipientCount: actualQueuedCount,
      sentCount: 0,
      failedCount: 0,
      sentAt: null,
    },
  })

  const nextAvailableSlot = await nextScheduleSlot(addUtcDays(lastScheduledFor || new Date(), 1))

  return {
    sentCount: 0,
    failedCount: 0,
    total: actualQueuedCount,
    scheduledCount: actualQueuedCount,
    batchCount: batchNumber,
    firstScheduledFor,
    lastScheduledFor,
    nextAvailableCampaignDate: nextAvailableSlot.day,
    message:
      `Campaign scheduled for ${actualQueuedCount} recipients over ${batchNumber} day(s). ` +
      `First batch: ${firstScheduledFor ? formatDateForMessage(firstScheduledFor) : 'N/A'}. ` +
      `Next new campaign can start: ${formatDateForMessage(nextAvailableSlot.day)}.`,
  }
}

export async function processDueCampaignQueue(options: { limit?: number } = {}) {
  const limit = options.limit || DAILY_CAMPAIGN_EMAIL_LIMIT
  const now = new Date()

  const rows = await prisma.emailCampaignRecipientQueue.findMany({
    where: {
      status: 'Scheduled',
      scheduledFor: {
        lte: now,
      },
    },
    include: {
      campaign: true,
    },
    orderBy: [
      { scheduledFor: 'asc' },
      { batchNumber: 'asc' },
      { createdAt: 'asc' },
    ],
    take: limit,
  })

  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0

  const renderedCampaigns = new Map<string, string>()

  for (const row of rows) {
    await prisma.emailCampaignRecipientQueue.update({
      where: { id: row.id },
      data: {
        status: 'Sending',
        error: null,
      },
    })

    try {
      let renderedHtml = renderedCampaigns.get(row.campaignId)

      if (!renderedHtml) {
        renderedHtml = renderCampaignHtml(row.campaign.content, row.campaign.body)
        renderedCampaigns.set(row.campaignId, renderedHtml)
      }

      const result = await sendPromotionalEmail({
        to: row.email,
        subject: row.campaign.subject,
        html: renderedHtml,
        memberId: row.memberId,
        campaignId: row.campaignId,
      })

      if (result.status === 'Sent') {
        sentCount++

        await prisma.emailCampaignRecipientQueue.update({
          where: { id: row.id },
          data: {
            status: 'Sent',
            sentAt: new Date(),
            error: null,
          },
        })
      } else if (result.status === 'Skipped') {
        skippedCount++

        await prisma.emailCampaignRecipientQueue.update({
          where: { id: row.id },
          data: {
            status: 'Skipped',
            sentAt: new Date(),
            error: result.reason || 'Skipped',
          },
        })
      } else {
        failedCount++

        await prisma.emailCampaignRecipientQueue.update({
          where: { id: row.id },
          data: {
            status: 'Failed',
            error: result.error || 'Failed',
          },
        })
      }
    } catch (error) {
      failedCount++

      const message = error instanceof Error ? error.message : 'Unknown email send error'

      await prisma.emailCampaignRecipientQueue.update({
        where: { id: row.id },
        data: {
          status: 'Failed',
          error: message,
        },
      })
    }
  }

  const touchedCampaignIds = [...new Set(rows.map((row) => row.campaignId))]

  for (const campaignId of touchedCampaignIds) {
    const [sent, failed, skipped, scheduled, sending, total] = await Promise.all([
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId, status: 'Sent' } }),
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId, status: 'Failed' } }),
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId, status: 'Skipped' } }),
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId, status: 'Scheduled' } }),
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId, status: 'Sending' } }),
      prisma.emailCampaignRecipientQueue.count({ where: { campaignId } }),
    ])

    const isDone = scheduled === 0 && sending === 0
    const finalStatus = isDone ? (sent > 0 || skipped > 0 ? 'Sent' : 'Failed') : 'Scheduled'

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: finalStatus,
        recipientCount: total,
        sentCount: sent + skipped,
        failedCount: failed,
        sentAt: isDone ? new Date() : null,
      },
    })
  }

  return {
    processed: rows.length,
    sentCount,
    failedCount,
    skippedCount,
    remainingDue: await prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Scheduled',
        scheduledFor: {
          lte: now,
        },
      },
    }),
  }
}

export async function getNextAvailableCampaignDate() {
  const slot = await nextScheduleSlot(new Date())
  return slot.day
}