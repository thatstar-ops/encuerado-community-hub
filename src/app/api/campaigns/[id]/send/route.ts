import { NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { sendCampaign } from '@/lib/campaign-send'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireNonCheckInAdmin()

    const { id } = await context.params
    const result = await sendCampaign(id)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule campaign.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}