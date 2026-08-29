import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

// Two views of the same data, chosen with ?view=
//   shift      one row per assignment, ordered by shift start time. The
//              run-of-show sheet: who is where, when. Unfilled shifts still
//              appear so gaps are visible.
//   volunteer  one row per person with all their shifts on that row. The
//              sheet for talking to individual volunteers.
const EVENT_TIME_ZONE = 'America/Los_Angeles'

// Statuses that mean the person is actually expected to turn up.
const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

// A volunteer earns a shirt at this many active shifts.
const MIN_SHIFTS_FOR_SHIRT = 3

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function fmtDateTime(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function fmtTime(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export async function GET(request: NextRequest) {
  await requireSuperAdmin()

  const view = request.nextUrl.searchParams.get('view') === 'volunteer' ? 'volunteer' : 'shift'

  const shifts = await prisma.volunteerShift.findMany({
    where: { archivedAt: null, cancelledAt: null },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      location: true,
      neededCount: true,
      status: true,
      notes: true,
      event: { select: { title: true, location: true } },
      role: { select: { title: true } },
      assignments: {
        select: {
          status: true,
          checkedIn: true,
          shirtGiven: true,
          notes: true,
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              email: true,
              phone: true,
              volunteerProfile: {
                select: {
                  shirtSize: true,
                  emergencyName: true,
                  emergencyPhone: true,
                  preferredRoles: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { startsAt: 'asc' },
  })

  const rows: string[] = []
  let filename = 'volunteer-schedule.csv'

  if (view === 'shift') {
    filename = 'volunteer-schedule-by-time.csv'
    rows.push(
      [
        'Shift Start',
        'Shift End',
        'Event',
        'Shift',
        'Role',
        'Location',
        'Needed',
        'Assigned',
        'Volunteer',
        'Email',
        'Phone',
        'Shirt Size',
        'Assignment Status',
        'Checked In',
        'Shirt Given',
        'Emergency Contact',
        'Shift Notes',
      ].join(',')
    )

    for (const shift of shifts) {
      const active = shift.assignments.filter((a) =>
        ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)
      )
      const location = shift.location || shift.event.location || ''
      const base = [
        fmtDateTime(shift.startsAt),
        fmtTime(shift.endsAt),
        shift.event.title,
        shift.title,
        shift.role?.title || '(no role assigned)',
        location,
        shift.neededCount,
        active.length,
      ]

      if (shift.assignments.length === 0) {
        // Keep empty shifts in the sheet - an unstaffed shift is the single
        // most important thing to see on a run-of-show.
        rows.push(
          [...base, '*** UNFILLED ***', '', '', '', '', '', '', shift.notes || '']
            .map(escapeCsv)
            .join(',')
        )
        continue
      }

      const sorted = [...shift.assignments].sort((a, b) =>
        `${a.member.firstName} ${a.member.lastName}`.localeCompare(
          `${b.member.firstName} ${b.member.lastName}`
        )
      )

      for (const assignment of sorted) {
        const member = assignment.member
        const profile = member.volunteerProfile
        const emergency = [profile?.emergencyName, profile?.emergencyPhone]
          .filter(Boolean)
          .join(' ')
        rows.push(
          [
            ...base,
            `${member.preferredName || member.firstName} ${member.lastName}`,
            member.email,
            member.phone || '',
            profile?.shirtSize || '',
            assignment.status,
            assignment.checkedIn ? 'Yes' : 'No',
            assignment.shirtGiven ? 'Yes' : 'No',
            emergency,
            shift.notes || '',
          ]
            .map(escapeCsv)
            .join(',')
        )
      }
    }

    const unfilled = shifts.filter(
      (s) =>
        s.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)).length <
        s.neededCount
    )
    rows.push('')
    rows.push(
      escapeCsv(
        `${shifts.length} shifts, ${unfilled.length} still short of their needed count.`
      )
    )
  } else {
    filename = 'volunteer-schedule-by-person.csv'

    type Row = {
      name: string
      email: string
      phone: string
      shirtSize: string
      emergency: string
      preferredRoles: string
      shifts: string[]
      activeCount: number
      checkedIn: number
    }

    const byMember = new Map<string, Row>()

    for (const shift of shifts) {
      for (const assignment of shift.assignments) {
        const member = assignment.member
        const profile = member.volunteerProfile
        if (!byMember.has(member.id)) {
          byMember.set(member.id, {
            name: `${member.preferredName || member.firstName} ${member.lastName}`,
            email: member.email,
            phone: member.phone || '',
            shirtSize: profile?.shirtSize || '',
            emergency: [profile?.emergencyName, profile?.emergencyPhone]
              .filter(Boolean)
              .join(' '),
            preferredRoles: profile?.preferredRoles || '',
            shifts: [],
            activeCount: 0,
            checkedIn: 0,
          })
        }
        const row = byMember.get(member.id)!
        const label = `${fmtDateTime(shift.startsAt)}-${fmtTime(shift.endsAt)} ${shift.title} (${shift.event.title})`
        row.shifts.push(
          ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)
            ? label
            : `${label} [${assignment.status}]`
        )
        if (ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)) row.activeCount++
        if (assignment.checkedIn) row.checkedIn++
      }
    }

    const people = [...byMember.values()].sort((a, b) => a.name.localeCompare(b.name))
    const mostShifts = people.reduce((max, p) => Math.max(max, p.shifts.length), 0)

    rows.push(
      [
        'Volunteer',
        'Email',
        'Phone',
        'Shirt Size',
        'Shifts',
        'Earns Shirt',
        'Checked In',
        'Emergency Contact',
        'Preferred Roles',
        ...Array.from({ length: mostShifts }, (_, i) => `Shift ${i + 1}`),
      ].join(',')
    )

    for (const person of people) {
      rows.push(
        [
          person.name,
          person.email,
          person.phone,
          person.shirtSize,
          person.activeCount,
          person.activeCount >= MIN_SHIFTS_FOR_SHIRT ? 'Yes' : 'No',
          `${person.checkedIn} of ${person.shifts.length}`,
          person.emergency,
          person.preferredRoles,
          ...person.shifts,
          ...Array.from({ length: mostShifts - person.shifts.length }, () => ''),
        ]
          .map(escapeCsv)
          .join(',')
      )
    }

    const earning = people.filter((p) => p.activeCount >= MIN_SHIFTS_FOR_SHIRT).length
    rows.push('')
    rows.push(
      escapeCsv(
        `${people.length} volunteers with at least one shift. ${earning} have ${MIN_SHIFTS_FOR_SHIRT}+ shifts and earn a shirt.`
      )
    )
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=${filename}`,
    },
  })
}
