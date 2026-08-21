// General audit: extends the Carne Asada investigation to EVERY product
// type. Read-only, makes no changes. For every "registration" webhook log
// (any product), compares ticket line items in the raw payload against
// existing TicketPurchase rows to find:
//   1. Missing rows - same dedup bug that hit Carne Asada, possibly hitting
//      other products (2+ tickets of the same type in one order).
//   2. Price-tier changes - for hardcoded-price products (Agua Fresca),
//      whether raw.amount ever differs from the assumed flat price.
//   3. Real "BE A SPONSOR" payload shape - to sanity-check the donation
//      extraction logic in AdminMoneyTallies.tsx actually matches reality.
//
// Usage:
//   node scripts/audit-all-ticket-revenue.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

  const missingByProduct = new Map() // productLabel -> [{orderId, lineItemId, amount}]
  const priceObservations = new Map() // normalized product label -> Set of raw.amount values seen
  const sponsorPayloadExamples = []
  let ordersScanned = 0
  let ticketsScanned = 0

  for (const log of logs) {
    let payload
    try {
      payload = log.payloadJson || (log.rawBody ? JSON.parse(log.rawBody) : null)
    } catch {
      continue
    }

    const data = payload?.data
    if (!data) continue
    if (normalizeKey(payload?.eventType || payload?.event_type || '') !== 'registration') continue
    if (data.orderStatus !== 'completed') continue
    if (data.formName !== 'Encuerado Weekend 2026') continue
    if (Number(data.total || 0) <= 0) continue

    ordersScanned++
    const orderId = data.orderNumber || data.id || `TS-${log.id}`
    const tickets = Array.isArray(data.tickets) ? data.tickets : []

    // Count how many tickets share each label in this order (mirrors the
    // fix in process-eligible-orders.ts).
    const labelCounts = new Map()
    for (const t of tickets) {
      const l = String(t.ticketLabel || t.name || t.productName || 'Unknown').trim()
      labelCounts.set(l, (labelCounts.get(l) || 0) + 1)
    }

    for (let i = 0; i < tickets.length; i++) {
      ticketsScanned++
      const ticket = tickets[i]
      const label = String(ticket.ticketLabel || ticket.name || ticket.productName || 'Unknown').trim()
      const normalized = normalizeKey(label)

      // Track raw.amount observations per product for price-tier drift.
      const amt = Number(ticket.amount)
      if (Number.isFinite(amt) && amt > 0) {
        if (!priceObservations.has(normalized)) priceObservations.set(normalized, new Set())
        priceObservations.get(normalized).add(amt)
      }

      // Track sponsor payload shape.
      if (normalized.includes('sponsor')) {
        if (sponsorPayloadExamples.length < 3) {
          sponsorPayloadExamples.push({ orderId, ticket })
        }
      }

      const lineItemId = buildExternalLineItemId(orderId, ticket, i)
      const key = `${orderId}|${lineItemId}`

      if (existingKeys.has(key)) continue

      // Only flag as "missing" if this label appears more than once in the
      // order (the known dedup bug pattern) OR if it simply has no matching
      // row at all under ANY reasonable key - broader net than the Carne
      // Asada script since we don't know product-specific quirks here.
      const sameLabelCount = labelCounts.get(label) || 1
      if (!missingByProduct.has(label)) missingByProduct.set(label, [])
      missingByProduct.get(label).push({
        orderId,
        lineItemId,
        amount: amt,
        sameLabelCountInOrder: sameLabelCount,
      })
    }
  }

  console.log(`Scanned ${ordersScanned} eligible order(s), ${ticketsScanned} ticket line item(s) total.\n`)

  console.log('='.repeat(70))
  console.log('MISSING TICKETPURCHASE ROWS, BY PRODUCT')
  console.log('='.repeat(70))
  let totalMissing = 0
  for (const [label, rows] of missingByProduct) {
    totalMissing += rows.length
    console.log(`\n"${label}" - ${rows.length} missing row(s):`)
    for (const r of rows) {
      console.log(
        `  - order ${r.orderId} | lineItemId ${r.lineItemId} | amount $${r.amount} | ${r.sameLabelCountInOrder} of this label in order`
      )
    }
  }
  if (totalMissing === 0) console.log('None found.')

  console.log(`\n${'='.repeat(70)}`)
  console.log('PRICE OBSERVATIONS PER PRODUCT (raw.amount values seen)')
  console.log('='.repeat(70))
  for (const [product, amounts] of priceObservations) {
    const list = Array.from(amounts).sort((a, b) => a - b)
    const flag = list.length > 1 ? '  <-- MULTIPLE PRICES SEEN, hardcoded price may be stale' : ''
    console.log(`"${product}": ${list.map((a) => '$' + a).join(', ')}${flag}`)
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log('SPONSOR PAYLOAD EXAMPLES (to sanity-check donation extraction)')
  console.log('='.repeat(70))
  if (sponsorPayloadExamples.length === 0) {
    console.log('No TicketSpice-sourced sponsor tickets found in webhook logs (all sponsors may be manual entries).')
  } else {
    for (const ex of sponsorPayloadExamples) {
      console.log(`\norder ${ex.orderId}:`)
      console.log(JSON.stringify(ex.ticket, null, 2))
    }
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
