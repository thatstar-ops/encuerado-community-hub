import { NextResponse } from 'next/server'
import { runEventProximitySweepIfDue } from '@/lib/ticketspice/event-proximity-check'

// NOT registered in vercel.json - Vercel's Hobby plan only allows cron jobs
// to run once per day, which is too infrequent for this check to reliably
// land near an event's start time. This endpoint is meant to be triggered
// by a free external scheduler (e.g. cron-job.org) every ~15 minutes
// instead. See the project docs / ask the team for the exact setup steps.
//
// Safe to poll as often as you like - it's a cheap no-op except in the
// ~15-minute window around T-60min and T-0 for any event happening soon.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const hasSecret = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`

  if (!hasSecret) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
  }

  const result = await runEventProximitySweepIfDue()

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
