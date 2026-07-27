import { NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { processDueCampaignQueue } from '@/lib/campaign-send'

export async function POST() {
  try {
    await requireNonCheckInAdmin()
    const result = await processDueCampaignQueue()

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process campaign queue.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}