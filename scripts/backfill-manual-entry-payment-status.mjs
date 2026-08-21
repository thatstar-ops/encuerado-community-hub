// Backfill: sets paymentStatus = 'Paid' on every existing manual-entry
// TicketPurchase row (sponsor, weekend pass, VIP pass, individual event
// ticket) that has paymentStatus = null.
//
// Why: none of the manual-entry code paths in manual-attendee-actions.ts
// ever set paymentStatus (now fixed going forward). AdminMoneyTallies only
// sums purchases where paymentStatus is in ['Paid','paid','PAID',
// 'Completed','completed','COMPLETED'] - so every manual entry ever created
// (sponsors included, not just Carne Asada door sales) has been silently
// excluded from every money total since this tool was built.
//
// Only touches paymentStatus. Does not touch amountPaidCents or anything
// else - a manual entry with no recorded amount (a comp, or one predating
// the "amount collected" field) will now correctly show as $0 instead of
// being invisible, which is the honest thing to show.
//
// SAFE BY DEFAULT: dry run only, prints what it would update, makes no
// writes. Re-run with --apply to actually update the rows.
//
// Usage:
//   node scripts/backfill-manual-entry-payment-status.mjs            (dry run)
//   node scripts/backfill-manual-entry-payment-status.mjs --apply    (writes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function money(cents) {
  return cents === null || cents === undefined ? '$0.00 (no amount recorded)' : `$${(cents / 100).toFixed(2)}`
}

async function main() {
  const rows = await prisma.ticketPurchase.findMany({
    where: {
      externalSource: 'Manual',
      paymentStatus: null,
    },
    include: {
      member: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { purchasedAt: 'asc' },
  })

  console.log(`Found ${rows.length} manual TicketPurchase row(s) with paymentStatus = null.\n`)

  let totalCents = 0
  for (const row of rows) {
    totalCents += row.amountPaidCents || 0
    console.log(
      `- ${row.member?.firstName || '?'} ${row.member?.lastName || '?'} <${row.member?.email || '?'}> | ${row.productName} | ${money(row.amountPaidCents)} | purchased ${row.purchasedAt}`
    )
  }

  console.log(`\nTotal amount these rows will add to the tallies once fixed: ${money(totalCents)}`)

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to actually update these rows.`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - updating ${rows.length} row(s)...`)

  const result = await prisma.ticketPurchase.updateMany({
    where: {
      externalSource: 'Manual',
      paymentStatus: null,
    },
    data: {
      paymentStatus: 'Paid',
    },
  })

  console.log(`Updated ${result.count} row(s).`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
