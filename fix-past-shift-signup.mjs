/**
 * Stop the public volunteer signup page offering - or accepting - shifts that
 * have already started.
 *
 *   node fix-past-shift-signup.mjs
 *
 * Edits one source file. Safe to run twice.
 *
 * Guards BOTH the list and the submit handler. A Next.js server action is
 * reachable as its own endpoint regardless of what the page renders, so
 * hiding a shift in the UI is not by itself a guard.
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.join('src', 'app', 'volunteer-shifts', 'page.tsx')
if (!fs.existsSync(FILE)) {
  console.error(`\n  ERROR: cannot find ${FILE}\n  Run this from inside the project folder.\n`)
  process.exit(1)
}

let s = fs.readFileSync(FILE, 'utf8')
if (s.includes('signupCutoff')) {
  console.log('  Already applied - nothing to do.')
  process.exit(0)
}

let done = 0
const swap = (from, to, label) => {
  const a = s.includes(from) ? from : from.replace(/\n/g, '\r\n')
  if (!s.includes(a)) { console.log(`  [WARN] could not find: ${label}`); return }
  s = s.replace(a, a === from ? to : to.replace(/\n/g, '\r\n'))
  console.log(`  [OK] ${label}`); done++
}

swap(
`const ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']`,
`const ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

// Public signup must never offer - or accept - a shift that has already
// started. Used BOTH in the listing below and inside the server action: a
// server action is reachable on its own regardless of what the page renders,
// so hiding a shift in the UI is not by itself a guard.
function signupCutoff() {
  return new Date()
}`,
 'signup cutoff helper')

swap(
`      const shift = await prisma.volunteerShift.findFirst({
        where: {
          id: shiftId,
          status: 'Open',
          archivedAt: null,
          cancelledAt: null,
        },`,
`      const shift = await prisma.volunteerShift.findFirst({
        where: {
          id: shiftId,
          status: 'Open',
          archivedAt: null,
          cancelledAt: null,
          startsAt: { gte: signupCutoff() },
        },`,
 'submit handler rejects past shifts')

swap(
`  const shifts = await prisma.volunteerShift.findMany({
    where: {
      status: 'Open',
      archivedAt: null,
      cancelledAt: null,
    },`,
`  const shifts = await prisma.volunteerShift.findMany({
    where: {
      status: 'Open',
      archivedAt: null,
      cancelledAt: null,
      startsAt: { gte: signupCutoff() },
    },`,
 'listing hides past shifts')

fs.writeFileSync(FILE, s, 'utf8')
console.log(`\n  ${done} of 3 change(s) applied.`)
console.log('\n  Next:  npx tsc --noEmit')
console.log('  Then:  git add -A')
console.log('         git commit -m "Hide past shifts from public volunteer signup"')
console.log('         git push\n')
