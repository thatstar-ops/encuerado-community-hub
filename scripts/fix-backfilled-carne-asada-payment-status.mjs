// One-time fix: the earlier backfill-carne-asada-purchases.mjs run created
// TicketPurchase rows for missing 2nd tickets but forgot to set
// paymentStatus (bug in that script, now fixed for future runs). Those rows
// are real and correct otherwise - they just need paymentStatus = 'Paid' so
// AdminMoneyTallies actually counts them.
//
// Scoped narrowly: only TicketSpice-sourced Carne Asada rows with
// paymentStatus null. Won't touch anything else.
//
// SAFE BY DEFAULT: dry run only. Re-run with --apply to write.
//
// Usage:
//   node scripts/fix-backfilled-carne-asada-payment-status.mjs            (dry run)
//   node scripts/fix-backfilled-carne-asada-payment-status.mjs --apply    (writes)

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

async function main() {
  const rows = await prisma.ticketPurchase.findMany({
    where: {
      externalSource: 'TicketSpice',
      paymentStatus: null,
    },
    include: {
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  const carneRows = rows.filter((r) => normalize(r.productName).includes('CARNE ASADA'))

  console.log(`Found ${carneRows.length} TicketSpice Carne Asada row(s) with paymentStatus = null.\n`)

  for (const row of carneRows) {
    console.log(
      `- ${row.member?.firstName || '?'} ${row.member?.lastName || '?'} <${row.member?.email || '?'}> | order ${row.externalOrderId} | lineItemId ${row.externalLineItemId} | $${((row.amountPaidCents || 0) / 100).toFixed(2)}`
    )
  }

  if (rows.length > carneRows.length) {
    console.log(
      `\nNote: ${rows.length - carneRows.length} other TicketSpice row(s) also have paymentStatus = null but aren't Carne Asada - not touching those here.`
    )
  }

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to set paymentStatus = 'Paid' on these ${carneRows.length} row(s).`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - updating ${carneRows.length} row(s)...`)

  for (const row of carneRows) {
    await prisma.ticketPurchase.update({
      where: { id: row.id },
      data: { paymentStatus: 'Paid' },
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
