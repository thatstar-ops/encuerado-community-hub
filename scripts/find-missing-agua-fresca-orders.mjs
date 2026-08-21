// The AdminMoneyTallies "Agua Fresca" card is built from TicketPurchase rows
// (paid status only). This script instead scans the raw TicketSpiceWebhookLog
// payloads directly for any order containing an "aguasFrescasOpenBar" ticket
// (or a product name matching the Agua Fresca patterns), regardless of
// whether it ever turned into a TicketPurchase row - to catch orders that
// failed to process, are stuck unprocessed, or got misclassified.
//
// Read-only. No database changes.
//
// Usage:
//   node scripts/find-missing-agua-fresca-orders.mjs

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

function isAguaFrescaLabel(label) {
  const name = normalize(label)
  return (
    name.includes('AGUAS FRESCAS') ||
    name.includes('AGUA FRESCA') ||
    name.includes('PISS QUEEN')
  )
}

async function main() {
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    select: {
      id: true,
      status: true,
      error: true,
      receivedAt: true,
      processedAt: true,
      payloadJson: true,
    },
    orderBy: { receivedAt: 'asc' },
  })

  console.log(`Scanning ${logs.length} total webhook log(s) for Agua Fresca tickets...\n`)

  const matches = []

  for (const log of logs) {
    const data = log.payloadJson?.data
    const tickets = Array.isArray(data?.tickets) ? data.tickets : []

    for (const ticket of tickets) {
      const label = ticket?.ticketLabel || ticket?.name || ticket?.productName || ''
      const key = ticket?.ticketKey || ''
      if (isAguaFrescaLabel(label) || normalize(key).includes('AGUASFRESCA') || key === 'aguasFrescasOpenBar') {
        matches.push({
          logId: log.id,
          logStatus: log.status,
          logError: log.error,
          receivedAt: log.receivedAt,
          processedAt: log.processedAt,
          orderNumber: data?.orderNumber,
          orderStatus: data?.orderStatus,
          ticketId: ticket?.id,
          ticketLabel: label,
          ticketAmount: ticket?.amount,
          ticketTotal: ticket?.total,
        })
      }
    }
  }

  console.log(`Found ${matches.length} Agua Fresca ticket line item(s) across all webhook logs (any status):\n`)
  for (const m of matches) {
    console.log(
      `  order=${m.orderNumber || '(none)'} | orderStatus=${m.orderStatus || 'n/a'} | log=${m.logId} (${m.logStatus}${m.logError ? ', error: ' + m.logError : ''}) | ticketId=${m.ticketId} | amount=${m.ticketAmount} total=${m.ticketTotal} | label="${m.ticketLabel}"`
    )
  }

  // Cross-check against what actually landed in TicketPurchase.
  const purchases = await prisma.ticketPurchase.findMany({
    select: { externalLineItemId: true, externalOrderId: true, paymentStatus: true },
  })
  const purchaseLineItemIds = new Set(purchases.map((p) => p.externalLineItemId))

  const missing = matches.filter((m) => m.ticketId && !purchaseLineItemIds.has(m.ticketId))

  console.log(`\n=== Agua Fresca tickets seen in webhook logs but with NO matching TicketPurchase row (${missing.length}) ===`)
  for (const m of missing) {
    console.log(
      `  order=${m.orderNumber} | orderStatus=${m.orderStatus} | log=${m.logId} status=${m.logStatus}${m.logError ? ' error=' + m.logError : ''} | ticketId=${m.ticketId}`
    )
  }
  if (!missing.length) {
    console.log('  (none - every Agua Fresca ticket seen in webhook logs has a matching TicketPurchase row)')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
