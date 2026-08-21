import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { prisma } from './prisma'
import { EVENT_TIME_ZONE, getEventDateKey } from './timezone'

// Encuerado brand colors (matches the admin UI). White page background is
// intentional even though the site/app uses a black theme - this document
// is meant to be printed and read on paper on-site.
const BRAND_RED = 'B11218'
const BRAND_BLACK = '111111'
const BRAND_GRAY = '555555'
const BORDER_GRAY = 'CCCCCC'

// Same wordmark used in campaign emails (src/lib/campaign-content.ts). Kept
// as a separate constant here rather than importing, since campaign-content
// is about email rendering and this is a completely different document
// pipeline - but if the brand asset URL ever changes, update both places.
const WORDMARK_URL =
  'https://f5612f3afb86ee00d6f9.cdn6.editmysite.com/uploads/b/f5612f3afb86ee00d6f94e869f6b02c5f39acd4f31bc0bfc033376e5652146dd/encuerado%20latin%20fetish%20weekend_1751482069.png?width=2400&optimize=medium'

// The actual pixel dimensions of the hosted wordmark aren't known at build
// time (this sandbox can't reach the CDN to check). This is a reasonable
// banner-logo guess (roughly 3.4:1) - if the printed cover looks stretched
// or squashed once you generate a real one, adjust WORDMARK_WIDTH_PT /
// WORDMARK_HEIGHT_PT to match the real aspect ratio and it's fixed
// everywhere this module is used.
const WORDMARK_WIDTH_PT = 460
const WORDMARK_HEIGHT_PT = 135

const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed']

export type VolunteerBibleScope =
  | { mode: 'year'; year: number }
  | { mode: 'event'; eventId: string }

type ShiftRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  neededCount: number
  event: { title: string }
  role: { title: string; description: string } | null
  assignments: {
    member: {
      firstName: string
      lastName: string
      preferredName: string | null
      phone: string | null
      email: string
      archivedAt: Date | null
    }
  }[]
}

/** Years and events available to pick from on the export form. */
export async function getVolunteerBibleFilterOptions() {
  const [shiftDates, events] = await Promise.all([
    prisma.volunteerShift.findMany({
      where: { archivedAt: null, cancelledAt: null },
      select: { startsAt: true },
    }),
    prisma.event.findMany({
      where: { archivedAt: null },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
    }),
  ])

  const years = [...new Set(shiftDates.map((s) => Number(getEventDateKey(s.startsAt).slice(0, 4))))].sort(
    (a, b) => b - a
  )

  return { years, events }
}

async function fetchShifts(scope: VolunteerBibleScope): Promise<ShiftRow[]> {
  const where =
    scope.mode === 'event'
      ? { eventId: scope.eventId, archivedAt: null, cancelledAt: null }
      : { archivedAt: null, cancelledAt: null }

  const shifts = await prisma.volunteerShift.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
      endsAt: true,
      neededCount: true,
      event: { select: { title: true } },
      role: { select: { title: true, description: true } },
      assignments: {
        where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
        select: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              preferredName: true,
              phone: true,
              email: true,
              archivedAt: true,
            },
          },
        },
      },
    },
    orderBy: { startsAt: 'asc' },
  })

  if (scope.mode === 'event') return shifts

  // Year filtering happens in LA wall-clock time (not UTC), same rule used
  // everywhere else in the app that filters by "which year is this" -
  // matters for shifts near a year boundary.
  return shifts.filter((shift) => getEventDateKey(shift.startsAt).startsWith(String(scope.year)))
}

function volunteerDisplayName(member: { firstName: string; lastName: string; preferredName: string | null }) {
  return `${member.preferredName || member.firstName} ${member.lastName}`.trim()
}

function formatDayHeading(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatTimeRange(startsAt: Date, endsAt: Date | null) {
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  })
  const start = timeFormatter.format(startsAt)
  if (!endsAt) return start
  return `${start} – ${timeFormatter.format(endsAt)}`
}

function heading(
  text: string,
  level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2,
  color = BRAND_BLACK
) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, color, bold: true })],
  })
}

