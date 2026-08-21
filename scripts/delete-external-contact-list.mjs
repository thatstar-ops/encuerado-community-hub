// Finds external contact list(s) matching a label search (case-insensitive
// substring) and deletes them, along with their ExternalContactListMember
// rows (the list-membership links only). The underlying Member records are
// NOT deleted - a judge/contact who happens to also be a real Member stays
// intact; only their membership in this particular list is removed, exactly
// like deleting the list from the admin UI does.
//
// SAFE BY DEFAULT: dry run only. Re-run with --apply to actually delete.
//
// Usage:
//   node scripts/delete-external-contact-list.mjs "2026 Judges"            (dry run)
//   node scripts/delete-external-contact-list.mjs "2026 Judges" --apply    (deletes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const searchTerm = args.find((a) => !a.startsWith('--'))

async function main() {
  if (!searchTerm) {
    console.error('Usage: node scripts/delete-external-contact-list.mjs "<label search>" [--apply]')
    process.exit(1)
  }

  const lists = await prisma.externalContactList.findMany({
    where: { label: { contains: searchTerm, mode: 'insensitive' } },
    include: { _count: { select: { members: true } } },
  })

  if (lists.length === 0) {
    console.log(`No external contact list found with label containing "${searchTerm}".`)
    console.log('\nAll existing lists:')
    const all = await prisma.externalContactList.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    })
    for (const l of all) {
      console.log(`  - "${l.label}" (${l._count.members} contacts, id ${l.id})`)
    }
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${lists.length} matching list(s):\n`)
  for (const list of lists) {
    console.log(`  - "${list.label}" | ${list._count.members} contact(s) | id ${list.id} | created ${list.createdAt.toISOString()}`)
  }

  if (lists.length > 1) {
    console.log(
      '\nMultiple lists matched. Re-run with a more specific search term if you only meant to delete one of these.'
    )
  }

  console.log(
    '\nDeleting a list removes its ExternalContactListMember rows (the list membership only).' +
      ' The underlying Member records are NOT deleted - anyone on this list who is also a real' +
      ' Member (attendee, volunteer, etc.) is completely unaffected.'
  )

  if (!APPLY) {
    console.log('\nDRY RUN - no changes made. Re-run with --apply to delete the list(s) above.')
    await prisma.$disconnect()
    return
  }

  console.log(`\nAPPLYING - deleting ${lists.length} list(s)...`)
  for (const list of lists) {
    await prisma.externalContactList.delete({ where: { id: list.id } })
    console.log(`  deleted: "${list.label}" (${list._count.members} contact membership(s) removed)`)
  }
  console.log('Done.')

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
