import { prisma } from '@/lib/prisma'
import { findStuckEligibleOrders } from './reconcile-orders'
import { sendOpsAlert } from '@/lib/ops-alerts'

// How wide a match window counts as "at" a checkpoint. Must be at least as
// wide as however often the external scheduler polls this endpoint (see
// the cron route for setup instructions), or a checkpoint could be missed
// entirely between two polls.
const CHECK_WINDOW_MINUTES = 15

// Tighter than the daily sweep's 3-hour grace period - this check exists
// specifically to catch a failure that happened recently, close to an
// event, before people start showing up at the door.
const URGENT_STUCK_THRESHOLD_HOURS = 0.5

function isWithinWindow(target: Date, now: Date, windowMinutes: number) {
  return Math.abs(now.getTime() - target.getTime()) <= windowMinutes * 60 * 1000
}

/**
 * Meant to be polled frequently (e.g. every 15 min) by an external
 * scheduler. Cheap no-op on every call except the two checkpoints per
 * event: ~1 hour before it starts, and right at start time. On those
 * calls, runs the stuck-order check and emails a summary if anything's
 * wrong.
 */
export async function runEventProximitySweepIfDue() {
  const now = new Date()

  const events = await prisma.event.findMany({
    where: {
      archivedAt: null,
      cancelledAt: null,
      startsAt: {
        gte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lte: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    },
    select: { id: true, title: true, startsAt: true },
  })

  const dueCheckpoints: { title: string; checkpoint: 'starts in ~1 hour' | 'starting now' }[] = []

  for (const event of events) {
    const oneHourBefore = new Date(event.startsAt.getTime() - 60 * 60 * 1000)

    if (isWithinWindow(oneHourBefore, now, CHECK_WINDOW_MINUTES)) {
      dueCheckpoints.push({ title: event.title, checkpoint: 'starts in ~1 hour' })
    }
    if (isWithinWindow(event.startsAt, now, CHECK_WINDOW_MINUTES)) {
      dueCheckpoints.push({ title: event.title, checkpoint: 'starting now' })
    }
  }

  if (dueCheckpoints.length === 0) {
    return { triggered: false, stuckCount: 0 }
  }

  const stuck = await findStuckEligibleOrders(URGENT_STUCK_THRESHOLD_HOURS)

  if (stuck.length === 0) {
    return { triggered: true, stuckCount: 0 }
  }

  await sendOpsAlert(
    `${stuck.length} stuck TicketSpice order${stuck.length === 1 ? '' : 's'} — event starting soon`,
    [
      `Triggered by: ${dueCheckpoints.map((c) => `${c.title} (${c.checkpoint})`).join('; ')}.`,
      'These orders are marked completed and paid, but never turned into a member/ticket record. Check /admin/ticketspice-webhooks now, before people arrive.',
      ...stuck.map(
        (order) =>
          `Order ${order.orderNumber} (${order.buyer}), received ${order.receivedAt.toISOString()} - ${order.reason}`
      ),
    ]
  )

  return { triggered: true, stuckCount: stuck.length }
}