function bodyParagraph(text: string, options: { italics?: boolean; bold?: boolean; color?: string } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        italics: options.italics,
        bold: options.bold,
        color: options.color || BRAND_BLACK,
      }),
    ],
  })
}

function shiftEntry(shift: ShiftRow) {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GRAY, space: 8 } },
      children: [
        new TextRun({
          text: `${formatTimeRange(shift.startsAt, shift.endsAt)}  ·  ${shift.event.title}`,
          bold: true,
          color: BRAND_RED,
        }),
      ],
    })
  )

  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: shift.title, bold: true, size: 26, color: BRAND_BLACK })],
    })
  )

  if (shift.role) {
    children.push(bodyParagraph(shift.role.title, { bold: true, color: BRAND_GRAY }))
    children.push(bodyParagraph(shift.role.description))
  }

  if (shift.description) {
    children.push(bodyParagraph(`Notes: ${shift.description}`, { italics: true, color: BRAND_GRAY }))
  }

  children.push(
    bodyParagraph(`Location: ${shift.location || 'See event details'}`, { color: BRAND_GRAY })
  )

  const activeVolunteers = shift.assignments.filter((a) => !a.member.archivedAt)

  if (activeVolunteers.length === 0) {
    children.push(bodyParagraph(`Volunteers needed: ${shift.neededCount} — none assigned yet`, { color: BRAND_RED }))
  } else {
    children.push(
      bodyParagraph(
        `Volunteers (${activeVolunteers.length}/${shift.neededCount}):`,
        { bold: true }
      )
    )
    for (const assignment of activeVolunteers) {
      const { member } = assignment
      const phoneSuffix = member.phone ? ` — ${member.phone}` : ''
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [new TextRun({ text: `${volunteerDisplayName(member)}${phoneSuffix}` })],
        })
      )
    }
  }

  return children
}

function roleDirectorySection(shifts: ShiftRow[]) {
  const rolesByTitle = new Map<string, string>()
  for (const shift of shifts) {
    if (shift.role && !rolesByTitle.has(shift.role.title)) {
      rolesByTitle.set(shift.role.title, shift.role.description)
    }
  }

  const sortedTitles = [...rolesByTitle.keys()].sort((a, b) => a.localeCompare(b))

  const children: Paragraph[] = [heading('Appendix A: Role Directory', HeadingLevel.HEADING_1, BRAND_RED)]

  if (sortedTitles.length === 0) {
    children.push(bodyParagraph('No shifts in this book have a role assigned.'))
    return children
  }

  for (const title of sortedTitles) {
    children.push(heading(title, HeadingLevel.HEADING_2))
    children.push(bodyParagraph(rolesByTitle.get(title) || ''))
  }

  return children
}

function volunteerRosterSection(shifts: ShiftRow[]) {
  type RosterEntry = {
    name: string
    phone: string
    shiftLabels: string[]
  }

  const byEmail = new Map<string, RosterEntry>()

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      const { member } = assignment
      if (member.archivedAt) continue

      const key = member.email.toLowerCase()
      const label = `${formatDayHeading(getEventDateKey(shift.startsAt)).split(',').slice(0, 2).join(',')} · ${formatTimeRange(
        shift.startsAt,
        shift.endsAt
      )} · ${shift.title}`

      if (!byEmail.has(key)) {
        byEmail.set(key, {
          name: volunteerDisplayName(member),
          phone: member.phone || '—',
          shiftLabels: [label],
        })
      } else {
        byEmail.get(key)!.shiftLabels.push(label)
      }
    }
  }

  const roster = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name))

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      tableHeaderCell('Volunteer'),
      tableHeaderCell('Phone'),
      tableHeaderCell('Shifts'),
    ],
  })

  const rows = roster.map(
    (entry) =>
      new TableRow({
        children: [
          tableCell(entry.name),
          tableCell(entry.phone),
          tableCell(entry.shiftLabels.join('\n')),
        ],
      })
  )

  const children: (Paragraph | Table)[] = [
    heading('Appendix B: Volunteer Roster (Alphabetical)', HeadingLevel.HEADING_1, BRAND_RED),
  ]

  if (roster.length === 0) {
    children.push(bodyParagraph('No volunteers are assigned to any shift in this book yet.'))
    return children
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...rows],
    })
  )

  return children
}

