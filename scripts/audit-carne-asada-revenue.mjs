// Diagnostic tool: prints every TicketPurchase row that looks like a Carne
// Asada ticket, plus a cross-check against the raw webhook log table to
// catch orders that never turned into a TicketPurchase at all.
//
// Read-only. Makes no writes. Run this against production (whatever
// DATABASE_URL your local .env points at) and paste the full output back.
//
// Usage:
//   node scripts/audit-carne-asada-revenue.mjs

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

function isCarneAsada(productName) {
  return normalize(productName).includes('CARNE ASADA')
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

// Mirrors AdminMoneyTallies.tsx's current (fixed) logic exactly, so we can
// see what the app is actually computing per row.
function knownBasePriceCents(productName) {
  const name = normalize(productName)
  if (name.includes('CARNE ASADA')) return 3000
  if (name.includes('AGUAS FRESCAS') || name.includes('AGUA FRESCA') || name.includes('PISS QUEEN')) return 5000
  return null
}

function currentTallyCents(purchase) {
  const raw = purchase.rawProductJson
  const rawAmount = raw?.amount != null && Number(raw.amount) > 0 ? Math.round(Number(raw.amount) * 100) : null
  if (rawAmount !== null) return rawAmount

  const pricePointAmount =
    raw?.pricePoint?.amount != null && Number(raw.pricePoint.amount) > 0
      ? Math.round(Number(raw.pricePoint.amount) * 100)
      : null
  if (pricePointAmount !== null) return pricePointAmount

  const pricePointPrice =
    raw?.pricePoint?.price != null && Number(raw.pricePoint.price) > 0
      ? Math.round(Number(raw.pricePoint.price) * 100)
      : null
  if (pricePointPrice !== null) return pricePointPrice

  if (purchase.amountPaidCents) return purchase.amountPaidCents

  const known = knownBasePriceCents(purchase.productName)
  if (known !== null) return known * Math.max(1, purchase.passCount || 1)

  return 0
}

async function main() {
  console.log('='.repeat(70))
  console.log('CARNE ASADA - TicketPurchase rows')
  console.log('='.repeat(70))

  const purchases = await prisma.ticketPurchase.findMany({
    include: {
      member: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { purchasedAt: 'asc' },
  })

  const carneRows = purchases.filter((p) => isCarneAsada(p.productName))

  let sumCurrentTally = 0
  let sumPassCount = 0
  let sumAmountPaidCents = 0
  const byPaymentStatus = {}
  const bySource = {}

  for (const p of carneRows) {
    const raw = p.rawProductJson || null
    const tally = currentTallyCents(p)
    sumCurrentTally += tally
    sumPassCount += p.passCount || 0
    sumAmountPaidCents += p.amountPaidCents || 0
    byPaymentStatus[p.paymentStatus || '(none)'] = (byPaymentStatus[p.paymentStatus || '(none)'] || 0) + 1
    bySource[p.externalSource] = (bySource[p.externalSource] || 0) + 1

    console.log(`\n---`)
    console.log(`id: ${p.id}`)
    console.log(`buyer: ${p.member?.firstName || '?'} ${p.member?.lastName || '?'} <${p.member?.email || '?'}>`)
    console.log(`productName: "${p.productName}"`)
    console.log(`externalSource: ${p.externalSource}  externalOrderId: ${p.externalOrderId}  lineItemId: ${p.externalLineItemId}`)
    console.log(`paymentStatus: ${p.paymentStatus}`)
    console.log(`passCount: ${p.passCount}`)
    console.log(`amountPaidCents (stored): ${p.amountPaidCents === null ? 'null' : money(p.amountPaidCents)}`)
    console.log(`purchasedAt: ${p.purchasedAt}`)
    console.log(`--> current tally contribution: ${money(tally)}`)
    if (raw) {
      console.log(`rawProductJson.amount: ${raw.amount}  .fee: ${raw.fee}  .total: ${raw.total}`)
      console.log(`rawProductJson.pricePoint: ${JSON.stringify(raw.pricePoint || null)}`)
    } else {
      console.log(`rawProductJson: (none - likely a manual entry)`)
    }
  }

  const PAYMENT_STATUS_ALLOWED = ['Paid', 'paid', 'PAID', 'Completed', 'completed', 'COMPLETED']
  const sumLiveAppWouldShow = carneRows
    .filter((p) => PAYMENT_STATUS_ALLOWED.includes(p.paymentStatus || ''))
    .reduce((sum, p) => sum + currentTallyCents(p), 0)
  const excludedByPaymentStatus = carneRows.filter(
    (p) => !PAYMENT_STATUS_ALLOWED.includes(p.paymentStatus || '')
  )

  console.log(`\n${'='.repeat(70)}`)
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total Carne Asada TicketPurchase rows: ${carneRows.length}`)
  console.log(`Sum of passCount across rows: ${sumPassCount}`)
  console.log(`Sum of stored amountPaidCents: ${money(sumAmountPaidCents)}`)
  console.log(`Sum using current pricing logic, ALL rows regardless of paymentStatus: ${money(sumCurrentTally)}`)
  console.log(
    `Sum the LIVE APP actually shows (paymentStatus-filtered, this is the real number): ${money(sumLiveAppWouldShow)}`
  )
  if (excludedByPaymentStatus.length) {
    console.log(
      `\n${excludedByPaymentStatus.length} row(s) excluded from the live app total due to paymentStatus not being in the allowed list:`
    )
    for (const p of excludedByPaymentStatus) {
      console.log(`  - id ${p.id} | paymentStatus: ${p.paymentStatus} | would contribute ${money(currentTallyCents(p))}`)
    }
  }
  console.log(`\nBy paymentStatus:`, byPaymentStatus)
  console.log(`By externalSource:`, bySource)

  // Cross-check: webhook logs mentioning Carne Asada that never became a
  // TicketPurchase at all - the "missing entirely" possibility.
  console.log(`\n${'='.repeat(70)}`)
  console.log('WEBHOOK LOGS mentioning "CARNE ASADA" (raw text search, ALL logs)')
  console.log('='.repeat(70))

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      rawBody: { contains: 'ARNE', mode: 'insensitive' },
    },
    select: {
      id: true,
      receivedAt: true,
      processedAt: true,
      status: true,
      error: true,
      rawBody: true,
    },
    orderBy: { receivedAt: 'asc' },
  })

  console.log(`Found ${logs.length} webhook log(s) mentioning "carne" (case-insensitive).`)

  for (const log of logs) {
    let orderNumber = '(unknown)'
    let total = '(unknown)'
    try {
      const parsed = JSON.parse(log.rawBody)
      orderNumber = parsed?.data?.orderNumber || '(unknown)'
      total = parsed?.data?.total ?? '(unknown)'
    } catch {
      // ignore parse errors, just show what we have
    }
    console.log(
      `- log ${log.id.slice(-8)} | received ${log.receivedAt.toISOString()} | order ${orderNumber} | order total $${total} | status: ${log.status} | processedAt: ${log.processedAt ? log.processedAt.toISOString() : 'NEVER'} | error: ${log.error || 'none'}`
    )
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
