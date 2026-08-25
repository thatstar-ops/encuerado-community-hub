/**
 * Fill in sponsor T-shirt sizes from the stored webhook payloads.
 *
 *   node backfill-sponsor-shirt-sizes.mjs           <- DRY RUN, changes nothing
 *   node backfill-sponsor-shirt-sizes.mjs --apply   <- writes the sizes
 *
 * The size was always collected at checkout - TicketSpice puts it in
 * registrants[].data[] under key "tshirtSize"; Stripe puts it in the session's
 * custom_fields. Neither processor ever copied it onto the sponsor record, so
 * check-in shows "Unknown". This reads it back out and fills it in.
 *
 * Never overwrites a size that is already set.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function normalizeSize(value) {
  if (!value) return null
  const v = String(value).trim()
  if (!v) return null
  const n = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^NO/.test(n)) return null                       // "no t shirt"
  if (['XS','S','M','L','XL','XXL','XXXL','XXXXL'].includes(n)) return n
  const m = n.match(/^([2-5])XL$/); if (m) return 'X'.repeat(+m[1]) + 'L'
  if (/^SMALL$/.test(n)) return 'S'
  if (/^MEDIUM$/.test(n)) return 'M'
  if (/^LARGE$/.test(n)) return 'L'
  if (/^XLARGE$|^EXTRALARGE$/.test(n)) return 'XL'
  return null
}

// TicketSpice: registrants[].data[] entries with key "tshirtSize"
function sizeFromTicketSpice(data) {
  for (const reg of (data?.registrants || [])) {
    for (const f of (reg?.data || [])) {
      const key = String(f?.key || '').toLowerCase()
      const label = String(f?.label || '').toLowerCase()
      if (key === 'tshirtsize' || label.includes('shirt')) {
        const s = normalizeSize(f?.value ?? f?.answer)
        if (s) return s
      }
    }
  }
  return null
}

// Stripe: session.custom_fields[] with key "tshirtsize"
function sizeFromStripe(session) {
  for (const f of (session?.custom_fields || [])) {
    const key = String(f?.key || '').toLowerCase().replace(/[^a-z]/g,'')
    const label = String(f?.label?.custom || '').toLowerCase()
    if (key.includes('shirt') || label.includes('shirt')) {
      const s = normalizeSize(f?.dropdown?.value ?? f?.text?.value)
      if (s) return s
    }
  }
  return null
}

try {
  // ---- build email -> size from every stored payload ----
  const sizeByEmail = new Map()

  for (const log of await prisma.ticketSpiceWebhookLog.findMany({ select: { payloadJson: true } })) {
    const data = log.payloadJson?.data
    const email = String(data?.billing?.email || '').trim().toLowerCase()
    const size = sizeFromTicketSpice(data)
    if (email && size && !sizeByEmail.has(email)) sizeByEmail.set(email, size)
  }
  for (const log of await prisma.stripeWebhookLog.findMany({ select: { payloadJson: true } })) {
    const s = log.payloadJson?.data?.object
    const email = String(s?.customer_details?.email || '').trim().toLowerCase()
    const size = sizeFromStripe(s)
    if (email && size && !sizeByEmail.has(email)) sizeByEmail.set(email, size)
  }
  console.log(`  Found a shirt size in the payloads for ${sizeByEmail.size} buyer(s).\n`)

  // ---- sponsors ----
  const sponsors = await prisma.sponsorFulfillment.findMany({
    select: { id:true, sponsorTier:true, shirtCount:true, shirtSizes:true,
              member:{ select:{ firstName:true, lastName:true, email:true } } },
  })
  console.log(`  ${sponsors.length} sponsor record(s).`)

  const todo = [], missing = []
  for (const sp of sponsors) {
    const has = sp.shirtSizes && (Array.isArray(sp.shirtSizes) ? sp.shirtSizes.length : String(sp.shirtSizes).trim())
    if (has) continue
    const size = sizeByEmail.get(String(sp.member.email||'').toLowerCase())
    ;(size ? todo : missing).push({ ...sp, size })
  }

  if (todo.length) {
    console.log(`\n  ${APPLY ? 'SETTING' : 'WOULD SET'} sizes on ${todo.length} sponsor(s):`)
    for (const s of todo) {
      const note = s.shirtCount > 1 ? `  (owed ${s.shirtCount} shirts - only 1 size was collected)` : ''
      console.log(`      ${String(s.size).padEnd(5)} ${s.member.firstName} ${s.member.lastName} - ${s.sponsorTier}${note}`)
    }
    if (APPLY) for (const s of todo) {
      await prisma.sponsorFulfillment.update({ where:{id:s.id}, data:{ shirtSizes: [s.size] } })
    }
  }
  if (missing.length) {
    console.log(`\n  ${missing.length} sponsor(s) have no size anywhere - ask them directly:`)
    for (const s of missing) console.log(`      ${s.member.firstName} ${s.member.lastName} - ${s.sponsorTier} (${s.member.email})`)
  }

  // ---- sponsor ticket purchases ----
  const sponsorBuys = await prisma.ticketPurchase.findMany({
    where: { purchaseType: 'Sponsor', OR:[{shirtSize:null},{shirtSize:''}] },
    select: { id:true, member:{ select:{ email:true, firstName:true, lastName:true } } },
  })
  const buyFix = sponsorBuys.filter(p => sizeByEmail.has(String(p.member.email||'').toLowerCase()))
  if (buyFix.length) {
    console.log(`\n  ${APPLY ? 'SETTING' : 'WOULD SET'} size on ${buyFix.length} sponsor purchase record(s).`)
    if (APPLY) for (const p of buyFix) {
      await prisma.ticketPurchase.update({
        where:{id:p.id}, data:{ shirtSize: sizeByEmail.get(String(p.member.email).toLowerCase()) },
      })
    }
  }

  console.log('')
  if (!todo.length && !buyFix.length) console.log('  Nothing to backfill.')
  else if (APPLY) console.log('  Done.')
  else console.log('  Re-run with --apply to write these:\n\n      node backfill-sponsor-shirt-sizes.mjs --apply\n')
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0,5).join('\n  '))
} finally { await prisma.$disconnect() }
