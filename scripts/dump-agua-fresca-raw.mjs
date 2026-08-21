// Dumps the FULL raw TicketSpice JSON for every Agua Fresca purchase, plus
// the parent TicketSpiceWebhookLog payload for the $45.01 outlier order, so
// we can see every field TicketSpice actually sends (fee breakdown, discount
// codes, price history, etc.) instead of guessing from the handful of fields
// the ingestion code currently reads.
//
// Read-only. No database changes.
//
// Usage:
//   node scripts/dump-agua-fresca-raw.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalize(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isAguaFrescaPurchase(productName) {
  const name = normalize(productName)
  return (
    name.includes('AGUAS FRESCAS') ||
    name.includes('AGUA FRESCA') ||
    name.includes('PISS QUEEN')
  )
}

async function main() {
  const purchases = await prisma.ticketPurchase.findMany({
    where: { paymentStatus: { in: ['Paid', 'paid', 'PAID', 'Completed', 'completed', 'COMPLETED'] } },
    select: {
      id: true,
      productName: true,
      amountPaidCents: true,
      purchasedAt: true,
      externalOrderId: true,
      externalLineItemId: true,
      rawProductJson: true,
    },
    orderBy: { purchasedAt: 'asc' },
  })

  const agua = purchases.filter((p) => isAguaFrescaPurchase(p.productName))

  console.log(`Dumping full raw JSON for ${agua.length} Agua Fresca purchase(s):\n`)

  for (const p of agua) {
    console.log('='.repeat(80))
    console.log(`id=${p.id}  order=${p.externalOrderId}  purchasedAt=${p.purchasedAt}  amountPaidCents=${p.amountPaidCents}`)
    console.log(JSON.stringify(p.rawProductJson, null, 2))
    console.log('')
  }

  // Also pull the raw webhook log(s) for the $45.01 outlier order specifically,
  // in case the order-level payload has fee/discount fields the per-line-item
  // snapshot doesn't.
  const outlierOrderId = 'NCRDWKND2026-XZT0009'
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      payloadJson: { path: ['data', 'orderNumber'], equals: outlierOrderId },
    },
  })

  console.log('='.repeat(80))
  console.log(`Webhook log(s) matching outlier order ${outlierOrderId}: ${logs.length}`)
  for (const log of logs) {
    console.log('-'.repeat(80))
    console.log(`log id=${log.id}  status=${log.status}  receivedAt=${log.receivedAt}`)
    console.log(JSON.stringify(log.payloadJson, null, 2))
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
