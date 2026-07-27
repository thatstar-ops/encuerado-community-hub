import { NextResponse } from 'next/server'
import { processShiftReminders } from '@/lib/volunteer-reminders'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Same rule as the campaign queue cron: CRON_SECRET is the only real proof
  // this request came from our scheduled Vercel Cron job. Never trust
  // User-Agent or other attacker-controlled headers for this.
  const hasSecret = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`

  if (!hasSecret) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
  }

  const result = await processShiftReminders()

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
