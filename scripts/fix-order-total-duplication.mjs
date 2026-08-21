// Fixes the 2 known orders where a bundled $0 ticket got stamped with the
// FULL order total instead of $0, duplicating that order's revenue in every
// money tally. For each affected order, keeps the correct amount on the row
// whose own raw ticket data actually had a nonzero total, and sets the
// bundled $0 rows to null (matches how a genuinely free add-on should read).
//
// Self-discovering via the same signature the audit script used: 2+
// TicketPurchase rows under one order sharing the exact order-level total
// as their amountPaidCents, cross-checked against the raw per-ticket amount
// in rawProductJson (not just the 2 orders already found - if more exist
// under the current data, this will catch them too).
//
// SAFE BY DEFAULT: dry run only. Re-run with --apply to write.
//
// Usage:
//   node scripts/fix-order-total-duplication.mjs            (dry run)
//   node scripts/fix-order-total-duplication.mjs --apply    (writes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const purchases = await prisma.ticketPurchase.findMany({
    where: { externalSource: 'TicketSpice' },
    select: {
      id: true,
      externalOrderId: true,
      productName: true,
      amountPaidCents: true,
      rawProductJson: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

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

  const byOrder = new Map()
  for (const p of purchases) {
    if (!byOrder.has(p.externalOrderId)) byOrder.set(p.externalOrderId, [])
    byOrder.get(p.externalOrderId).push(p)
  }

  const toFix = []

  for (const [orderId, rows] of byOrder) {
    if (rows.length < 2) continue
    const orderTotalCents = orderTotals.get(orderId)
    if (!orderTotalCents) continue

    const matchingOrderTotal = rows.filter((r) => r.amountPaidCents === orderTotalCents)
    if (matchingOrderTotal.length < 2) continue

    for (const row of matchingOrderTotal) {
      const raw = row.rawProductJson
      const ownAmount = Number(raw?.total ?? raw?.amount ?? raw?.price)
      const ownAmountIsReal = Number.isFinite(ownAmount) && ownAmount > 0 && Math.round(ownAmount * 100) === row.amountPaidCents

      // If this row's OWN raw ticket data genuinely matches the stored
      // amount (i.e. it's not a coincidence - it really is priced at the
      // order total), leave it alone. Only fix rows where the ticket's own
      // amount/total is 0 or missing but amountPaidCents got set to the
      // order total anyway.
      const ownRawAmount = Number(raw?.amount)
      const ownRawTotal = Number(raw?.total)
      const trulyZeroPriced =
        (!Number.isFinite(ownRawAmount) || ownRawAmount <= 0) &&
        (!Number.isFinite(ownRawTotal) || ownRawTotal <= 0)

      if (trulyZeroPriced) {
        toFix.push({
          id: row.id,
          orderId,
          productName: row.productName,
          buyer: `${row.member?.firstName || '?'} ${row.member?.lastName || '?'} <${row.member?.email || '?'}>`,
          currentAmountPaidCents: row.amountPaidCents,
        })
      }
    }
  }

  console.log(`Found ${toFix.length} row(s) to correct:\n`)
  for (const fix of toFix) {
    console.log(
      `  - order ${fix.orderId} | ${fix.buyer} | ${fix.productName} | currently $${(fix.currentAmountPaidCents || 0) / 100} -> will become $0.00`
    )
  }

  const totalReduction = toFix.reduce((sum, f) => sum + (f.currentAmountPaidCents || 0), 0)
  console.log(`\nTotal reduction to the tally once applied: $${(totalReduction / 100).toFixed(2)}`)

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to set these rows' amountPaidCents to null.`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - updating ${toFix.length} row(s)...`)
  for (const fix of toFix) {
    await prisma.ticketPurchase.update({
      where: { id: fix.id },
      data: { amountPaidCents: null },
    })
  }
  console.log('Done.')

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
