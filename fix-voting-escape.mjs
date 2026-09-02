/**
 * Give the contest voting screens a way out.
 *
 *   node fix-voting-escape.mjs
 *
 * The nav returned null on /admin/contest-voting*, which kept the kiosk clean
 * but left everyone stranded - no way back to the dashboard AND no way to log
 * out, including the voting operator. This swaps it for a slim bar with both.
 *
 * Safe for the VOTING role: tapping "Leave voting" hits /admin, which
 * redirectVotingAdminAwayFromGeneralAdmin sends straight back to voting. No
 * admin page becomes reachable.
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.join('src', 'components', 'admin', 'NavBar.tsx')
if (!fs.existsSync(FILE)) {
  console.error(`\n  ERROR: cannot find ${FILE}\n  Run this from inside the project folder.\n`)
  process.exit(1)
}

let s = fs.readFileSync(FILE, 'utf8')
if (s.includes('Leave voting')) {
  console.log('  Already applied - nothing to do.')
  process.exit(0)
}

const from = `  // Hide the normal admin banner on contest voting pages.
  // Voting admin should only see the voting screens, not the full admin nav.
  if (pathname?.startsWith('/admin/contest-voting')) {
    return null
  }`

const to = `  // Contest voting runs as a kiosk, so the full admin nav stays hidden here -
  // but returning null left everyone stranded with no way back and no way to
  // log out. A slim bar keeps the kiosk clean while still offering both. A
  // VOTING-role user who taps "Leave voting" is simply redirected back by
  // redirectVotingAdminAwayFromGeneralAdmin, so no admin page is exposed.
  if (pathname?.startsWith('/admin/contest-voting')) {
    return (
      <nav className="border-b border-[#2A0E10] bg-[#0B0B0B] px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link
            href="/admin"
            className="text-sm font-bold text-[#B11218] hover:text-[#D11A22]"
          >
            &larr; Leave voting
          </Link>

          <form action="/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>
      </nav>
    )
  }`

const a = s.includes(from) ? from : from.replace(/\n/g, '\r\n')
if (!s.includes(a)) {
  console.error('\n  [WARN] could not find the voting-nav block - file may have changed.')
  process.exit(1)
}
s = s.replace(a, a === from ? to : to.replace(/\n/g, '\r\n'))
fs.writeFileSync(FILE, s, 'utf8')

console.log('  [OK] voting screens now have "Leave voting" + Logout')
console.log('\n  Next:  npx tsc --noEmit')
console.log('  Then:  git add -A')
console.log('         git commit -m "Give contest voting screens a way back and a logout"')
console.log('         git push\n')
