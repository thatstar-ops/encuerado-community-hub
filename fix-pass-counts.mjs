/**
 * Encuerado Community Hub - pass-count + display fixes
 *
 * Run from the project folder:   node fix-pass-counts.mjs
 *
 * Read-only on your database. Only edits source files, and only if the exact
 * expected text is found. Safe to run twice - it skips anything already fixed.
 */
import fs from 'node:fs'
import path from 'node:path'

const CHECKIN = path.join('src', 'app', 'events', '[id]', 'check-in', 'page.tsx')
const HELPER  = path.join('src', 'lib', 'registration-pass-count.ts')

let changed = 0, skipped = 0
const log = (s) => console.log(s)

function must(file) {
  if (!fs.existsSync(file)) {
    console.error(`\n  ERROR: cannot find ${file}`)
    console.error('  Are you running this from inside the project folder?')
    process.exit(1)
  }
}
must(CHECKIN); must(HELPER)

// ---------------------------------------------------------------- FIX 1
// getRegistrationPassCount used Math.max across all "N pass" mentions, so a
// person holding three separate 1-pass orders showed as "1 ticket". Sum per
// DISTINCT order id instead - max was there to stop one order counting twice.
const NEW_HELPER = `export function getRegistrationPassCount(notes: string | null | undefined) {
  const text = String(notes || '')

  // Registration notes accumulate one segment per order, e.g.
  //   "Stripe order cs_live_abc - 1 pass - Encuerado Weekend Pass"
  //   "TicketSpice order NCRD-123 · 2 passes · PADRINO Sponsor Package"
  // One person can hold passes from SEVERAL orders (a paid one plus comped
  // ones), so the real total is the sum across orders. But the same order can
  // also appear twice in one note, so sum per DISTINCT order id - that double
  // counting is what the previous Math.max() was guarding against.
  //
  // The \\D{1,12} between id and count tolerates " - ", " · ", and the
  // mojibake " Ã‚Â· " still present in older saved notes.
  const perOrder = new Map<string, number>()

  for (const match of text.matchAll(
    /(?:Stripe|TicketSpice)\\s+order\\s+([A-Za-z0-9_-]+)\\D{1,12}?(\\d+)\\s+(?:pass|passes|ticket|tickets)\\b/gi
  )) {
    const count = Number(match[2])
    if (Number.isFinite(count) && count > 0) perOrder.set(match[1], count)
  }

  if (perOrder.size > 0) {
    return Array.from(perOrder.values()).reduce((sum, n) => sum + n, 0)
  }

  // Fallback for manual or legacy notes with no order id: keep the old
  // max-based behaviour so a note repeating one count doesn't double it.
  const matches = Array.from(
    text.matchAll(/(\\d+)\\s+(?:pass|passes|ticket|tickets)\\b/gi)
  )
  const counts = matches
    .map((match) => Number(match[1]))
    .filter((count) => Number.isFinite(count) && count > 0)

  return counts.length ? Math.max(...counts) : 1
}

export function getRegistrationPassLabel(notes: string | null | undefined) {
  const count = getRegistrationPassCount(notes)
  return count === 1 ? '1 ticket' : \`\${count} tickets\`
}

export function getRegistrationPassBadgeClass(notes: string | null | undefined) {
  const count = getRegistrationPassCount(notes)

  return count > 1
    ? 'rounded-full bg-yellow-400 px-3 py-1 text-sm font-black text-black'
    : 'rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white'
}
`

const helperSrc = fs.readFileSync(HELPER, 'utf8')
if (helperSrc.includes('perOrder')) {
  log('  [skip] pass count already fixed'); skipped++
} else if (!helperSrc.includes('Math.max(...counts)')) {
  log('  [WARN] registration-pass-count.ts does not look like the version I expected - NOT touching it')
} else {
  const eol = helperSrc.includes('\r\n') ? '\r\n' : '\n'
  fs.writeFileSync(HELPER, NEW_HELPER.replace(/\n/g, eol), 'utf8')
  log('  [FIXED] pass count now sums across orders (was taking the max)'); changed++
}

// ---------------------------------------------------------------- FIX 2 & 3
// Two template literals are missing their "$", so they print the instruction
// instead of the value. Plus Completion% divided passes by people.
let checkin = fs.readFileSync(CHECKIN, 'utf8')
const edits = [
  ['` {registration.member.phone}`',  '` · ${registration.member.phone}`', 'phone number now displays (was printing raw code)'],
  ['` {sponsorFulfillment.hoodieSize}`', '` ${sponsorFulfillment.hoodieSize}`',  'sponsor hoodie size now displays (was printing raw code)'],
  ['(checkedInCount / event.registrations.length)', '(checkedInCount / registeredPassCount)', 'Completion % now compares passes to passes (could exceed 100%)'],
]
for (const [from, to, desc] of edits) {
  if (!checkin.includes(from)) {
    if (checkin.includes(to)) { log(`  [skip] ${desc}`); skipped++ }
    else { log(`  [WARN] could not find expected text for: ${desc}`) }
    continue
  }
  checkin = checkin.split(from).join(to)
  log(`  [FIXED] ${desc}`); changed++
}
fs.writeFileSync(CHECKIN, checkin, 'utf8')

log(`\n  ${changed} fix(es) applied, ${skipped} already done.`)
log('\n  Next:  npx tsc --noEmit     (should print nothing)')
log('  Then:  git add -A')
log('         git commit -m "Fix pass count to sum across orders; fix check-in display bugs"')
log('         git push\n')
