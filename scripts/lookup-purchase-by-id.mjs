// Quick lookup: finds a TicketPurchase by its exact id and prints the
// member currently attached to it. Read-only.
//
// Usage:
//   node scripts/lookup-purchase-by-id.mjs cms1zuqx1000629px00k3kc9k

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const id = process.argv[2]

async function main() {
  if (!id) {
    console.log('Usage: node scripts/lookup-purchase-by-id.mjs <ticketPurchaseId>')
    await prisma.$disconnect()
    return
  }

  const purchase = await prisma.ticketPurchase.findUnique({
    where: { id },
    include: {
      member: true,
    },
  })

  if (!purchase) {
    console.log(`No TicketPurchase found with id ${id}. It may have already been deleted.`)
    await prisma.$disconnect()
    return
  }

  console.log('TicketPurchase:')
  console.log(JSON.stringify(purchase, null, 2))

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
