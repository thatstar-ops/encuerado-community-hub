// Read-only diagnostic for the "Agua Fresca" money tally card on the admin
// dashboard (src/components/admin/AdminMoneyTallies.tsx). That card
// recomputes a dollar amount per TicketPurchase from raw TicketSpice JSON
// (raw.amount -> raw.pricePoint.amount -> raw.pricePoint.price -> stored
// amountPaidCents -> hardcoded $50 fallback) instead of just summing the
// amountPaidCents that was actually captured at ingestion time. This script
// prints every purchase that matches (or nearly matches) the Agua Fresca
// product-name check, showing the raw fields side by side with the stored
// amount and the recomputed tally amount, so we can see exactly where they
// diverge before touching any logic.
//
// Makes NO changes to the database.
//
// Usage:
//   node scripts/diagnose-agua-fresca-tally.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalize(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isAguaFrescaPurchase(productName) {
  const name = normalize(productName)
  return (
    name.includes('AGUAS FRESCAS') ||
    name.includes('AGUA FRESCA') ||
    name.includes('PISS QUEEN')
  )
}

function readNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function dollarsToCents(value) {
  return Math.round(value * 100)
}

function ticketSpiceAmountToCents(value) {
  const amount = readNumber(value)
  if (amount === null || amount <= 0) return null
  return dollarsToCents(amount)
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100
  )
}

// Exact copy of AdminMoneyTallies.tsx's current logic, for comparison.
function currentTallyLogicCents(purchase) {
  const raw = purchase.rawProductJson

  const rawAmount = ticketSpiceAmountToCents(raw?.amount)
  if (rawAmount !== null) return { cents: rawAmount, source: 'raw.amount' }

  const rawPricePointAmount = ticketSpiceAmountToCents(raw?.pricePoint?.amount)
  if (rawPricePointAmount !== null) return { cents: rawPricePointAmount, source: 'raw.pricePoint.amount' }

  const rawPricePointPrice = ticketSpiceAmountToCents(raw?.pricePoint?.price)
  if (rawPricePointPrice !== null) return { cents: rawPricePointPrice, source: 'raw.pricePoint.price' }

  if (purchase.amountPaidCents) return { cents: purchase.amountPaidCents, source: 'stored amountPaidCents' }

  return { cents: 5000 * Math.max(1, purchase.passCount || 1), source: 'HARDCODED $50 fallback' }
}

