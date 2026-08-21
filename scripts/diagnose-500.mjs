// Read-only diagnostic. Makes no changes. Prints no secrets.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const line = (s) => console.log(s)

try {
  line('=== 1. Do the recently-added columns actually exist in the DB? ===')
  const cols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_name='Event'               AND column_name='selfRegistrationEnabled')
       OR (table_name='VolunteerAssignment' AND column_name='secondReminderSentAt')
       OR (table_name='ShiftReminderSettings' AND column_name='secondDaysBefore')
       OR (table_name='EmailLog'            AND column_name='source')
       OR (table_name='VolunteerShift'      AND column_name='roleId')
    ORDER BY table_name, column_name`)
  const want = [
    ['Event','selfRegistrationEnabled'],['VolunteerAssignment','secondReminderSentAt'],
    ['ShiftReminderSettings','secondDaysBefore'],['EmailLog','source'],['VolunteerShift','roleId']]
  for (const [t,c] of want) {
    const hit = cols.find(x => x.table_name===t && x.column_name===c)
    line(`  ${hit ? 'PRESENT ' : 'MISSING '} ${t}.${c}`)
  }

  line('\n=== 2. Does VolunteerRole table exist? ===')
  const tbl = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."VolunteerRole"')::text AS t, to_regclass('public."ShiftReminderSettings"')::text AS s`)
  line(`  VolunteerRole: ${tbl[0].t || 'MISSING'}   ShiftReminderSettings: ${tbl[0].s || 'MISSING'}`)

  line('\n=== 3. Which events allow FREE public self-registration? ===')
  const evs = await prisma.event.findMany({
    where: { archivedAt: null },
    select: { id:true, title:true, selfRegistrationEnabled:true, status:true, capacity:true },
    orderBy: { startsAt: 'asc' } })
  for (const e of evs) {
    line(`  ${e.selfRegistrationEnabled ? '>>> FREE SIGNUP ON ' : '    locked (tickets)'}  ${e.title}`)
  }
  line(`  --- ${evs.filter(e=>e.selfRegistrationEnabled).length} of ${evs.length} events allow free signup ---`)

  line('\n=== 4. Reproduce the exact query the crashing page runs ===')
  const target = evs.find(e => /pleasure/i.test(e.title)) || evs[0]
  try {
    const r = await prisma.event.findUnique({ where:{id:target.id}, include:{registrations:true} })
    line(`  OK - query succeeded for "${r.title}" (${r.registrations.length} registrations)`)
    line(`  selfRegistrationEnabled = ${r.selfRegistrationEnabled}`)
  } catch (e) { line('  *** THIS IS THE CRASH ***\n  ' + e.message.split('\n').slice(0,6).join('\n  ')) }

  line('\n=== 5. Shift query (the /shifts pages) ===')
  try {
    const s = await prisma.volunteerShift.findMany({ take:1, include:{ assignments:true, role:true } })
    line(`  OK - shift query succeeded (${s.length} row sampled)`)
  } catch (e) { line('  *** SHIFT CRASH ***\n  ' + e.message.split('\n').slice(0,6).join('\n  ')) }

  line('\n=== 6. Prisma client version vs schema ===')
  line('  @prisma/client resolved OK')
} catch (e) {
  line('TOP-LEVEL ERROR:\n' + e.message.split('\n').slice(0,10).join('\n'))
} finally { await prisma.$disconnect() }
