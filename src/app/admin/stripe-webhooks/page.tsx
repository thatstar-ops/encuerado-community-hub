import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { dryRunStripeAction, reprocessStripeFailedAction } from '@/lib/stripe/actions'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function maskEmail(email: string | null | undefined) {
  if (!email) return '—'
  const [local, domain] = String(email).split('@')
  if (!domain) return '***'
  return local.slice(0, 1) + '***@' + domain
}

function badgeColor(status: string, hasError: boolean) {
  if (hasError || status === 'failed') return 'bg-orange-600 text-white'
  if (status === 'processed') return 'bg-green-600 text-white'
  return 'bg-[#2A0E10] text-white'
}

export default async function StripeWebhooksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    dryRunResult?: string
    processResult?: string
    message?: string
    filter?: string
  }>
}) {
  await requireSuperAdmin()

  const params = await searchParams
  const activeFilter = ['unprocessed', 'failed'].includes(String(params?.filter || ''))
    ? String(params?.filter)
    : null

  let dryRunResult: any = null
  if (params?.dryRunResult) {
    try {
      dryRunResult = JSON.parse(params.dryRunResult)
    } catch {}
  }

  let processResult: any = null
  if (params?.processResult) {
    try {
      processResult = JSON.parse(params.processResult)
    } catch {}
  }

  const message = params?.message || null

  const logsWhere =
    activeFilter === 'unprocessed'
      ? { processedAt: null }
      : activeFilter === 'failed'
        ? { OR: [{ status: 'failed' }, { error: { not: null } }] }
        : {}

  const logs = await prisma.stripeWebhookLog.findMany({
    where: logsWhere,
    orderBy: { receivedAt: 'desc' },
    take: activeFilter ? 500 : 50,
    select: {
      id: true,
      stripeEventId: true,
      receivedAt: true,
      eventType: true,
      status: true,
      processedAt: true,
      error: true,
      payloadJson: true,
      lineItemsJson: true,
    },
  })

  const [totalCount, processedCount, failedCount, unprocessedCount] = await Promise.all([
    prisma.stripeWebhookLog.count(),
    prisma.stripeWebhookLog.count({ where: { processedAt: { not: null } } }),
    prisma.stripeWebhookLog.count({ where: { OR: [{ status: 'failed' }, { error: { not: null } }] } }),
    prisma.stripeWebhookLog.count({ where: { processedAt: null } }),
  ])

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Dashboard
          </Link>

          <div className="flex flex-wrap gap-4">
            <form action={dryRunStripeAction}>
              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Dry Run Unprocessed
              </button>
            </form>

            <form action={reprocessStripeFailedAction} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confirmProcess"
                  name="confirmProcess"
                  value="yes"
                  className="h-5 w-5 rounded border-[#3A1215] bg-[#0B0B0B] text-yellow-400 focus:ring-[#B11218]"
                />
                <label htmlFor="confirmProcess" className="text-sm font-medium text-[#B7B7B7]">
                  Retry failed/unprocessed Stripe events now.
                </label>
              </div>
              <button
                type="submit"
                className="rounded-lg border border-red-500 bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Reprocess Failed
              </button>
              <p className="mt-1 text-xs text-[#777777]">
                New events already auto-process on arrival - this is only for retries.
              </p>
            </form>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-200">
            {message}
          </div>
        )}

        {dryRunResult && (
          <div className="mb-6 rounded-xl border border-[#B11218]/50 bg-[#B11218]/10 p-4 text-yellow-100">
            <strong>Dry-Run Result:</strong>
            <pre className="mt-2 overflow-auto text-sm">{JSON.stringify(dryRunResult, null, 2)}</pre>
          </div>
        )}

        {processResult && (
          <div className="mb-6 rounded-xl border border-green-500/50 bg-green-500/10 p-4 text-green-100">
            <strong>Process Result:</strong>
            <pre className="mt-2 overflow-auto text-sm">{JSON.stringify(processResult, null, 2)}</pre>
          </div>
        )}

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">Stripe Webhooks</h1>
          <p className="mt-4 text-xl text-[#B7B7B7]">
            Captured Stripe checkout events - auto-processed into Member / TicketPurchase / EventRegistration records.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-[#2A0E10] px-4 py-2 text-sm font-bold text-white">
              Total: {totalCount}
            </span>
            <span className="rounded-full bg-green-600 px-4 py-2 text-sm font-bold text-white">
              Processed: {processedCount}
            </span>
            <span className="rounded-full bg-[#B11218] px-4 py-2 text-sm font-bold text-white">
              Unprocessed: {unprocessedCount}
            </span>
            <span className="rounded-full bg-orange-600 px-4 py-2 text-sm font-bold text-white">
              Failed: {failedCount}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/stripe-webhooks"
              className={
                !activeFilter
                  ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white'
                  : 'rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]'
              }
            >
              Recent 50
            </Link>
            <Link
              href="/admin/stripe-webhooks?filter=unprocessed"
              className={
                activeFilter === 'unprocessed'
                  ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white'
                  : 'rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white'
              }
            >
              Needs Processing
            </Link>
            <Link
              href="/admin/stripe-webhooks?filter=failed"
              className={
                activeFilter === 'failed'
                  ? 'rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white'
                  : 'rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white'
              }
            >
              Failed
            </Link>
          </div>

          <div className="mt-6 rounded-xl border border-[#B11218]/50 bg-[#B11218]/10 p-4 text-yellow-100">
            Webhook payloads may contain private buyer, order, and payment-related information.
            Do not share screenshots or copied payloads publicly.
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full min-w-[1200px] text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Received</th>
                  <th className="p-4 font-bold">Event Type</th>
                  <th className="p-4 font-bold">Session ID</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Buyer</th>
                  <th className="p-4 font-bold">Amount</th>
                  <th className="p-4 font-bold">Line Items</th>
                  <th className="p-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const payload = log.payloadJson as any
                  const session = payload?.data?.object || {}
                  const customer = session.customer_details || {}
                  const lineItems = Array.isArray(log.lineItemsJson) ? (log.lineItemsJson as any[]) : []
                  const lineItemLabels = lineItems
                    .map((item) => item?.description || item?.price?.product?.name || 'Unknown')
                    .join(', ')
                  const hasError = Boolean(log.error)

                  return (
                    <tr key={log.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]">
                      <td className="p-4 text-sm text-[#B7B7B7]">{formatDate(log.receivedAt)}</td>
                      <td className="p-4 text-sm text-[#B7B7B7]">{log.eventType || '—'}</td>
                      <td className="p-4 font-mono text-xs text-[#B11218]">{session.id || '—'}</td>
                      <td className="p-4">
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeColor(log.status, hasError)}`}>
                          {log.status}
                        </span>
                        <div className="mt-1 text-xs text-[#777777]">Processed: {formatDate(log.processedAt)}</div>
                        {log.error && <div className="mt-1 text-xs text-[#FFB3B6]">Error: {log.error}</div>}
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {customer.name || '—'}
                        <br />
                        <span className="text-xs text-[#777777]">{maskEmail(customer.email)}</span>
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)}` : '—'}
                      </td>
                      <td className="max-w-[220px] truncate p-4 text-sm text-[#8F8F8F]">
                        {lineItemLabels || '—'}
                      </td>
                      <td className="p-4">
                        <details className="cursor-pointer text-sm">
                          <summary className="text-[#B11218] hover:text-[#D11A22]">View Raw</summary>
                          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-black p-4 text-xs text-[#B7B7B7]">
                            {JSON.stringify({ payload: log.payloadJson, lineItems: log.lineItemsJson }, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
                No Stripe webhook logs captured yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
