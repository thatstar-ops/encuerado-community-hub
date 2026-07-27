import { NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPromotionalEmail } from '@/lib/email'
import { renderCampaignHtml } from '@/lib/campaign-content'

type Params = {
  params: Promise<{
    id: string
  }>
}

type TestBody = {
  email?: string
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function ensureTestMember(email: string) {
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

  return prisma.member.create({
    data: {
      email,
      firstName: 'Test',
      lastName: 'Recipient',
    },
    select: {
      id: true,
    },
  })
}

export async function POST(request: Request, context: Params) {
  try {
    await requireNonCheckInAdmin()

    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as TestBody
    const email = String(body.email || '').trim().toLowerCase()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: 'A valid test email address is required.' },
        { status: 400 }
      )
    }

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id },
    })

    if (!campaign) {
      return NextResponse.json(
        { ok: false, error: 'Campaign not found.' },
        { status: 404 }
      )
    }

    const member = await ensureTestMember(email)
    const html = renderCampaignHtml(campaign.content, campaign.body)

    const result = await sendPromotionalEmail({
      to: email,
      subject: `[TEST] ${campaign.subject}`,
      html,
      memberId: member.id,
      campaignId: campaign.id,
    })

    if (result.status === 'Sent') {
      return NextResponse.json({
        ok: true,
        status: result.status,
        testEmail: email,
        message: `Test email sent to ${email}.`,
      })
    }

    if (result.status === 'Skipped') {
      return NextResponse.json({
        ok: false,
        status: result.status,
        testEmail: email,
        error: result.reason || 'Test email was skipped.',
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: false,
      status: result.status,
      testEmail: email,
      error: result.error || 'Test email failed.',
    }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test email.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}