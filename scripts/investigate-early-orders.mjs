// Investigates orders XZT0004 and XZT0005 specifically - prints full order
// details (buyer, all tickets, amounts) and checks whether the buyer's
// Member record and EventRegistrations for the missing ticket types already
// exist, independent of the missing TicketPurchase row. Read-only.
//
// Usage:
//   node scripts/investigate-early-orders.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TARGET_ORDERS = ['NCRDWKND2026-XZT0004', 'NCRDWKND2026-XZT0005']

async function main() {
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    select: { id: true, rawBody: true, payloadJson: true, receivedAt: true },
  })

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

    if (!TARGET_ORDERS.includes(orderId)) continue

    console.log('='.repeat(70))
    console.log(`ORDER ${orderId}`)
    console.log('='.repeat(70))
    console.log(`Received: ${log.receivedAt}`)
    console.log(`Form: ${data.formName} | Status: ${data.orderStatus} | Total: $${data.total}`)
    console.log(`Buyer: ${data.billing?.name?.first} ${data.billing?.name?.last} <${data.billing?.email}>`)
    console.log(`\nTickets in this order:`)

    const tickets = Array.isArray(data.tickets) ? data.tickets : []
    for (const t of tickets) {
      console.log(`  - "${t.ticketLabel}" | amount: $${t.amount} | total: $${t.total} | id: ${t.id}`)
    }

    const email = String(data.billing?.email || '').trim().toLowerCase()
    const member = await prisma.member.findFirst({
      where: { email },
      include: {
        ticketPurchases: { where: { externalOrderId: orderId } },
        registrations: { include: { event: { select: { title: true } } } },
      },
    })

    if (!member) {
      console.log(`\nNo Member found for ${email}.`)
      continue
    }

    console.log(`\nMember: ${member.firstName} ${member.lastName} <${member.email}> (created ${member.createdAt}, archived: ${member.archivedAt ? 'YES' : 'no'})`)
    console.log(`TicketPurchase rows for this order: ${member.ticketPurchases.length}`)
    for (const tp of member.ticketPurchases) {
      console.log(`  - ${tp.productName} | $${(tp.amountPaidCents || 0) / 100} | paymentStatus: ${tp.paymentStatus}`)
    }
    console.log(`\nAll EventRegistrations for this member:`)
    for (const reg of member.registrations) {
      console.log(`  - ${reg.event.title} | status: ${reg.status} | notes: ${reg.notes}`)
    }
    console.log('')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
