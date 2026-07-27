import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { parseCampaignContent, validateCampaignContent } from '@/lib/campaign-content'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireNonCheckInAdmin()
  const { id } = await params

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(campaign)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireNonCheckInAdmin()
  const { id } = await params
  const existingCampaign = await prisma.emailCampaign.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existingCampaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  }

  if (existingCampaign.status === 'Sent') {
    return NextResponse.json(
      { error: 'Sent campaigns are locked. Duplicate this campaign to make a new draft.' },
      { status: 400 }
    )
  }

  if (existingCampaign.status === 'Sending') {
    return NextResponse.json(
      { error: 'This campaign is currently sending and cannot be edited.' },
      { status: 400 }
    )
  }

  const body = await req.json()
  const { title, subject, previewText, body: emailBody, fromEmail, recipientType, recipientEventId, manualEmails, audienceConfig, ctaButtonText, ctaUrl, status, content } = body
  const blocks = parseCampaignContent(content)
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
  if (blocks) {
    const validation = validateCampaignContent(blocks)
    if (validation) return NextResponse.json({ error: validation }, { status: 400 })
  } else if (!emailBody?.trim()) return NextResponse.json({ error: 'Add campaign content.' }, { status: 400 })

  const campaign = await prisma.emailCampaign.update({
    where: { id },
    data: {
      title,
      subject,
      previewText,
      body: emailBody,
      fromEmail,
      recipientType,
      recipientEventId,
      manualEmails,
      audienceConfig: audienceConfig || undefined,
      ctaButtonText,
      ctaUrl,
      status,
      content: blocks || undefined,
    },
  })

  return NextResponse.json(campaign)
}
