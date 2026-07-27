import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireNonCheckInAdmin()

  const { id } = await params

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  }

  const copy = await prisma.emailCampaign.create({
    data: {
      title: campaign.title ? `${campaign.title} Copy` : 'Campaign Copy',
      subject: campaign.subject,
      previewText: campaign.previewText,
      body: campaign.body,
      content: campaign.content === null ? undefined : campaign.content,
      fromEmail: campaign.fromEmail,
      recipientType: campaign.recipientType,
      recipientEventId: campaign.recipientEventId,
      manualEmails: campaign.manualEmails,
      audienceConfig: campaign.audienceConfig === null ? undefined : campaign.audienceConfig,
      ctaButtonText: campaign.ctaButtonText,
      ctaUrl: campaign.ctaUrl,
      status: 'Draft',
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      sentAt: null,
    },
  })

  return NextResponse.json(copy, { status: 201 })
}