async function main() {
  const PAID_STATUSES = ['Paid', 'paid', 'PAID', 'Completed', 'completed', 'COMPLETED']

  // 1. Every purchase the live tally card actually includes (paid-status filter).
  const paidPurchases = await prisma.ticketPurchase.findMany({
    where: { paymentStatus: { in: PAID_STATUSES } },
    select: {
      id: true,
      productName: true,
      purchaseType: true,
      productCategory: true,
      paymentStatus: true,
      amountPaidCents: true,
      passCount: true,
      externalOrderId: true,
      externalLineItemId: true,
      purchasedAt: true,
      rawProductJson: true,
    },
    orderBy: { purchasedAt: 'asc' },
  })

  const aguaPaid = paidPurchases.filter((p) => isAguaFrescaPurchase(p.productName))

  console.log(`\n=== Agua Fresca purchases counted by the live tally (paymentStatus in ${JSON.stringify(PAID_STATUSES)}) ===`)
  console.log(`Found ${aguaPaid.length} matching row(s).\n`)

  let sumStored = 0
  let sumTally = 0
  const bySourceCount = {}

  for (const p of aguaPaid) {
    const raw = p.rawProductJson || {}
    const tally = currentTallyLogicCents(p)
    sumStored += p.amountPaidCents || 0
    sumTally += tally.cents
    bySourceCount[tally.source] = (bySourceCount[tally.source] || 0) + 1

    const mismatch = (p.amountPaidCents || 0) !== tally.cents ? '  <-- MISMATCH vs stored amountPaidCents' : ''

    console.log(
      `  id=${p.id} | order=${p.externalOrderId || '(manual)'} | status=${p.paymentStatus} | passCount=${p.passCount}`
    )
    console.log(`    productName: "${p.productName}"`)
    console.log(
      `    stored amountPaidCents: ${money(p.amountPaidCents)}   |   tally recomputes: ${money(tally.cents)} (via ${tally.source})${mismatch}`
    )
    console.log(
      `    raw.amount=${raw?.amount ?? 'n/a'}  raw.total=${raw?.total ?? 'n/a'}  raw.price=${raw?.price ?? 'n/a'}  raw.subtotal=${raw?.subtotal ?? 'n/a'}  raw.lineTotal=${raw?.lineTotal ?? 'n/a'}  raw.totalAmount=${raw?.totalAmount ?? 'n/a'}  raw.amountPaid=${raw?.amountPaid ?? 'n/a'}`
    )
    console.log(`    raw.pricePoint: ${JSON.stringify(raw?.pricePoint ?? null)}`)
    console.log('')
  }

  console.log('--- Totals ---')
  console.log(`Sum of stored amountPaidCents (what was actually recorded as collected): ${money(sumStored)}`)
  console.log(`Sum via current tally-card logic (what the dashboard card shows):        ${money(sumTally)}`)
  console.log(`Difference: ${money(sumTally - sumStored)}`)
  console.log(`Value source breakdown: ${JSON.stringify(bySourceCount, null, 2)}`)

  // 2. Anything that might be an Agua Fresca purchase but DOESN'T match the
  // product-name check (typos, alternate labels) - these are silently
  // excluded from the card entirely.
  const allPurchases = await prisma.ticketPurchase.findMany({
    select: { id: true, productName: true, paymentStatus: true, amountPaidCents: true },
  })
  const possibleMisses = allPurchases.filter((p) => {
    const n = normalize(p.productName)
    const looksRelated = n.includes('AGUA') || n.includes('FRESCA') || n.includes('PISS') || n.includes('QUEEN') || n.includes('WET PLAY')
    return looksRelated && !isAguaFrescaPurchase(p.productName)
  })

  if (possibleMisses.length) {
    console.log(`\n=== Possible near-misses (contain agua/fresca/piss/queen/wet-play but did NOT match the card's filter) ===`)
    for (const p of possibleMisses) {
      console.log(`  id=${p.id} | status=${p.paymentStatus} | amountPaidCents=${money(p.amountPaidCents)} | productName="${p.productName}"`)
    }
  } else {
    console.log('\nNo near-miss product names found - the name filter itself looks complete.')
  }

  // 3. Agua Fresca purchases that exist but are EXCLUDED because their
  // paymentStatus isn't in the "paid" list - these would be missing from the
  // card even though money may have actually been collected.
  const aguaAll = allPurchases.filter((p) => isAguaFrescaPurchase(p.productName))
  const aguaExcludedByStatus = aguaAll.filter((p) => !PAID_STATUSES.includes(p.paymentStatus))

  if (aguaExcludedByStatus.length) {
    console.log(`\n=== Agua Fresca rows EXCLUDED from the card due to paymentStatus (${aguaExcludedByStatus.length}) ===`)
    for (const p of aguaExcludedByStatus) {
      console.log(`  id=${p.id} | status="${p.paymentStatus}" | amountPaidCents=${money(p.amountPaidCents)} | productName="${p.productName}"`)
    }
  } else {
    console.log('\nNo Agua Fresca rows excluded by payment status.')
  }

  // 4. Duplicate-row check (same order + line item counted twice would
  // silently inflate the total).
  const seen = new Map()
  const dupes = []
  for (const p of aguaPaid) {
    const key = `${p.externalOrderId || ''}::${p.externalLineItemId || ''}`
    if (key === '::') continue
    if (seen.has(key)) dupes.push([seen.get(key), p.id])
    else seen.set(key, p.id)
  }
  if (dupes.length) {
    console.log(`\n=== Possible duplicate rows (same order+line item) ===`)
    for (const [a, b] of dupes) console.log(`  ids ${a} and ${b}`)
  } else {
    console.log('\nNo duplicate order+line-item rows found among Agua Fresca purchases.')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
