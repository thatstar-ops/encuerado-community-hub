// One-off cleanup: removes the mistakenly-created manual-entry Member
// "Cesar Cruz <cesar.cruz@gmail.com>" and everything cascaded from it
// (TicketPurchase, EventRegistration, ParticipationRecord, etc). Does NOT
// touch his real TicketSpice-based account/ticket
// (Cesar Cruz <dtlacesar@gmail.com>), which is a separate Member row.
//
// Every Member relation in schema.prisma is onDelete: Cascade, so deleting
// the Member row is enough to clean up everything attached to it - no need
// to delete child rows individually.
//
// SAFE BY DEFAULT: dry run only, prints everything that would be deleted,
// makes no writes. Re-run with --apply to actually delete.
//
// Usage:
//   node scripts/cleanup-mistaken-cesar-cruz-manual-entry.mjs            (dry run)
//   node scripts/cleanup-mistaken-cesar-cruz-manual-entry.mjs --apply    (deletes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const TARGET_EMAIL = 'cesar.cruz@gmail.com'

async function main() {
  const member = await prisma.member.findFirst({
    where: { email: TARGET_EMAIL },
    include: {
      ticketPurchases: true,
      registrations: { include: { event: { select: { title: true } } } },
      participationRecords: true,
      volunteerProfile: true,
      volunteerAssignments: true,
      emailLogs: true,
      externalContactLists: true,
      sponsorFulfillments: true,
      emailCampaignQueue: true,
    },
  })

  if (!member) {
    console.log(`No Member found with email ${TARGET_EMAIL}. Nothing to do - maybe already cleaned up.`)
    await prisma.$disconnect()
    return
  }

  console.log(`Member found: ${member.firstName} ${member.lastName} <${member.email}> (id: ${member.id})`)
  console.log(`Created: ${member.createdAt}`)
  console.log(`\nThis is what would be deleted (all cascade from the Member row):\n`)

  console.log(`TicketPurchases (${member.ticketPurchases.length}):`)
  for (const tp of member.ticketPurchases) {
    console.log(`  - ${tp.productName} | source: ${tp.externalSource} | passCount: ${tp.passCount} | amountPaidCents: ${tp.amountPaidCents}`)
  }

  console.log(`\nEventRegistrations (${member.registrations.length}):`)
  for (const reg of member.registrations) {
    console.log(`  - ${reg.event.title} | status: ${reg.status} | notes: ${reg.notes}`)
  }

  console.log(`\nParticipationRecords (${member.participationRecords.length}):`)
  for (const pr of member.participationRecords) {
    console.log(`  - year ${pr.year} | type: ${pr.type} | source: ${pr.source}`)
  }

  console.log(`\nVolunteerProfile: ${member.volunteerProfile ? 'YES - has one' : 'none'}`)
  console.log(`VolunteerAssignments: ${member.volunteerAssignments.length}`)
  console.log(`EmailLogs: ${member.emailLogs.length}`)
  console.log(`ExternalContactListMember rows: ${member.externalContactLists.length}`)
  console.log(`SponsorFulfillments: ${member.sponsorFulfillments.length}`)
  console.log(`EmailCampaignRecipientQueue rows: ${member.emailCampaignQueue.length}`)

  // Safety check: if this member has anything beyond the expected mistaken
  // manual entry (e.g. a real volunteer profile, sponsor record, or email
  // history), flag it loudly instead of deleting silently.
  const hasUnexpectedData =
    member.volunteerProfile ||
    member.volunteerAssignments.length > 0 ||
    member.emailLogs.length > 0 ||
    member.externalContactLists.length > 0 ||
    member.sponsorFulfillments.length > 0 ||
    member.emailCampaignQueue.length > 0

  if (hasUnexpectedData) {
    console.log(
      `\n*** WARNING: this member has data beyond a simple manual entry (volunteer profile, email history, sponsor record, etc). Stopping without deleting - review manually before proceeding. ***`
    )
    await prisma.$disconnect()
    return
  }

  if (!APPLY) {
    console.log(`\nDRY RUN - no changes made. Re-run with --apply to actually delete this member and everything above.`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - deleting member ${member.id} and all cascaded records...`)
  await prisma.member.delete({ where: { id: member.id } })
  console.log('Done. Member and all related records deleted.')

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
