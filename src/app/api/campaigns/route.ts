import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { parseCampaignContent, validateCampaignContent } from '@/lib/campaign-content'

export async function GET(req: NextRequest) {
  await requireNonCheckInAdmin()

  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(campaigns)
}

export async function POST(req: NextRequest) {
  await requireNonCheckInAdmin()

  const body = await req.json()
  const {
    title,
    subject,
    previewText,
    body: emailBody,
    fromEmail,
    recipientType,
    recipientEventId,
    manualEmails,
    audienceConfig,
    ctaButtonText,
    ctaUrl,
    status = 'Draft',
    content,
  } = body
  const blocks = parseCampaignContent(content)
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
  if (blocks) {
    const validation = validateCampaignContent(blocks)
    if (validation) return NextResponse.json({ error: validation }, { status: 400 })
  } else if (!emailBody?.trim()) return NextResponse.json({ error: 'Add campaign content.' }, { status: 400 })

  const campaign = await prisma.emailCampaign.create({
    data: {
      title,
      subject,
      previewText,
      body: emailBody,
      fromEmail,
      recipientType,
      recipientEventId: recipientEventId || null,
      manualEmails: manualEmails || null,
      audienceConfig: audienceConfig || undefined,
      ctaButtonText,
      ctaUrl,
      status,
      content: blocks || undefined,
    },
  })

  return NextResponse.json(campaign, { status: 201 })
}
