import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  await requireSuperAdmin()

  const members = await prisma.member.findMany({
    include: {
      participationRecords: true,
      registrations: true,
      externalContactLists: { include: { externalContactList: true } },
    },
    orderBy: { lastName: 'asc' },
  })

  const headers = [
    'Name',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Address Line 1',
    'City',
    'State',
    'Postal Code',
    'Country',
    'Attendee Years',
    'Volunteer Years',
    'Has Event Registration',
    'External Contact Lists',
    'Source/List Labels',
    'Promotional Email Opt Out',
    'Archived',
    'Created At',
    'Updated At',
  ].join(',')

  const rows = members.map((m) => {
    const attendeeYears = m.participationRecords
      .filter((p) => p.type === 'ATTENDEE')
      .map((p) => p.year)
      .sort((a, b) => b - a)
    const volunteerYears = m.participationRecords
      .filter((p) => p.type === 'VOLUNTEER')
      .map((p) => p.year)
      .sort((a, b) => b - a)
    const hasEventRegistration = m.registrations.length > 0 ? 'Yes' : 'No'
    const externalContactLists = m.externalContactLists
      .map((clm) => clm.externalContactList.label)
      .join(', ')
    const sourceLabels = [...new Set(m.externalContactLists.map((clm) => clm.sourceLabel).filter(Boolean))].join(', ')
    const optOut = m.promotionalEmailOptOut ? 'Yes' : 'No'
    const archived = m.archivedAt ? 'Yes' : 'No'

    const rawRow = [
      `${m.preferredName || m.firstName} ${m.lastName}`.trim(),
      m.firstName,
      m.lastName,
      m.email,
      m.phone,
      m.addressLine1,
      m.city,
      m.state,
      m.postalCode,
      m.country,
      attendeeYears.join(', '),
      volunteerYears.join(', '),
      hasEventRegistration,
      externalContactLists,
      sourceLabels,
      optOut,
      archived,
      m.createdAt.toISOString(),
      m.updatedAt.toISOString(),
    ]

    return rawRow.map(escapeCsv).join(',')
  })

  const csv = [headers, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=encuerado-full-contacts.csv',
    },
  })
}
