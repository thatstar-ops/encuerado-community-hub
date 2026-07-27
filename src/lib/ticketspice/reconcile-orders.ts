import { prisma } from '@/lib/prisma'
import { sendOpsAlert } from '@/lib/ops-alerts'

// Same hardcoded exclusion as process-eligible-orders.ts - kept in sync
// manually since it's a one-off legacy exclusion, not real config.
const HARDCODED_EXCLUDED_ORDER_NUMBER = 'NCRDWKND2026-XZT0002'

// Grace period before an unprocessed-but-eligible order is considered
// "stuck" rather than just recently received and not yet picked up. The
// daily sweep uses the full default; the event-proximity sweep passes a
// much shorter threshold since it specifically wants to catch a failure
// that just happened, close to an event, fast.
const DEFAULT_STUCK_THRESHOLD_HOURS = 3

function normalizeKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Mirrors the order-level eligibility gates in process-eligible-orders.ts -
// an order that fails any of these is intentionally excluded (test order,
// wrong form, unpaid, etc.), not "stuck."
function isEligiblePaidOrder(data: any): boolean {
  if (!data || typeof data !== 'object') return false
  if (data.formName !== 'Encuerado Weekend 2026') return false
  if (!(Number(data.total || 0) > 0)) return false
  if (data.orderStatus !== 'completed') return false
  if (data.orderNumber === HARDCODED_EXCLUDED_ORDER_NUMBER) return false
  if (!data.billing?.email) return false
  if (!data.billing?.name?.first || !data.billing?.name?.last) return false
  return true
}

export type StuckOrder = {
  logId: string
  orderNumber: string
  buyer: string
  receivedAt: Date
  reason: string
}

/**
 * Finds webhook logs for orders that look genuinely eligible (paid,
 * completed, right form, has buyer info) but have sat unprocessed for
 * longer than a normal processing delay should take. Catches:
 *  - orders where our own processing threw partway through
 *  - orders that arrived but the automatic post-webhook processing never
 *    ran for some reason (deploy in progress, transient error swallowed
 *    upstream, etc.)
 *
 * Does NOT catch orders TicketSpice never sent us at all - nothing here
 * can detect a delivery that never happened, since there's no log row for
 * it to find. That failure mode has to be caught on TicketSpice's side
 * (their delivery log) or via a future reconciliation against their orders
 * API, if they offer one.
 */
export async function findStuckEligibleOrders(
  thresholdHours: number = DEFAULT_STUCK_THRESHOLD_HOURS
): Promise<StuckOrder[]> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000)

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      processedAt: null,
      receivedAt: { lt: cutoff },
    },
    select: {
      id: true,
      payloadJson: true,
      rawBody: true,
      receivedAt: true,
      status: true,
      error: true,
    },
    orderBy: { receivedAt: 'asc' },
  })

  const stuck: StuckOrder[] = []

  for (const log of logs) {
    let payload: any = log.payloadJson

    if (!payload && log.rawBody) {
      try {
        payload = JSON.parse(log.rawBody as string)
      } catch {
        continue
      }
    }

    if (!payload || typeof payload !== 'object') continue

    const eventType = payload.eventType || payload.event_type || payload.type || ''
    if (normalizeKey(eventType) !== 'registration') continue

    const data = payload.data
    if (!isEligiblePaidOrder(data)) continue

    stuck.push({
      logId: log.id,
      orderNumber: data.orderNumber || '(unknown order number)',
      buyer: `${data.billing?.name?.first || '?'} ${data.billing?.name?.last || '?'}`,
      receivedAt: log.receivedAt,
      reason: log.status === 'failed' ? `Processing error: ${log.error || 'unknown error'}` : 'Never processed',
    })
  }

  return stuck
}

/**
 * Runs the stuck-order check and, if anything is found, emails a summary.
 * Safe to call as often as needed - it only sends an alert when there's
 * something to report.
 */
export async function runOrderReconciliationSweep() {
  const stuck = await findStuckEligibleOrders()

  if (stuck.length === 0) {
    return { stuckCount: 0 }
  }

  await sendOpsAlert(
    `${stuck.length} TicketSpice order${stuck.length === 1 ? '' : 's'} stuck unprocessed`,
    [
      'These orders are marked completed and paid, but never finished turning into a member/ticket record. Check /admin/ticketspice-webhooks to review and reprocess.',
      ...stuck.map(
        (order) =>
          `Order ${order.orderNumber} (${order.buyer}), received ${order.receivedAt.toISOString()} - ${order.reason}`
      ),
    ]
  )

  return { stuckCount: stuck.length }
}
