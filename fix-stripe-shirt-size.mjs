/**
 * Encuerado Community Hub - make Stripe orders record the T-shirt size.
 *
 *   node fix-stripe-shirt-size.mjs
 *
 * Edits source files only. Touches no data. Safe to run twice.
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.join('src', 'lib', 'stripe', 'process-eligible-orders.ts')
if (!fs.existsSync(FILE)) {
  console.error(`\n  ERROR: cannot find ${FILE}`)
  console.error('  Run this from inside the project folder.\n')
  process.exit(1)
}

let src = fs.readFileSync(FILE, 'utf8')
const eol = src.includes('\r\n') ? '\r\n' : '\n'
let changed = 0, skipped = 0

const HELPER = `
// Stripe checkout collects the T-shirt size as a custom field on the SESSION
// (key "tshirtsize", a dropdown) - not on the line item. So it has to be read
// off the session and applied to every purchase in that order. Stripe returns
// the dropdown's machine value, e.g. "s" or "xxl", so it needs normalising.
function shirtSizeFromStripeSession(session: any): string | null {
  const fields = Array.isArray(session?.custom_fields) ? session.custom_fields : []

  const field = fields.find((entry: any) => {
    const key = String(entry?.key || '').toLowerCase().replace(/[^a-z]/g, '')
    const label = String(entry?.label?.custom || '').toLowerCase()
    return key.includes('shirt') || label.includes('shirt')
  })
  if (!field) return null

  const raw =
    field?.dropdown?.value ??
    field?.text?.value ??
    field?.numeric?.value ??
    null

  const value = String(raw ?? '').trim()
  if (!value) return null

  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'].includes(normalized)) {
    return normalized
  }

  // Tolerate "2XL" / "3XL" style values.
  const numeric = normalized.match(/^([2-5])XL$/)
  if (numeric) return 'X'.repeat(Number(numeric[1])) + 'L'

  return value
}

`

const steps = [
  {
    desc: 'add shirt-size reader for Stripe sessions',
    find: 'function buildRegistrationNote(sessionId: string, label: string, quantity: number) {',
    apply: (s, find) => s.replace(find, HELPER.replace(/\n/g, eol) + find),
    done: (s) => s.includes('shirtSizeFromStripeSession'),
  },
  {
    desc: 'read the size off each checkout session',
    find: 'const customerDetails = session.customer_details || {}',
    apply: (s, find) =>
      s.replace(find, find + eol + '    const orderShirtSize = shirtSizeFromStripeSession(session)'),
    done: (s) => s.includes('const orderShirtSize ='),
  },
  {
    desc: 'save the size on the purchase (was hardcoded null)',
    find: 'shirtSize: null as string | null,',
    apply: (s, find) => s.replace(find, 'shirtSize: orderShirtSize,'),
    done: (s) => s.includes('shirtSize: orderShirtSize,'),
  },
  {
    desc: 'correct the stale sponsor note about sizes not being collected',
    find: 'Shirt size and anonymity preference not collected at Stripe checkout - confirm with sponsor directly.',
    apply: (s, find) =>
      s.replace(find, 'Anonymity preference not collected at Stripe checkout - confirm with sponsor directly.'),
    done: (s) => s.includes('Anonymity preference not collected at Stripe checkout'),
  },
]

for (const step of steps) {
  if (step.done(src)) { console.log(`  [skip] ${step.desc}`); skipped++; continue }
  if (!src.includes(step.find)) { console.log(`  [WARN] could not find expected text for: ${step.desc}`); continue }
  src = step.apply(src, step.find)
  console.log(`  [FIXED] ${step.desc}`); changed++
}

fs.writeFileSync(FILE, src, 'utf8')
console.log(`\n  ${changed} fix(es) applied, ${skipped} already done.`)
console.log('\n  Next:  npx tsc --noEmit')
console.log('  Then:  node backfill-stripe-shirt-size.mjs        (dry run)')
console.log('         node backfill-stripe-shirt-size.mjs --apply\n')
