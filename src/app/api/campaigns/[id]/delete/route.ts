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
    select: {
      id: true,
      status: true,
      sentAt: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  }

  if (campaign.status === 'Sent' || campaign.status === 'Sending' || campaign.sentAt) {
    return NextResponse.json(
      { error: 'Sent or sending campaigns cannot be deleted.' },
      { status: 400 }
    )
  }

  await prisma.emailCampaign.delete({
    where: { id },
  })

  return NextResponse.json({ ok: true })
}