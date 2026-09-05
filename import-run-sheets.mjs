/**
 * Import the Encuerado 2026 run-of-show into Event Operations run sheets.
 *
 *   node import-run-sheets.mjs           <- DRY RUN, shows what it would write
 *   node import-run-sheets.mjs --apply   <- REPLACES each event's run sheet
 *
 * Source: "V2 Encuerado 2026 Schedule" (a/o 9/2/2026).
 *
 * Volunteer names and phone numbers from the PDF are deliberately NOT imported
 * - the live assignments live in the app and the PDF's rosters are out of date.
 * Each CALL line keeps its headcount and role so the run sheet still tells you
 * how many people are due and when.
 *
 * --apply DELETES the existing run sheet items for these four events first.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Times below are the Pacific wall-clock times from the schedule.
//
// IMPORTANT - this app stores run sheet times "naive": the Add Item form takes
// a datetime-local value and saves it as-if-UTC, and the operations page
// formats it back with no timeZone set (so, UTC on Vercel). Typed items
// therefore round-trip and look correct. Storing a genuinely-correct UTC
// instant here would display 7 hours late, so we match the app's convention
// and store the wall-clock time verbatim.
//
// There is a real timezone bug underneath this - worth fixing after the
// season by setting timeZone: 'America/Los_Angeles' on the operations page
// formatter AND converting on input. Do not change one without the other.

const at = (localIso) => new Date(`${localIso}:00Z`)

// [ localTime, title, owner, location, notes ]
const SHEETS = [
  {
    event: 'ATAME/VPL Crossover',
    venue: 'Precinct DTLA',
    items: [
      ['2026-09-03T17:00', 'CALL: 5 Volunteers - General Crew', '', '', ''],
      ['2026-09-03T17:00', 'CALL: Kirby (Host) + 5 Contestants', 'Kirby', '', ''],
      ['2026-09-03T17:00', 'SETUP: Atame Setup (until 5:30p)', '', '', ''],
      ['2026-09-03T17:00', 'SETUP: Contestants set up demos (until 6:00p)', '', '', ''],
      ['2026-09-03T17:30', 'REHEARSAL: Atame Rehearsal (until 6:00p)', 'Kirby', '', ''],
      ['2026-09-03T17:30', 'CALL: 2 Volunteers - Registration Table (5:30-8:00p)', '', '', ''],
      ['2026-09-03T18:00', 'DOORS OPEN', '', '', 'Music; Avatar Demos'],
      ['2026-09-03T18:00', 'CALL: 2 Volunteers - Load Bar Supplies (report to pickup, not Precinct)', '', 'Private residence, North Hollywood', 'Address from Michael - volunteers get it in their shift email. Load here, drive to Vidal CoLab, unload at 8:00p.'],
      ['2026-09-03T18:45', 'PROGRAM START: Atame Begins', 'Kirby', '', 'Encuerado LFW video'],
      ['2026-09-03T18:50', 'HOST: Kirby Opening Number (until 7:00p)', 'Kirby', '', 'Music'],
      ['2026-09-03T19:00', 'HOST: Kirby Welcome; thanks sponsors, volunteers (until 7:20p)', 'Kirby', '', 'Sponsor logos on screen'],
      ['2026-09-03T19:20', 'HOST: Kirby introduces judges', 'Kirby', '', 'Judge bios & photos on screen'],
      ['2026-09-03T19:30', 'HOST: Kirby welcomes contestants - one by one on stage', 'Kirby', '', 'Reads bios, brief chat'],
      ['2026-09-03T19:45', 'HOST: Number Draw', 'Kirby', '', ''],
      ['2026-09-03T20:00', 'LOAD IN: Unload bar supplies', '', 'Vidal CoLab', ''],
      ['2026-09-03T20:00', 'CALL: 2 Volunteers - Registration Table (8:00-10:30p)', '', 'Precinct', ''],
      ['2026-09-03T20:00', 'CALL: 5 Volunteers - General Crew / Break down (8:00-11:00p)', '', 'Precinct', ''],
      ['2026-09-03T20:00', 'DEMOS: Contestant demos; chip voting starts (until 8:40p)', '', 'Precinct Dance Floor', ''],
      ['2026-09-03T20:40', 'HOST: Chip voting / Judges select Player of the Day (until 8:45p)', 'Kirby', '', ''],
      ['2026-09-03T20:45', 'PROGRAM ENDS: Chip voting ends / Kirby announces Player of the Day / invites audience to Friday’s Primer Impacto / stay for VPL', 'Kirby', '', ''],
      ['2026-09-03T21:00', 'VPL Begins / Contestants break down their demos', '', '', ''],
      ['2026-09-04T02:00', 'VPL Ends - Load Out', '', '', 'END OF THURSDAY'],
    ],
  },
  {
    event: 'Primer Impacto',
    venue: 'Vidal CoLab',
    items: [
      ['2026-09-04T12:00', 'CALL: Tech Crew / Doors Open', '', '', ''],
      ['2026-09-04T13:00', 'CALL: 2 Volunteers - Tech Setup', '', '', ''],
      ['2026-09-04T13:00', 'TECH SETUP: Audio, lighting, projectors, DJ, etc. (until 4:00p)', '', '', ''],
      ['2026-09-04T15:00', 'CALL: 11 Volunteers - Vidal CoLab Setup', '', '', ''],
      ['2026-09-04T15:00', 'SETUP: Vidal CoLab - stage, pipe & drape, fencing, bar, restrooms, registration (until 6:00p)', '', '', ''],
      ['2026-09-04T16:00', 'CALL: 2 Volunteers - Bar Setup', '', '', ''],
      ['2026-09-04T16:00', 'SETUP: Bar setup, then assist bar staff as needed (until 8:00p)', '', '', ''],
      ['2026-09-04T18:00', 'CALL: 9 Volunteers - Vidal CoLab Setup', '', '', ''],
      ['2026-09-04T18:00', 'SETUP: Vidal CoLab Setup continues (until 9:00p)', '', '', ''],
      ['2026-09-04T18:30', 'CALL: Spike (Host) + 5 Contestants', 'Spike', '', ''],
      ['2026-09-04T19:00', 'REHEARSAL (until 7:55p)', 'Spike', '', ''],
      ['2026-09-04T19:50', 'CALL: Volunteers', '', '', ''],
      ['2026-09-04T20:00', 'CALL: 2 Volunteers - Registration Table (8:00-11:00p)', '', '', ''],
      ['2026-09-04T20:00', 'CALL: 3 Volunteers - Floaters (8:00-11:00p)', '', '', ''],
      ['2026-09-04T20:00', 'CALL: 2 Volunteers - Clothes Check (8:00-11:00p)', '', '', ''],
      ['2026-09-04T20:00', 'CALL: 2 Volunteers - Bar Assistants (8:00p-12:00a)', '', '', ''],
      ['2026-09-04T20:00', 'DOORS OPEN', '', '', 'Music starts, Avatar Demos'],
      ['2026-09-04T21:00', 'PROGRAM START: Spike to stage', 'Spike', '', 'Encuerado Weekend video plays'],
      ['2026-09-04T21:05', 'OPENING: Spike Opening Number (until 9:15p)', 'Spike', '', ''],
      ['2026-09-04T21:15', 'OPENING: Spike welcome / thanks sponsors & volunteers (until 9:30p)', 'Spike', '', 'Sponsor logos on screen'],
      ['2026-09-04T21:30', 'SCORING: Spike explains scoring system', 'Spike', '', ''],
      ['2026-09-04T21:35', 'JUDGES: Spike intros judges on stages A and B simultaneously (until 9:40p)', 'Spike', '', 'Judge photos/bios on screen'],
      ['2026-09-04T21:40', 'DEMO #1: Spike intros Contestant #1 / questions / demo (until 10:00p)', 'Spike', '', ''],
      ['2026-09-04T22:00', 'RESET (until 10:05p)', '', '', ''],
      ['2026-09-04T22:05', 'DEMO #2: Spike intros Contestant #2 / questions / demo (until 10:25p)', 'Spike', '', ''],
      ['2026-09-04T22:25', 'RESET (until 10:30p)', '', '', ''],
      ['2026-09-04T22:30', 'GAP IN DRAFT: demos #3, #4 and #5 are not in the schedule document - 10:30p to 11:40p is unaccounted for', '', '', 'CONFIRM WITH PRODUCTION'],
      ['2026-09-04T23:40', 'VOTING: Spike invites everyone to vote / chip voting starts / judges select Player of the Day', 'Spike', '', ''],
      ['2026-09-05T00:00', 'RESULTS: Spike announces Player of the Day / goodbyes', 'Spike', '', 'DJ set starts'],
      ['2026-09-05T00:00', 'DJ SET (until 3:00a)', '', '', ''],
      ['2026-09-05T03:00', 'EVENT ENDS', '', '', ''],
      ['2026-09-05T03:00', 'LOAD OUT (until 4:00a)', '', '', 'END OF FRIDAY'],
    ],
  },
  {
    event: 'Aguas Frescas Wet Play Party',
    venue: 'Rough Trade Gear LA',
    items: [
      ['2026-09-05T10:00', 'CALL: 8 Judges + 5 Contestants', '', 'Rough Trade', ''],
      ['2026-09-05T10:00', 'INTERVIEWS: Contestant interviews by the judges (until 12:00p)', '', '', ''],
      ['2026-09-05T11:00', 'CALL: Crew, staff', '', 'Rough Trade', ''],
      ['2026-09-05T12:00', 'CALL: 6 Volunteers - General Setup', '', '', ''],
      ['2026-09-05T12:00', 'SETUP: Aguas Frescas setup - general assistance (until 3:00p)', '', '', ''],
      ['2026-09-05T12:30', 'CALL: Pelon (Host) + 5 Contestants', 'Pelon', '', ''],
      ['2026-09-05T13:00', 'REHEARSAL: Rehearsal with contestants (until 1:30p)', 'Pelon', '', ''],
      ['2026-09-05T13:30', 'CALL: 2 Volunteers - Drink Service (1:30-4:30p)', '', '', ''],
      ['2026-09-05T13:30', 'CALL: 2 Volunteers - Clothes Check (1:30-4:30p)', '', '', ''],
      ['2026-09-05T14:00', 'CALL: 2 Volunteers - Registration Table (2:00-5:00p)', '', '', ''],
      ['2026-09-05T14:00', 'DOORS OPEN', '', '', 'DJ plays'],
      ['2026-09-05T15:00', 'OPENING: Pelon Opening Number (until 3:10p)', 'Pelon', '', ''],
      ['2026-09-05T15:10', 'INTROS: Pelon welcome / thanks sponsors & volunteers / presents contestants / explains piss contest (until 3:20p)', 'Pelon', '', ''],
      ['2026-09-05T15:20', 'PROGRAM: Piss Collection Contest - ONGOING (until 4:45p)', '', '', ''],
      ['2026-09-05T15:30', 'CONTEST: Piss Volume Competition (until 4:00p)', '', '', ''],
      ['2026-09-05T16:00', 'CONTEST: Piss Distance Competition (until 4:30p)', '', '', ''],
      ['2026-09-05T16:00', 'CALL: 2 Volunteers - Drink Service (4:00-7:00p)', '', '', ''],
      ['2026-09-05T16:00', 'CALL: 2 Volunteers - Clothes Check (4:00-7:00p)', '', '', ''],
      ['2026-09-05T16:30', 'CONTEST: Piss Height Competition (until 4:45p)', '', '', ''],
      ['2026-09-05T16:45', 'JUDGING: Pelon introduces judges', 'Pelon', '', 'Final piss counting & splash'],
      ['2026-09-05T17:00', 'PROGRAM END: Pelon says goodbyes', 'Pelon', '', ''],
      ['2026-09-05T17:00', 'CALL: 2 Volunteers - Break Down (5:00-8:00p)', '', '', ''],
      ['2026-09-05T18:00', 'PARTY ENDS', '', '', ''],
      ['2026-09-05T18:00', 'BREAK DOWN (until 8:00p)', '', '', 'END OF SATURDAY'],
    ],
  },
  {
    event: 'Mr Cuero Contest & After Party',
    venue: 'Vidal CoLab',
    items: [
      ['2026-09-06T17:00', 'CALL: Tech Crew / Doors Open', '', 'Vidal CoLab', ''],
      ['2026-09-06T17:00', 'CALL: 2 Volunteers - Tech Setup', '', '', ''],
      ['2026-09-06T17:00', 'CALL: 9 Volunteers - Vidal CoLab Setup', '', '', ''],
      ['2026-09-06T17:00', 'TECH SETUP: Audio, lighting, projectors, DJ / VIDAL COLAB SETUP: general setup of event space (until 8:00p)', '', '', ''],
      ['2026-09-06T18:30', 'CALL: 2 Hosts - Kirby & Pelon + 5 Contestants', 'Kirby & Pelon', '', ''],
      ['2026-09-06T19:00', 'REHEARSAL (until 7:45p)', 'Kirby & Pelon', '', ''],
      ['2026-09-06T19:00', 'CALL: 1 Volunteer - Bar Assistant (7:00-11:00p)', '', '', ''],
      ['2026-09-06T20:00', 'CALL: 3 Volunteers - Clothes Check (8:00-11:00p)', '', '', ''],
      ['2026-09-06T20:00', 'CALL: 5 Volunteers - Floaters (8:00-11:00p)', '', '', ''],
      ['2026-09-06T20:00', 'CALL: 3 Volunteers - Registration Table (8:00-11:00p)', '', '', ''],
      ['2026-09-06T20:00', 'DOORS OPEN', '', '', 'Music; Avatar Demos; bar open'],
      ['2026-09-06T20:30', 'CALL: 1 Volunteer - Bar Assistant (8:30p-12:30a)', '', '', ''],
      ['2026-09-06T21:00', 'CALL: 1 Volunteer - Bar Assistant (9:00p-1:00a)', '', '', ''],
      ['2026-09-06T21:00', 'START: Encuerado LFW video plays', '', '', 'ENCUERADO LFW VIDEO'],
      ['2026-09-06T21:05', 'OPENING: Kirby & Pelon Opening Number (until 9:15p)', 'Kirby & Pelon', '', ''],
      ['2026-09-06T21:15', 'INTROS: Hosts welcome audience; thank sponsors and volunteers (until 9:30p)', 'Kirby & Pelon', '', 'SPONSOR LOGOS ON SCREEN'],
      ['2026-09-06T21:30', 'SCORING: Hosts explain scoring system', 'Kirby & Pelon', '', ''],
      ['2026-09-06T21:35', 'JUDGES: Hosts intro judges on stage', 'Kirby & Pelon', '', 'JUDGE BIOS/PHOTOS ON SCREEN'],
      ['2026-09-06T21:40', 'DEMO #1: Hosts intro Contestant #1; questions; demo (until 10:00p)', 'Kirby & Pelon', 'STAGE A', ''],
      ['2026-09-06T22:00', 'RESET (until 10:05p)', '', '', ''],
      ['2026-09-06T22:05', 'DEMO #2: Hosts intro Contestant #2; questions; demo (until 10:25p)', 'Kirby & Pelon', 'STAGE B', ''],
      ['2026-09-06T22:25', 'RESET (until 10:30p)', '', '', ''],
      ['2026-09-06T22:30', 'DEMO #3: Hosts intro Contestant #3; questions; demo (until 10:50p)', 'Kirby & Pelon', 'STAGE A', ''],
      ['2026-09-06T22:50', 'RESET (until 10:55p)', '', '', ''],
      ['2026-09-06T22:55', 'DEMO #4: Hosts intro Contestant #4; questions; demo (until 11:15p)', 'Kirby & Pelon', 'STAGE B', ''],
      ['2026-09-06T23:15', 'RESET (until 11:20p)', '', '', ''],
      ['2026-09-06T23:20', 'DEMO #5: Hosts intro Contestant #5; questions; demo (until 11:40p) - END OF DEMOS', 'Kirby & Pelon', 'STAGE A', ''],
      ['2026-09-06T23:40', 'POD: Kirby announces Player of the Day (until 12:00a)', 'Kirby', 'STAGE A', 'Draft says "and to do a ___" - CONFIRM WHAT ELSE HAPPENS HERE'],
      ['2026-09-07T00:00', 'PASS THE CROWN: Pelon brings Albert to stage for step down speech (until 12:15a)', 'Pelon', 'STAGE B', ''],
      ['2026-09-07T00:15', 'GROUP PHOTO: Kirby & Pelon bring Albert and all contestants to stage (until 12:30a)', 'Kirby & Pelon', 'STAGE A', ''],
      ['2026-09-07T00:30', 'WINNER: Hosts & Albert announce winners and deliver medallions', 'Kirby & Pelon', '', ''],
      ['2026-09-07T00:45', 'PHOTOS: Spiderweb and pictures on the patio', '', 'Patio', ''],
      ['2026-09-07T00:45', 'PARTY CONTINUES (until 3:00a)', '', '', ''],
      ['2026-09-07T03:00', 'EVENT ENDS / TAKE DOWN (until 4:00a)', '', '', 'END OF ENCUERADO 2026'],
    ],
  },
]

const norm = (v) => String(v || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

try {
  const events = await prisma.event.findMany({ select: { id: true, title: true } })
  let totalWrite = 0

  for (const sheet of SHEETS) {
    const match = events.find((e) => norm(e.title) === norm(sheet.event))
    if (!match) {
      console.log(`  *** NO EVENT MATCHED "${sheet.event}" - skipping ***`)
      continue
    }
    const existing = await prisma.eventRunSheetItem.count({ where: { eventId: match.id } })
    console.log(`\n  ${match.title}`)
    console.log(`      existing run sheet items : ${existing}${existing && APPLY ? '  (will be DELETED)' : ''}`)
    console.log(`      items to write           : ${sheet.items.length}`)
    if (!APPLY) {
      for (const [t, title] of sheet.items.slice(0, 4)) {
        console.log(`         ${t.slice(11)}  ${title.slice(0, 68)}`)
      }
      console.log(`         ... and ${sheet.items.length - 4} more`)
    } else {
      await prisma.eventRunSheetItem.deleteMany({ where: { eventId: match.id } })
      let order = 0
      for (const [time, title, owner, location, notes] of sheet.items) {
        await prisma.eventRunSheetItem.create({
          data: {
            eventId: match.id,
            sortOrder: order++,
            time: at(time),
            title,
            owner: owner || null,
            location: location || sheet.venue,
            notes: notes || null,
            status: 'NOT_STARTED',
          },
        })
      }
    }
    totalWrite += sheet.items.length
  }

  console.log('')
  if (!APPLY) {
    console.log(`  DRY RUN - nothing changed. ${totalWrite} item(s) would be written.`)
    console.log('  Re-run with --apply to replace the run sheets:\n')
    console.log('      node import-run-sheets.mjs --apply\n')
  } else {
    console.log(`  Done. ${totalWrite} run sheet item(s) written across ${SHEETS.length} events.\n`)
  }
} catch (e) {
  console.error('\n  ERROR:', e.message.split('\n').slice(0, 6).join('\n  '))
} finally { await prisma.$disconnect() }
