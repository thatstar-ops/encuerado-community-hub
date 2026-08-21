// Checks for orders where multiple TicketPurchase rows share the same
// externalOrderId AND the same amountPaidCents equal to the order's total -
// the signature of the "zero-priced ticket falls back to full order total"
// bug, which duplicates an order's revenue once per free/bundled ticket in
// that order. Read-only.
//
// Usage:
//   node scripts/audit-order-total-duplication.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const purchases = await prisma.ticketPurchase.findMany({
    where: { externalSource: 'TicketSpice' },
    select: {
      id: true,
      externalOrderId: true,
      productName: true,
      amountPaidCents: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { externalOrderId: 'asc' },
  })

  const byOrder = new Map()
  for (const p of purchases) {
    if (!byOrder.has(p.externalOrderId)) byOrder.set(p.externalOrderId, [])
    byOrder.get(p.externalOrderId).push(p)
  }

  // Also pull order-level totals from webhook logs for comparison.
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    select: { rawBody: true, payloadJson: true },
  })
  const orderTotals = new Map()
  for (const log of logs) {
    let payload
    try {
      payload = log.payloadJson || (log.rawBody ? JSON.parse(log.rawBody) : null)
    } catch {
      continue
    }
    const data = payload?.data
    if (!data) continue
    const orderId = data.orderNumber || data.id
    if (orderId && data.total) orderTotals.set(orderId, Math.round(Number(data.total) * 100))
  }

  let flaggedOrders = 0
  let totalOvercountCents = 0

  console.log('Orders where 2+ purchase rows share the exact same amountPaidCents (possible duplication):\n')

  for (const [orderId, rows] of byOrder) {
    if (rows.length < 2) continue

    const orderTotalCents = orderTotals.get(orderId)
    const matchingOrderTotal = rows.filter((r) => r.amountPaidCents === orderTotalCents)

    if (matchingOrderTotal.length >= 2) {
      flaggedOrders++
      const overcountCents = (matchingOrderTotal.length - 1) * (orderTotalCents || 0)
      totalOvercountCents += overcountCents

      console.log(`Order ${orderId} (order total: $${(orderTotalCents || 0) / 100}):`)
      for (const r of rows) {
        const flag = r.amountPaidCents === orderTotalCents ? '  <-- matches full order total' : ''
        console.log(
          `  - ${r.member?.firstName || '?'} ${r.member?.lastName || '?'} | ${r.productName} | $${(r.amountPaidCents || 0) / 100}${flag}`
        )
      }
      console.log(`  Estimated overcount from this order: $${overcountCents / 100}\n`)
    }
  }

  if (flaggedOrders === 0) {
    console.log('None found - this appears to be an isolated case.')
  } else {
    console.log(`\nTotal flagged orders: ${flaggedOrders}`)
    console.log(`Total estimated overcount across all flagged orders: $${(totalOvercountCents / 100).toFixed(2)}`)
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
