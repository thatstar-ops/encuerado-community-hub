// Retroactively registers every existing Weekend Pass / VIP Pass / Sponsor
// holder for "Sombras de Mi Barrio" and "Contramundo" - both are part of
// WEEKEND_PASS_EVENT_TITLES (src/lib/ticketspice/sponsor-tiers.ts), but
// buyers processed before an event existed in the app, or before
// "Contramundo" was added to that list, may never have gotten registered.
// This finds and fills those gaps without touching anyone who's already
// correctly registered.
//
// SAFE BY DEFAULT: dry run only. Re-run with --apply to actually create
// registrations. Fully idempotent - safe to re-run any number of times.
//
// Usage:
//   node scripts/backfill-weekend-pass-event-registrations.mjs            (dry run)
//   node scripts/backfill-weekend-pass-event-registrations.mjs --apply    (writes)

import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
loadEnv({ path: path.join(projectRoot, '.env') })
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true })

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const TARGET_EVENT_TITLES = ['Sombras de Mi Barrio', 'ContraMundo - Encuerado Weekend Edition']
const PAID_STATUSES = ['Paid', 'paid', 'PAID', 'Completed', 'completed', 'COMPLETED']
const CURRENT_YEAR = 2026

function note() {
  return 'Backfill: registered as a weekend-pass-tier holder (Weekend Pass / VIP Pass / Sponsor package).'
}

async function main() {
  console.log(APPLY ? 'APPLY MODE - will create missing registrations.\n' : 'DRY RUN - no changes will be made.\n')

  // 1. Resolve the target events.
  const events = await prisma.event.findMany({
    where: { title: { in: TARGET_EVENT_TITLES } },
    select: { id: true, title: true, archivedAt: true, cancelledAt: true },
  })

  const missingTitles = TARGET_EVENT_TITLES.filter(
    (title) => !events.some((e) => e.title === title)
  )

  if (missingTitles.length) {
    console.error(`ABORTING - no Event record found with title(s): ${missingTitles.join(', ')}`)
    console.error('Check /events for the exact title (case/spacing must match exactly), fix it there or in this script, then re-run.')
    await prisma.$disconnect()
    process.exit(1)
  }

  for (const e of events) {
    if (e.archivedAt || e.cancelledAt) {
      console.log(`NOTE: Event "${e.title}" is archived/cancelled - continuing anyway, but double check this is intended.`)
    }
  }

  console.log('Target events:')
  for (const e of events) console.log(`  - "${e.title}" (id ${e.id})`)
  console.log('')

  // 2. Gather every member who holds a weekend-pass-tier entitlement:
  // Weekend Pass or VIP Pass ticket purchases (any source - TicketSpice or
  // Stripe), plus anyone with a sponsor fulfillment for the current year.
  const passPurchases = await prisma.ticketPurchase.findMany({
    where: {
      purchaseType: { in: ['Weekend Pass', 'VIP Pass'] },
      paymentStatus: { in: PAID_STATUSES },
    },
    select: { memberId: true, purchaseType: true, externalSource: true },
  })

  const sponsorFulfillments = await prisma.sponsorFulfillment.findMany({
    where: { eventYear: CURRENT_YEAR },
    select: { memberId: true, sponsorTier: true },
  })

  const memberIds = new Set()
  for (const p of passPurchases) memberIds.add(p.memberId)
  for (const s of sponsorFulfillments) memberIds.add(s.memberId)

  console.log(
    `Qualifying members: ${memberIds.size} (from ${passPurchases.length} Weekend/VIP Pass purchase(s) + ${sponsorFulfillments.length} sponsor fulfillment(s))\n`
  )

  // 3. For each member x each target event, create the registration if missing.
  let wouldCreate = 0
  let created = 0
  let alreadyRegistered = 0

  for (const memberId of memberIds) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, firstName: true, lastName: true, email: true },
    })

    if (!member) {
      console.log(`  SKIP - memberId ${memberId} not found (deleted/merged?)`)
      continue
    }

    for (const event of events) {
      const existing = await prisma.eventRegistration.findUnique({
        where: { memberId_eventId: { memberId, eventId: event.id } },
        select: { id: true },
      })

      if (existing) {
        alreadyRegistered++
        continue
      }

      if (!APPLY) {
        wouldCreate++
        console.log(`  WOULD REGISTER: ${member.firstName} ${member.lastName} (${member.email}) -> "${event.title}"`)
        continue
      }

      await prisma.eventRegistration.create({
        data: {
          memberId,
          eventId: event.id,
          status: 'Paid',
          notes: note(),
        },
      })
      created++
      console.log(`  REGISTERED: ${member.firstName} ${member.lastName} (${member.email}) -> "${event.title}"`)
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Already registered (no change needed): ${alreadyRegistered}`)
  if (APPLY) {
    console.log(`Newly created: ${created}`)
  } else {
    console.log(`Would create: ${wouldCreate}`)
    console.log('\nDRY RUN - re-run with --apply to actually create these registrations.')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
