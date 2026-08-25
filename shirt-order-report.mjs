/**
 * Encuerado Weekend - what shirts do we actually need to order?
 *
 *   node shirt-order-report.mjs            <- default: volunteers need 3+ shifts
 *   node shirt-order-report.mjs --min 2    <- change the shift threshold
 *
 * READ ONLY. Changes nothing.
 *
 * Shirt sizes live in three unrelated places in this app and nothing ever adds
 * them together. This does:
 *   1. Volunteers    - VolunteerProfile.shirtSize, but ONLY those with enough shifts
 *   2. Pass holders  - TicketPurchase.shirtSize on Weekend / VIP passes
 *   3. Sponsors      - SponsorFulfillment.shirtCount owed vs shirtSizes known
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const argIdx = process.argv.indexOf('--min')
const MIN_SHIFTS = argIdx > -1 ? Number(process.argv[argIdx + 1]) || 3 : 3
const ACTIVE = ['Assigned', 'Confirmed', 'Interested']
const SIZES = ['XS','S','M','L','XL','XXL','XXXL','XXXXL']

const blank = () => Object.fromEntries(SIZES.map(s => [s, 0]))
const add = (tally, size, n = 1) => { if (size && tally[size] !== undefined) tally[size] += n }
const line = (s='') => console.log(s)
const show = (t) => SIZES.filter(s => t[s] > 0).map(s => `${s}:${t[s]}`).join('  ') || '(none)'

try {
  // ---------- 1. VOLUNTEERS ----------
  const profiles = await prisma.volunteerProfile.findMany({
    select: { shirtSize: true,
      member: { select: { firstName:true, lastName:true, email:true,
        volunteerAssignments: { select: { status: true } } } } },
  })

  const volTally = blank()
  const volNoSize = []
  let eligible = 0
  for (const p of profiles) {
    const shifts = p.member.volunteerAssignments.filter(a => ACTIVE.includes(a.status)).length
    if (shifts < MIN_SHIFTS) continue
    eligible++
    const size = String(p.shirtSize || '').trim().toUpperCase()
    if (size && volTally[size] !== undefined) add(volTally, size)
    else volNoSize.push(`${p.member.firstName} ${p.member.lastName} <${p.member.email}> (${shifts} shifts)`)
  }

  line('='.repeat(64))
  line(`1. VOLUNTEERS  (rule: ${MIN_SHIFTS}+ active shifts earns a shirt)`)
  line('='.repeat(64))
  line(`  ${profiles.length} volunteer profiles exist in total`)
  line(`  ${eligible} of them qualify for a shirt`)
  line(`  ${eligible - volNoSize.length} have a size on file, ${volNoSize.length} do not`)
  line(`  sizes: ${show(volTally)}`)

  // ---------- 2. PASS HOLDERS ----------
  // One shirt PER PERSON, not per purchase. A VIP pass covers 2 people
  // (passCount 2) but checkout only ever asked the buyer's size, so every
  // seat beyond the first is a shirt with no size attached.
  const passes = await prisma.ticketPurchase.findMany({
    where: { purchaseType: { in: ['Weekend Pass', 'VIP Pass'] } },
    select: { shirtSize:true, purchaseType:true, passCount:true,
      member: { select: { firstName:true, lastName:true, email:true } } },
  })
  const passTally = blank()
  const passGaps = []
  let passSeats = 0, passKnown = 0
  for (const p of passes) {
    const seats = Math.max(1, Number(p.passCount) || 1)
    passSeats += seats
    const size = String(p.shirtSize || '').trim().toUpperCase()
    const haveSize = Boolean(size && passTally[size] !== undefined)
    if (haveSize) { add(passTally, size); passKnown++ }
    const missing = seats - (haveSize ? 1 : 0)
    if (missing > 0) {
      passGaps.push(`${p.member.firstName} ${p.member.lastName} <${p.member.email}> - ${p.purchaseType}: ${seats} seat(s), ${haveSize ? 1 : 0} size known, ${missing} missing`)
    }
  }
  line('')
  line('='.repeat(64))
  line('2. PASS HOLDERS  (Weekend + VIP - one shirt per person)')
  line('='.repeat(64))
  line(`  ${passes.length} pass purchase(s) covering ${passSeats} people`)
  line(`  ${passKnown} size(s) known, ${passSeats - passKnown} unknown`)
  line(`  sizes: ${show(passTally)}`)

  // ---------- 3. SPONSORS ----------
  const sponsors = await prisma.sponsorFulfillment.findMany({
    select: { sponsorTier:true, shirtCount:true, shirtSizes:true,
      member: { select: { firstName:true, lastName:true, email:true } } },
  })
  const sponTally = blank()
  let owed = 0, knownSpon = 0
  const sponGaps = []
  for (const s of sponsors) {
    owed += s.shirtCount || 0
    let list = s.shirtSizes
    if (typeof list === 'string') { try { list = JSON.parse(list) } catch { list = [list] } }
    list = Array.isArray(list) ? list.filter(Boolean) : (list ? [list] : [])
    for (const raw of list) {
      const size = String(raw).trim().toUpperCase()
      if (sponTally[size] !== undefined) { add(sponTally, size); knownSpon++ }
    }
    const missing = (s.shirtCount || 0) - list.length
    if (missing > 0) sponGaps.push(`${s.member.firstName} ${s.member.lastName} <${s.member.email}> - ${s.sponsorTier}: owed ${s.shirtCount}, ${list.length} size(s) known`)
  }
  line('')
  line('='.repeat(64))
  line('3. SPONSORS')
  line('='.repeat(64))
  line(`  ${sponsors.length} sponsors, owed ${owed} shirts between them`)
  line(`  ${knownSpon} size(s) known, ${owed - knownSpon} unknown`)
  line(`  sizes: ${show(sponTally)}`)

  // ---------- TOTAL ----------
  const total = blank()
  for (const s of SIZES) total[s] = volTally[s] + passTally[s] + sponTally[s]
  const totalKnown = SIZES.reduce((a,s)=>a+total[s],0)
  const totalUnknown = volNoSize.length + (passSeats - passKnown) + (owed - knownSpon)

  line('')
  line('#'.repeat(64))
  line('   COMBINED SHIRT ORDER')
  line('#'.repeat(64))
  for (const s of SIZES) if (total[s] > 0) {
    line(`   ${s.padEnd(6)} ${String(total[s]).padStart(4)}   ${'#'.repeat(total[s])}`)
  }
  line(`   ${'-'.repeat(40)}`)
  line(`   Known sizes:        ${totalKnown}`)
  line(`   Size still unknown: ${totalUnknown}`)
  line(`   TOTAL SHIRTS:       ${totalKnown + totalUnknown}`)

  // ---------- WHO TO CHASE ----------
  line('')
  line('='.repeat(64))
  line('WHO STILL NEEDS TO GIVE YOU A SIZE')
  line('='.repeat(64))
  const section = (title, arr) => {
    line(`\n  ${title} (${arr.length})`)
    arr.slice(0, 40).forEach(x => line(`    - ${x}`))
    if (arr.length > 40) line(`    ... and ${arr.length - 40} more`)
  }
  if (volNoSize.length)  section('Volunteers who earned a shirt but gave no size', volNoSize)
  if (passGaps.length)   section('Pass holders owed more shirts than sizes given', passGaps)
  if (sponGaps.length)   section('Sponsors owed more shirts than sizes given', sponGaps)
  if (!volNoSize.length && !passGaps.length && !sponGaps.length) line('\n  Nobody - every shirt has a size.')
  line('')
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0,6).join('\n  '))
} finally { await prisma.$disconnect() }
