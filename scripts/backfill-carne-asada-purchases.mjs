// Backfill: recreates missing TicketPurchase rows for Carne Asada orders
// where 2 tickets were bought together and the old dedup bug in
// process-eligible-orders.ts silently dropped the 2nd ticket's payment.
//
// Does NOT touch EventRegistration/ParticipationRecord - those already
// correctly reflect 2-ticket orders via a separate, unaffected code path
// (the per-order pass-count-in-notes logic). This only recreates the
// missing money record.
//
// Self-discovering: compares every Carne Asada ticket line item in the raw
// webhook payloads against existing TicketPurchase rows (matched by the
// exact same lineItemId logic process-eligible-orders.ts uses), rather than
// trusting a hand-counted list of affected orders.
//
// SAFE BY DEFAULT: dry run only, prints what it would create, makes no
// writes. Re-run with --apply to actually create the rows.
//
// Usage:
//   node scripts/backfill-carne-asada-purchases.mjs            (dry run)
//   node scripts/backfill-carne-asada-purchases.mjs --apply    (writes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function normalize(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCarneAsada(label) {
  return normalize(label).includes('CARNE ASADA')
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

async function main() {
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: { rawBody: { contains: 'ARNE', mode: 'insensitive' } },
    select: { id: true, rawBody: true, payloadJson: true, receivedAt: true },
    orderBy: { receivedAt: 'asc' },
  })

  const existingPurchases = await prisma.ticketPurchase.findMany({
    where: { externalSource: 'TicketSpice' },
    select: { externalOrderId: true, externalLineItemId: true },
  })
  const existingKeys = new Set(
    existingPurchases.map((p) => `${p.externalOrderId}|${p.externalLineItemId}`)
  )

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

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      const label = String(ticket.ticketLabel || ticket.name || ticket.productName || 'Unknown').trim()
      if (!isCarneAsada(label)) continue

      const lineItemId = buildExternalLineItemId(orderId, ticket, i)
      const key = `${orderId}|${lineItemId}`

      if (existingKeys.has(key)) continue // already has its own row

      const billing = data.billing
      const email = String(billing?.email || '').trim().toLowerCase()

      if (!email) {
        skipped.push(`order ${orderId} lineItem ${lineItemId} - no billing email in payload`)
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

  console.log(`Scanned ${logs.length} webhook log(s) mentioning "carne".`)
  console.log(`\nMissing TicketPurchase rows found: ${toCreate.length}`)
  for (const row of toCreate) {
    console.log(`  + ${row._preview}`)
  }

  if (skipped.length) {
    console.log(`\nSkipped (needs manual review): ${skipped.length}`)
    for (const s of skipped) console.log(`  ! ${s}`)
  }

  const totalCents = toCreate.reduce((sum, r) => sum + (r.amountPaidCents || 0), 0)
  console.log(`\nTotal amount these rows would add: $${(totalCents / 100).toFixed(2)}`)

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to actually create these rows.`)
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
