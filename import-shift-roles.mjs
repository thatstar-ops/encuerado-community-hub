/**
 * Create the volunteer role library from the shift-duties document and link
 * every shift to its role.
 *
 *   node import-shift-roles.mjs            <- DRY RUN, shows the mapping only
 *   node import-shift-roles.mjs --apply    <- creates roles and links shifts
 *
 * Why roles and not shift descriptions: the reminder email pulls
 * `shift.role.description` (src/lib/volunteer-reminders.ts line 120). A
 * description typed onto the shift itself never reaches the email.
 *
 * Roles are shared where the duties are identical across events (Registration
 * Table, Clothes Check, Floaters, Bar, Tech, Vidal CoLab) and event-specific
 * where they differ (each Set-Up and Break-Down).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const BADGE = "Don't forget to give back your volunteer badge and take a pin/t-shirt/weekend package if you are owed one!"
const CHECKIN = 'Check in with Encuerado staff and put on a badge.'
const SNACK = 'Maybe have a snack and please drink water.'

const REG_TABLE = [CHECKIN,
 'Make sure the table is set up with cash box, 2 tablets, liability waivers/clipboards/pens, ID check, snack box, and ticket packages (bags with t-shirt/pin/wristbands/vote chips/etc).',
 'Count money and report the total to Encuerado staff.',
 'Double check that the Encuerado app is signed in and the tablets have some battery.',
 'Check in pre-orders via the app, or take cash and add attendees’ info to the app.',
 'Weekend pass holders should receive a bag with wristband and vote tokens. VIP pass holders should receive a bag with two wristbands, two sets of vote tokens, one t-shirt, and one pin.',
 SNACK,
 'At the end of the shift, count the money and report the total to Encuerado staff.',
 'Re-pack the registration table items, fold down the table, and check with Encuerado staff for where it should go.',
 BADGE]

const CLOTHES = [CHECKIN,
 'Make sure the area is set up with shelving, tables, bags, markers, and post-its.',
 'Write numbers on bags in order.',
 'Give out bags to attendees and write their bag number on their body or a post-it. They can take a photo of the number to remember it.',
 'Place the numbered bag in numerical order on the shelves.',
 SNACK,
 'When attendees come back for their belongings, try to re-use the numbered bags if possible.',
 BADGE]

const FLOATERS = [CHECKIN,
 'Locate trash cans and replacement trash bags. Occasionally bus tables and other areas, then empty trash cans as they fill.',
 'Check in with staff every so often to be assigned tasks as needed.',
 SNACK, BADGE]

const TECH = [CHECKIN,
 'Find Dan O’Leary to receive instructions. This may involve cabling, being on a ladder, and some heavy lifting.',
 'Maybe have a snack at some point! Please drink water!',
 BADGE]

const VIDAL_SETUP = [CHECKIN,
 'Unload all equipment from the truck and load it into the space.',
 'Set up stage, tables, pipe-and-drape, slings/crosses/etc.',
 'Set up registration table with cash box, 2 tablets, liability waivers/clipboards/pens, ID check, snack box, and ticket packages (bags with t-shirt/pin/wristbands/vote chips/etc).',
 'Set up clothes check area with shelving, tables, bags, markers, etc.',
 'Check that portapotties are stocked and unlocked.',
 'Maybe have a snack! Please drink water!',
 'Assist contestants and bar staff in unloading and bringing in equipment.',
 'Staff will have other tasks/errands as well.',
 BADGE]

const VIDAL_BREAKDOWN = [CHECKIN,
 'Bus tables, pick up trash, empty and stack trash cans.',
 'Break down tables, stages, DJ equipment, clothes check area, registration table, and bar area if necessary.',
 'Help contestants and staff carry equipment out to vehicles.',
 SNACK,
 'Staff will have other tasks/errands as well.',
 BADGE]

const ROLES = [
  { key:'reg',        title:'Registration Table',            lines:REG_TABLE },
  { key:'clothes',    title:'Clothes Check',                 lines:CLOTHES },
  { key:'floaters',   title:'Floaters',                      lines:FLOATERS },
  { key:'tech',       title:'Tech Set-up',                   lines:TECH },
  { key:'vidalSetup', title:'Vidal CoLab Set-Up',            lines:VIDAL_SETUP },
  { key:'vidalBreak', title:'Vidal CoLab Break-Down',        lines:VIDAL_BREAKDOWN },
  { key:'barLoad',    title:'Bar Load-In',                   lines:[
      'IMPORTANT: you will meet Michael Lara at his home at 11037 Erwin St. in North Hollywood, help load all bar equipment, drive to the Vidal CoLab, and help unload per his instructions. This requires transportation.',
      BADGE] },
  { key:'bar',        title:'Bar Assistant',                 lines:[CHECKIN,
      'Check in with bar staff for specific duties.',
      'Early shifts may include helping to set up the bar and load in drinks/ice/equipment.',
      'Take out bar trash and replace bags.',
      SNACK,
      'Refill ice, restock drinks/cups/equipment.',
      'Later shifts may include helping to break down the bar, clean surfaces, and load out drinks/equipment.',
      BADGE] },

  { key:'sombrasSetup', title:'Sombras de Mi Barrio - Set-up', lines:[CHECKIN,
      'Load in any items needed for the event.',
      'Help hang art pieces per staff’s specifications.',
      'Set up food/beverage area.',
      'Set up registration table with cash box, 2 tablets, liability waivers/clipboards/pens, ID check, snack box, and ticket packages (bags with t-shirt/pin/wristbands/vote chips/etc).',
      'Staff may have other tasks/errands as well.',
      BADGE] },
  { key:'sombrasServer', title:'Sombras de Mi Barrio - Server/Clean-up', lines:[CHECKIN,
      'Check levels of food, drinks, ice, and plates/napkins. Locate trash bags. Wash your hands, please.',
      'Serve food/beverage as instructed by Encuerado staff.',
      'Occasionally sweep the room for discarded plates/cups and throw them away.',
      'Empty trash as needed.',
      'At 8pm, break down and consolidate all food/beverage per Encuerado staff instructions. Break down the food area as needed.',
      BADGE] },

  { key:'atameSetup', title:'ATAME/VPL - Set-up/General Crew', lines:[CHECKIN,
      'Load in any items needed for the event.',
      'Set up registration table with cash box, 2 tablets, liability waivers/clipboards/pens, ID check, snack box, and ticket packages (bags with t-shirt/pin/wristbands/vote chips/etc).',
      'Tape off areas for each contestant’s demo. If needed, help set up slings, move furniture out of the way, and assist with other equipment set-up.',
      'Maybe have a snack! Please drink water!',
      'Staff may have other tasks/errands as well.',
      BADGE] },
  { key:'atameBreak', title:'ATAME/VPL - General Crew/Break-Down', lines:[CHECKIN,
      'Locate trash bags in case any contestant demos need them for clean-up.',
      'Be available for general assistance to Encuerado staff.',
      'Maybe have a snack! Please drink water!',
      'Staff may have other tasks/errands as well.',
      'When the demos are finished, assist with break-down of demo areas as needed. This may include breaking down and packing slings or other equipment, cleaning, and taking tape off the floor.',
      'Help load out any Encuerado equipment.',
      BADGE] },

  { key:'aguasSetup', title:'Aguas Frescas - Set-Up', lines:[CHECKIN,
      'Help unload equipment/drinks/etc from vehicles.',
      'Put up privacy fabric and banners.',
      'Set up staging area/DJ table.',
      'Find and label vitroleros.',
      'Blow up pools.',
      SNACK,
      'Set up registration table with cash box, 2 tablets, liability waivers/clipboards/pens, ID check, snack box, and ticket packages (bags with t-shirt/pin/wristbands/vote chips/etc).',
      'Set up clothes check area with shelving, tables, bags, markers, etc.',
      'Attach shower to hose and place small towels nearby.',
      'Put bags in trash cans.',
      'Set up slings/crosses/etc.',
      BADGE] },
  { key:'aguasDrink', title:'Aguas Frescas - Drink Service', lines:[CHECKIN,
      'Make sure the keg is tapped, cups are out, and water bottles are stacked for easy distribution.',
      'Fill cups with beer and set out water on the table.',
      'Bus areas, empty containers into the trash cans.',
      'As needed, empty the trash and re-line with bags.',
      SNACK, BADGE] },
  { key:'aguasBreak', title:'Aguas Frescas - Break Down', lines:[CHECKIN,
      'Empty all liquids and bus containers into trash cans.',
      'Break down all tables, shelving, equipment, slings, etc.',
      'Take down privacy fabric.',
      SNACK,
      'Load items into vehicles.',
      'Take the air out of the pools.',
      'Hose down/clean equipment and the parking lot.',
      BADGE] },
]

const norm = (s) => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()

/** Decide which role a shift belongs to, from its event + title. */
function pickRole(eventTitle, shiftTitle) {
  const e = norm(eventTitle), s = norm(shiftTitle)
  if (s.includes('registration')) return 'reg'
  if (s.includes('clothes')) return 'clothes'
  if (s.includes('floater')) return 'floaters'
  if (s.includes('bar load')) return 'barLoad'
  if (s.includes('bar')) return 'bar'
  if (s.includes('tech')) return 'tech'
  if (s.includes('vidal') && s.includes('break')) return 'vidalBreak'
  if (s.includes('vidal') || (s.includes('colab') && s.includes('set'))) return 'vidalSetup'
  if (e.includes('sombras')) {
    if (s.includes('server') || s.includes('clean')) return 'sombrasServer'
    if (s.includes('set')) return 'sombrasSetup'
  }
  if (e.includes('atame') || e.includes('vpl')) {
    if (s.includes('break')) return 'atameBreak'
    if (s.includes('set') || s.includes('crew')) return 'atameSetup'
  }
  if (e.includes('agua')) {
    if (s.includes('drink') || s.includes('server')) return 'aguasDrink'
    if (s.includes('break')) return 'aguasBreak'
    if (s.includes('set')) return 'aguasSetup'
  }
  return null
}

