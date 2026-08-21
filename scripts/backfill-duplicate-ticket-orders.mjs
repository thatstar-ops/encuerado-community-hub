// General version of backfill-carne-asada-purchases.mjs: covers ANY product
// (not just Carne Asada) where an order contains 2+ tickets sharing the same
// label, but fewer TicketPurchase rows exist for that (order, productName)
// pair than tickets in the payload - the confirmed dedup bug pattern (now
// fixed going forward in process-eligible-orders.ts).
//
// Deliberately scoped to the "2+ of the same label in one order" signature
// specifically - NOT "any order with fewer rows than expected" - because
// standalone single tickets from very old orders can look "missing" purely
// due to a historical lineItemId scheme mismatch (confirmed false positive
// on 2 June 2026 orders during this investigation). This script only acts
// where the duplicate-label pattern makes a missing row unambiguous.
//
// SAFE BY DEFAULT: dry run only. Re-run with --apply to write.
//
// Usage:
//   node scripts/backfill-duplicate-ticket-orders.mjs            (dry run)
//   node scripts/backfill-duplicate-ticket-orders.mjs --apply    (writes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function extractLineAmountCents(ticket) {
  const possibleValues = [
    ticket.total,
    ticket.amount,
    ticket.price,
    ticket.subtotal,
    ticket.lineTotal,
    ticket.totalAmount,
    ticket.amountPaid,
  ]
  for (const value of possibleValues) {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue) && numberValue > 0) {
      return Math.round(numberValue * 100)
    }
  }
  return null
}

function buildExternalLineItemId(orderId, ticket, index) {
  return (
    ticket.lineItemId ||
    ticket.ticketId ||
    ticket.id ||
    ticket.lookupId ||
    `${orderId}-${index}-${String(ticket.ticketLabel || ticket.name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}`
  )
}

async function main() {
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    select: { id: true, rawBody: true, payloadJson: true, receivedAt: true },
    orderBy: { receivedAt: 'asc' },
  })

  const existingPurchases = await prisma.ticketPurchase.findMany({
    where: { externalSource: 'TicketSpice' },
    select: { externalOrderId: true, externalLineItemId: true, productName: true },
  })
  const existingKeys = new Set(existingPurchases.map((p) => `${p.externalOrderId}|${p.externalLineItemId}`))
  const existingCountByOrderProduct = new Map()
  for (const p of existingPurchases) {
    const key = `${p.externalOrderId}|${p.productName}`
    existingCountByOrderProduct.set(key, (existingCountByOrderProduct.get(key) || 0) + 1)
  }

  const toCreate = []
  const skipped = []

  for (const log of logs) {
    let payload
    try {
      payload = log.payloadJson || (log.rawBody ? JSON.parse(log.rawBody) : null)
    } catch {
      continue
    }
    const data = payload?.data
    if (!data) continue
    if (data.orderStatus !== 'completed') continue
    if (data.formName !== 'Encuerado Weekend 2026') continue

    const orderId = data.orderNumber || data.id || `TS-${log.id}`
    const tickets = Array.isArray(data.tickets) ? data.tickets : []

    const labelCounts = new Map()
    for (const t of tickets) {
      const l = String(t.ticketLabel || t.name || t.productName || 'Unknown').trim()
      labelCounts.set(l, (labelCounts.get(l) || 0) + 1)
    }

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      const label = String(ticket.ticketLabel || ticket.name || ticket.productName || 'Unknown').trim()
      const sameLabelCount = labelCounts.get(label) || 1

      // Only act on the unambiguous duplicate-label signature.
      if (sameLabelCount < 2) continue

      const existingCount = existingCountByOrderProduct.get(`${orderId}|${label}`) || 0
      if (existingCount >= sameLabelCount) continue // nothing missing for this label in this order

      const lineItemId = buildExternalLineItemId(orderId, ticket, i)
      const key = `${orderId}|${lineItemId}`
      if (existingKeys.has(key)) continue // this exact ticket already has a row

      const billing = data.billing
      const email = String(billing?.email || '').trim().toLowerCase()
      if (!email) {
        skipped.push(`order ${orderId} lineItem ${lineItemId} - no billing email`)
        continue
      }

      const member = await prisma.member.findFirst({ where: { email } })
      if (!member) {
        skipped.push(`order ${orderId} lineItem ${lineItemId} - no Member found for ${email}`)
        continue
      }

      const amountPaidCents = extractLineAmountCents(ticket)

      toCreate.push({
        memberId: member.id,
        externalSource: 'TicketSpice',
        externalOrderId: orderId,
        externalLineItemId: lineItemId,
        orderNumber: data.orderNumber || null,
        productName: label,
        productCategory: 'Individual Ticket',
        purchaseType: 'Individual Ticket',
        accessLevel: 'Event',
        passCount: 1,
        paymentStatus: 'Paid',
        amountPaidCents,
        purchasedAt: data.registrationTimestamp ? new Date(data.registrationTimestamp) : log.receivedAt,
        rawProductJson: ticket,
        _preview: `order ${orderId} | ${member.firstName} ${member.lastName} <${member.email}> | ${label} | ${amountPaidCents !== null ? '$' + (amountPaidCents / 100).toFixed(2) : 'unknown amount'} | lineItemId ${lineItemId}`,
      })
    }
  }

  console.log(`Missing TicketPurchase rows found (duplicate-label signature only): ${toCreate.length}\n`)
  for (const row of toCreate) console.log(`  + ${row._preview}`)

  if (skipped.length) {
    console.log(`\nSkipped (needs manual review): ${skipped.length}`)
    for (const s of skipped) console.log(`  ! ${s}`)
  }

  const totalCents = toCreate.reduce((sum, r) => sum + (r.amountPaidCents || 0), 0)
  console.log(`\nTotal amount these rows would add: $${(totalCents / 100).toFixed(2)}`)

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to create these rows.`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - creating ${toCreate.length} row(s)...`)
  for (const row of toCreate) {
    const { _preview, ...data } = row
    await prisma.ticketPurchase.create({ data })
    console.log(`  created: ${_preview}`)
  }
  console.log('Done.')

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
