/**
 * Encuerado Community Hub - repair mojibake in saved text
 *
 *   node clean-note-encoding.mjs           <- DRY RUN, shows what it would change
 *   node clean-note-encoding.mjs --apply   <- actually writes the changes
 *
 * Only ever replaces known-corrupt character sequences with the correct
 * character. Never deletes a row and never touches anything else.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Ordered longest-first so the double-encoded form is caught before the single.
const REPAIRS = [
  ['Ã‚Â·', '·'], // Ã‚Â·  -> ·
  ['Â·',             '·'], // Â·   -> ·
  ['Ã¢€“', '–'], // â€“  -> –
  ['Ã¢€”', '—'], // â€”  -> —
  ['Ã¢€™', "'"     ], // â€™  -> '
  ['ï¿½',       '—'], // ï¿½ -> —
]

const repair = (v) => {
  if (typeof v !== 'string' || !v) return v
  let out = v
  for (const [bad, good] of REPAIRS) out = out.split(bad).join(good)
  return out
}

const TARGETS = [
  ['eventRegistration', 'notes'],
  ['member',            'notes'],
  ['sponsorFulfillment','notes'],
  ['ticketPurchase',    'productName'],
  ['volunteerProfile',  'notes'],
  ['volunteerShift',    'notes'],
  ['eventCrewMember',   'notes'],
]

let grandTotal = 0
try {
  for (const [model, field] of TARGETS) {
    let rows
    try {
      rows = await prisma[model].findMany({ select: { id: true, [field]: true } })
    } catch (e) {
      console.log(`  [skip] ${model}.${field} - ${e.message.split('\n')[0].slice(0, 70)}`)
      continue
    }

    const dirty = rows.filter((r) => repair(r[field]) !== r[field])
    if (dirty.length === 0) { console.log(`  clean   ${model}.${field}`); continue }

    console.log(`  ${APPLY ? 'FIXING' : 'WOULD FIX'}  ${dirty.length} row(s) in ${model}.${field}`)
    console.log(`      e.g. ${JSON.stringify(String(dirty[0][field]).slice(0, 90))}`)
    console.log(`        -> ${JSON.stringify(String(repair(dirty[0][field])).slice(0, 90))}`)

    if (APPLY) {
      for (const row of dirty) {
        await prisma[model].update({
          where: { id: row.id },
          data: { [field]: repair(row[field]) },
        })
      }
    }
    grandTotal += dirty.length
  }

  console.log('')
  if (grandTotal === 0)      console.log('  Nothing to repair - all saved text is clean.')
  else if (APPLY)            console.log(`  Repaired ${grandTotal} row(s).`)
  else                       console.log(`  ${grandTotal} row(s) would be repaired. Re-run with --apply to do it:\n\n      node clean-note-encoding.mjs --apply\n`)
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0, 5).join('\n  '))
} finally {
  await prisma.$disconnect()
}