try {
  const shifts = await prisma.volunteerShift.findMany({
    where: { archivedAt: null },
    select: { id:true, title:true, roleId:true, event:{ select:{ title:true } } },
    orderBy: [{ event: { startsAt: 'asc' } }, { startsAt: 'asc' }],
  })

  const byRole = new Map(), unmatched = []
  for (const sh of shifts) {
    const key = pickRole(sh.event.title, sh.title)
    if (!key) { unmatched.push(sh); continue }
    if (!byRole.has(key)) byRole.set(key, [])
    byRole.get(key).push(sh)
  }

  console.log(`  ${shifts.length} active shifts, ${ROLES.length} roles defined\n`)
  console.log('='.repeat(70))
  console.log('  MAPPING')
  console.log('='.repeat(70))
  for (const role of ROLES) {
    const list = byRole.get(role.key) || []
    console.log(`\n  ${role.title}  (${list.length} shift${list.length===1?'':'s'}, ${role.lines.length} duties)`)
    for (const sh of list) console.log(`      ${sh.event.title} :: ${sh.title}${sh.roleId ? '  [already linked]' : ''}`)
    if (!list.length) console.log('      (no shifts matched - role will still be created)')
  }
  if (unmatched.length) {
    console.log(`\n  *** ${unmatched.length} SHIFT(S) DID NOT MATCH ANY ROLE ***`)
    for (const sh of unmatched) console.log(`      ${sh.event.title} :: ${sh.title}`)
    console.log('      ^ tell Claude these and the matcher can be adjusted.')
  }

  if (!APPLY) {
    console.log(`\n  Dry run - nothing changed. To apply:\n\n      node import-shift-roles.mjs --apply\n`)
  } else {
    console.log('\n  Applying...')
    let created=0, updated=0, linked=0
    for (const role of ROLES) {
      const description = role.lines.map(l => '- ' + l).join('\n')
      const existing = await prisma.volunteerRole.findFirst({ where: { title: role.title } })
      let roleId
      if (existing) {
        await prisma.volunteerRole.update({ where:{id:existing.id}, data:{ description, archivedAt:null } })
        roleId = existing.id; updated++
      } else {
        const made = await prisma.volunteerRole.create({ data:{ title: role.title, description } })
        roleId = made.id; created++
      }
      for (const sh of (byRole.get(role.key) || [])) {
        await prisma.volunteerShift.update({ where:{id:sh.id}, data:{ roleId } })
        linked++
      }
    }
    console.log(`\n  Roles created: ${created}, updated: ${updated}`)
    console.log(`  Shifts linked: ${linked}`)
    if (unmatched.length) console.log(`  Shifts left unlinked: ${unmatched.length}`)
    console.log('')
  }
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0,6).join('\n  '))
} finally { await prisma.$disconnect() }
