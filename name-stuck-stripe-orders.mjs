/**
 * Put the correct names on the two buyers behind the 3 unprocessed Stripe
 * orders, so reprocessing attaches to the right people instead of deriving a
 * name from their email address.
 *
 *   node name-stuck-stripe-orders.mjs           <- DRY RUN, shows the mapping
 *   node name-stuck-stripe-orders.mjs --apply   <- creates/updates the members
 *
 * Scoped strictly to the currently UNPROCESSED Stripe webhook logs. It cannot
 * touch anyone else.
 *
 * After applying, click "Reprocess Failed" on /admin/stripe-webhooks. The
 * processor looks members up by email, finds these, and uses them as-is.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Matched against the part of the email before the "@", lowercased.
const NAMES = [
  { match: 'ajwilson', firstName: 'AJ', lastName: 'Wilson' },
]
const FALLBACK = { firstName: 'Cristian', lastName: 'Medina' }

try {
  const logs = await prisma.stripeWebhookLog.findMany({
    where: { processedAt: null },
    select: { id: true, payloadJson: true, receivedAt: true },
    orderBy: { receivedAt: 'asc' },
  })
  console.log(`  ${logs.length} unprocessed Stripe webhook(s).\n`)

  const byEmail = new Map()
  for (const log of logs) {
    const session = log.payloadJson?.data?.object
    const email = String(session?.customer_details?.email || '').trim().toLowerCase()
    if (!email) { console.log(`  SKIP log ${log.id} - no email in payload`); continue }
    if (!byEmail.has(email)) byEmail.set(email, [])
    byEmail.get(email).push({
      amount: (Number(session?.amount_total) || 0) / 100,
      name: session?.customer_details?.name ?? null,
    })
  }

  if (byEmail.size === 0) { console.log('  Nothing to do.'); }

  for (const [email, orders] of byEmail) {
    const local = email.split('@')[0]
    const hit = NAMES.find((n) => local.includes(n.match))
    const name = hit || FALLBACK
    const existing = await prisma.member.findFirst({ where: { email } })

    console.log(`  ${email}`)
    console.log(`      orders in payload : ${orders.map((o) => '$' + o.amount.toFixed(2)).join(', ')}`)
    console.log(`      name in Stripe    : ${orders[0].name === null ? '(null - none collected)' : orders[0].name}`)
    console.log(`      will be recorded  : ${name.firstName} ${name.lastName}`)
    console.log(`      member record     : ${existing ? `EXISTS (${existing.firstName} ${existing.lastName}) - will rename` : 'does not exist - will create'}`)

    if (APPLY) {
      if (existing) {
        await prisma.member.update({
          where: { id: existing.id },
          data: { firstName: name.firstName, lastName: name.lastName, archivedAt: null },
        })
      } else {
        await prisma.member.create({
          data: {
            firstName: name.firstName,
            lastName: name.lastName,
            email,
            country: 'USA',
            firstYearAttended: 2026,
            notes: 'Created manually - Stripe checkout did not collect a name on this order.',
          },
        })
      }
    }
    console.log('')
  }

  if (!APPLY) {
    console.log('  Dry run - nothing changed. Check the names above, then:\n')
    console.log('      node name-stuck-stripe-orders.mjs --apply\n')
  } else {
    console.log('  Done. Now click "Reprocess Failed" on /admin/stripe-webhooks')
    console.log('  to turn these into ticket purchases and event registrations.\n')
  }
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0, 6).join('\n  '))
} finally { await prisma.$disconnect() }
