import { NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ResetBody = {
  campaignId?: string
  onlyApiKeyInvalid?: boolean
}

export async function POST(request: Request) {
  try {
    await requireNonCheckInAdmin()

    const body = (await request.json().catch(() => ({}))) as ResetBody

    const where = {
      status: 'Failed',
      sentAt: null,
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      ...(body.onlyApiKeyInvalid === false
        ? {}
        : {
            OR: [
              { error: { contains: 'API key is invalid', mode: 'insensitive' as const } },
              { error: { contains: 'invalid_api_key', mode: 'insensitive' as const } },
              { error: { contains: 'Resend', mode: 'insensitive' as const } },
            ],
          }),
    }

    const result = await prisma.emailCampaignRecipientQueue.updateMany({
      where,
      data: {
        status: 'Scheduled',
        error: null,
        sentAt: null,
      },
    })

    const campaignIds = await prisma.emailCampaignRecipientQueue.findMany({
      where: body.campaignId ? { campaignId: body.campaignId } : {},
      select: {
        campaignId: true,
      },
      distinct: ['campaignId'],
    })

    for (const item of campaignIds) {
      const [sent, failed, skipped, scheduled, sending, total] = await Promise.all([
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId, status: 'Sent' } }),
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId, status: 'Failed' } }),
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId, status: 'Skipped' } }),
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId, status: 'Scheduled' } }),
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId, status: 'Sending' } }),
        prisma.emailCampaignRecipientQueue.count({ where: { campaignId: item.campaignId } }),
      ])

      const isDone = scheduled === 0 && sending === 0
      const status = isDone ? (sent > 0 || skipped > 0 ? 'Sent' : failed > 0 ? 'Failed' : 'Draft') : 'Scheduled'

      await prisma.emailCampaign.update({
        where: { id: item.campaignId },
        data: {
          status,
          recipientCount: total,
          sentCount: sent + skipped,
          failedCount: failed,
          sentAt: isDone && (sent > 0 || skipped > 0) ? new Date() : null,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      resetCount: result.count,
      message: `Reset ${result.count} failed queue item(s) back to Scheduled.`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset failed queue items.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}