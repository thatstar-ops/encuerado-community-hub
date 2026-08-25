/**
 * Backfill T-shirt sizes onto Stripe ticket purchases that were saved with a
 * blank size (the processing code used to hardcode null).
 *
 *   node backfill-stripe-shirt-size.mjs           <- DRY RUN, changes nothing
 *   node backfill-stripe-shirt-size.mjs --apply   <- writes the sizes
 *
 * Reads the size out of each stored Stripe webhook payload. Never overwrites a
 * size that is already set, and never touches TicketSpice purchases.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function shirtSizeFromStripeSession(session) {
  const fields = Array.isArray(session?.custom_fields) ? session.custom_fields : []
  const field = fields.find((e) => {
    const key = String(e?.key || '').toLowerCase().replace(/[^a-z]/g, '')
    const label = String(e?.label?.custom || '').toLowerCase()
    return key.includes('shirt') || label.includes('shirt')
  })
  if (!field) return null
  const raw = field?.dropdown?.value ?? field?.text?.value ?? field?.numeric?.value ?? null
  const value = String(raw ?? '').trim()
  if (!value) return null
  const n = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (['XS','S','M','L','XL','XXL','XXXL','XXXXL'].includes(n)) return n
  const m = n.match(/^([2-5])XL$/)
  if (m) return 'X'.repeat(Number(m[1])) + 'L'
  return value
}

try {
  const logs = await prisma.stripeWebhookLog.findMany({ select: { payloadJson: true } })
  console.log(`  Scanned ${logs.length} stored Stripe webhook(s).`)

  const sizeByOrder = new Map()
  let noSizeInPayload = 0
  for (const log of logs) {
    const session = log.payloadJson?.data?.object
    if (!session?.id) continue
    const size = shirtSizeFromStripeSession(session)
    if (size) sizeByOrder.set(session.id, size)
    else noSizeInPayload++
  }
  console.log(`  ${sizeByOrder.size} order(s) have a size in the payload; ${noSizeInPayload} do not.\n`)

  const blanks = await prisma.ticketPurchase.findMany({
    where: { externalSource: 'Stripe', OR: [{ shirtSize: null }, { shirtSize: '' }] },
    select: { id: true, externalOrderId: true, productName: true, member: { select: { firstName: true, lastName: true } } },
  })
  console.log(`  ${blanks.length} Stripe purchase(s) currently have no size.`)

  const fixable = blanks.filter((p) => sizeByOrder.has(p.externalOrderId))
  const unfixable = blanks.filter((p) => !sizeByOrder.has(p.externalOrderId))

  if (fixable.length) {
    console.log(`\n  ${APPLY ? 'SETTING' : 'WOULD SET'} a size on ${fixable.length} purchase(s):`)
    for (const p of fixable.slice(0, 12)) {
      console.log(`      ${sizeByOrder.get(p.externalOrderId).padEnd(5)} ${p.member.firstName} ${p.member.lastName} - ${p.productName}`)
    }
    if (fixable.length > 12) console.log(`      ... and ${fixable.length - 12} more`)
    if (APPLY) {
      for (const p of fixable) {
        await prisma.ticketPurchase.update({
          where: { id: p.id },
          data: { shirtSize: sizeByOrder.get(p.externalOrderId) },
        })
      }
    }
  }

  if (unfixable.length) {
    console.log(`\n  ${unfixable.length} purchase(s) have no size anywhere in their payload - the buyer`)
    console.log(`  never picked one, so these need chasing by hand:`)
    for (const p of unfixable.slice(0, 12)) {
      console.log(`      ${p.member.firstName} ${p.member.lastName} - ${p.productName}`)
    }
    if (unfixable.length > 12) console.log(`      ... and ${unfixable.length - 12} more`)
  }

  console.log('')
  if (!fixable.length) console.log('  Nothing to backfill.')
  else if (APPLY)      console.log(`  Done. ${fixable.length} purchase(s) updated.`)
  else                 console.log(`  Re-run with --apply to write these:\n\n      node backfill-stripe-shirt-size.mjs --apply\n`)
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0, 5).join('\n  '))
} finally {
  await prisma.$disconnect()
}