function tableHeaderCell(text: string) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: BRAND_RED },
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF' })] })],
  })
}

function tableCell(text: string) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: text
      .split('\n')
      .map((line) => new Paragraph({ children: [new TextRun({ text: line, color: BRAND_BLACK })] })),
  })
}

async function fetchWordmarkImage(): Promise<Buffer | null> {
  try {
    const response = await fetch(WORDMARK_URL)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    // A missing logo shouldn't block generating the book - the cover page
    // just renders with the text title only.
    return null
  }
}

function scopeLabel(scope: VolunteerBibleScope, eventTitle?: string) {
  if (scope.mode === 'event') return eventTitle || 'Selected Event'
  return `${scope.year} — All Events`
}

export async function buildVolunteerBibleDocx(scope: VolunteerBibleScope): Promise<{
  buffer: Buffer
  filename: string
}> {
  const shifts = await fetchShifts(scope)

  const eventTitle =
    scope.mode === 'event' ? shifts[0]?.event.title || (await prisma.event.findUnique({ where: { id: scope.eventId }, select: { title: true } }))?.title : undefined

  const label = scopeLabel(scope, eventTitle)
  const wordmark = await fetchWordmarkImage()

  const byDay = new Map<string, ShiftRow[]>()
  for (const shift of shifts) {
    const key = getEventDateKey(shift.startsAt)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(shift)
  }
  const sortedDayKeys = [...byDay.keys()].sort()

  const coverChildren: Paragraph[] = []

  if (wordmark) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 400 },
        children: [
          new ImageRun({
            data: wordmark,
            type: 'png',
            transformation: { width: WORDMARK_WIDTH_PT, height: WORDMARK_HEIGHT_PT },
          }),
        ],
      })
    )
  }

  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: wordmark ? 200 : 1200, after: 100 },
      children: [new TextRun({ text: 'VOLUNTEER BIBLE', bold: true, size: 64, color: BRAND_RED })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: label, size: 32, color: BRAND_BLACK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Generated ${new Intl.DateTimeFormat('en-US', {
            timeZone: EVENT_TIME_ZONE,
            dateStyle: 'long',
            timeStyle: 'short',
          }).format(new Date())} (America/Los_Angeles)`,
          size: 20,
          color: BRAND_GRAY,
        }),
      ],
    }),
    new Paragraph({ children: [], pageBreakBefore: true })
  )

  const tocChildren: (Paragraph | TableOfContents)[] = [
    heading('Table of Contents', HeadingLevel.HEADING_1, BRAND_RED),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Right-click and choose "Update Field" (or press F9 after Ctrl+A) before printing to fill in page numbers.',
          italics: true,
          color: BRAND_GRAY,
          size: 18,
        }),
      ],
    }),
    new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ children: [], pageBreakBefore: true }),
  ]

  const dayChildren: (Paragraph | Table)[] = []
  for (const dayKey of sortedDayKeys) {
    dayChildren.push(heading(formatDayHeading(dayKey), HeadingLevel.HEADING_1, BRAND_RED))
    const dayShifts = byDay.get(dayKey)!.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    for (const shift of dayShifts) {
      dayChildren.push(...shiftEntry(shift))
    }
  }

  if (sortedDayKeys.length === 0) {
    dayChildren.push(bodyParagraph('No active shifts found for this selection.'))
  }

  const appendixChildren: (Paragraph | Table)[] = [
    new Paragraph({ children: [], pageBreakBefore: true }),
    ...roleDirectorySection(shifts),
    new Paragraph({ children: [], pageBreakBefore: true }),
    ...volunteerRosterSection(shifts),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: BRAND_BLACK } },
      },
    },
    sections: [
      {
        properties: {},
        children: [...coverChildren, ...tocChildren, ...dayChildren, ...appendixChildren],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)

  const safeLabel = label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const filename = `encuerado-volunteer-bible-${safeLabel || 'export'}.docx`

  return { buffer, filename }
}
