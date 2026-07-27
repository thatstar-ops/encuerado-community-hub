import { NextRequest, NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { resolveCampaignRecipients, RecipientType } from '@/lib/recipients'

export async function POST(req: NextRequest) {
  await requireNonCheckInAdmin()

  const body = await req.json()
  const { recipientType, recipientEventId, manualEmails, audienceConfig } = body

  if (!recipientType && !audienceConfig) {
    return NextResponse.json(
      { error: 'recipientType or audienceConfig is required' },
      { status: 400 }
    )
  }

  try {
    const resolution = await resolveCampaignRecipients({
      recipientType: (recipientType || 'combined') as RecipientType,
      recipientEventId: recipientEventId || null,
      manualEmails: manualEmails || null,
      audienceConfig: audienceConfig || null,
    })

    return NextResponse.json(resolution)
  } catch (error) {
    console.error('[preview-recipients]', error)
    return NextResponse.json(
      { error: 'Unable to resolve recipients.' },
      { status: 500 }
    )
  }
}