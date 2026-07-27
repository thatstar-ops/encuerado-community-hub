import { NextResponse } from 'next/server'
import { processDueCampaignQueue } from '@/lib/campaign-send'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // NOTE: Do not trust User-Agent or x-vercel-cron-schedule headers for auth —
  // both are fully attacker-controlled on an inbound request. CRON_SECRET is
  // the only real proof this request came from our scheduled Vercel Cron job.
  const hasSecret = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`

  if (!hasSecret) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
  }

  const result = await processDueCampaignQueue()

  return NextResponse.json({
    ok: true,
    ...result,
  })
}