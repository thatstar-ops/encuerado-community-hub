import { NextResponse } from 'next/server'
import { runOrderReconciliationSweep } from '@/lib/ticketspice/reconcile-orders'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const hasSecret = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`

  if (!hasSecret) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
  }

  const result = await runOrderReconciliationSweep()

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
