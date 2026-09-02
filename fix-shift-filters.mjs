/**
 * Make the "Needs Volunteers" and "Open Only" buttons on /shifts behave:
 *   - clicking an active filter turns it OFF (they toggle)
 *   - the two can be combined instead of clearing each other
 *   - each label shows how many shifts it would leave, so a filter that
 *     changes nothing is obvious before you click it
 *
 *   node fix-shift-filters.mjs
 *
 * Edits one source file. Safe to run twice.
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.join('src', 'app', 'shifts', 'page.tsx')
if (!fs.existsSync(FILE)) {
  console.error(`\n  ERROR: cannot find ${FILE}\n  Run this from inside the project folder.\n`)
  process.exit(1)
}

let s = fs.readFileSync(FILE, 'utf8')
if (s.includes('needsCount')) {
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

// 1. stop filtering shiftStatus in the query so the label counts are honest
swap(`  if (shiftStatusFilter) {
    where.status = shiftStatusFilter
  }`,
`  // shiftStatus is applied after fetching (below) so the button labels can show
  // honest counts for whichever Active/Archived/All tab is selected.`,
 'shiftStatus moved out of the DB query')

// 2. counts + both filters applied post-fetch
swap(`  const shifts = needsVolunteersOnly
    ? allShifts.filter((shift) => {
        const activeCount = shift.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)).length
        return shift.status === 'Open' && activeCount < shift.neededCount
      })
    : allShifts`,
`  const activeAssignmentCount = (shift: (typeof allShifts)[number]) =>
    shift.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)).length

  const isUnderStaffed = (shift: (typeof allShifts)[number]) =>
    shift.status === 'Open' && activeAssignmentCount(shift) < shift.neededCount

  // Counts for the button labels, so a filter that would change nothing is
  // obvious before you click it rather than looking broken afterwards.
  const needsCount = allShifts.filter(isUnderStaffed).length
  const openCount = allShifts.filter((shift) => shift.status === 'Open').length

  const shifts = allShifts
    .filter((shift) => (needsVolunteersOnly ? isUnderStaffed(shift) : true))
    .filter((shift) => (shiftStatusFilter ? shift.status === shiftStatusFilter : true))`,
 'counts + post-fetch filtering')

// 3. Needs Volunteers -> toggles, keeps the other filter, shows its count
swap(`            href={filterQuery({ needs: '1' })}`,
`            href={filterQuery({
              needs: needsVolunteersOnly ? '' : '1',
              shiftStatus: shiftStatusFilter || '',
            })}`,
 'Needs Volunteers toggles')

swap(`            Needs Volunteers
          </Link>`,
`            Needs Volunteers ({needsCount})
          </Link>`,
 'Needs Volunteers count')

// 4. Open Only -> toggles, keeps the other filter, shows its count
swap(`            href={filterQuery({ shiftStatus: 'Open' })}`,
`            href={filterQuery({
              needs: needsVolunteersOnly ? '1' : '',
              shiftStatus: shiftStatusFilter === 'Open' ? '' : 'Open',
            })}`,
 'Open Only toggles')

swap(`            Open Only
          </Link>`,
`            Open Only ({openCount})
          </Link>`,
 'Open Only count')

fs.writeFileSync(FILE, s, 'utf8')
console.log(`\n  ${done} change(s) applied.`)
console.log('\n  Next:  npx tsc --noEmit')
console.log('  Then:  git add -A')
console.log('         git commit -m "Make shift filters toggle and show counts"')
console.log('         git push\n')
