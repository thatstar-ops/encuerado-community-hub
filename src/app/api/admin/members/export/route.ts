import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  await requireSuperAdmin()

  const members = await prisma.member.findMany({
    orderBy: { lastName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      firstYearAttended: true,
      notes: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const headers = [
    'ID',
    'First Name',
    'Last Name',
    'Preferred Name',
    'Email',
    'Phone',
    'City',
    'State',
    'Country',
    'Postal Code',
    'First Year Attended',
    'Notes',
    'Archived At',
    'Created At',
    'Updated At',
  ]

  const rows = members.map((m) => [
    escapeCsv(m.id),
    escapeCsv(m.firstName),
    escapeCsv(m.lastName),
    escapeCsv(m.preferredName),
    escapeCsv(m.email),
    escapeCsv(m.phone),
    escapeCsv(m.city),
    escapeCsv(m.state),
    escapeCsv(m.country),
    escapeCsv(m.postalCode),
    escapeCsv(m.firstYearAttended),
    escapeCsv(m.notes),
    escapeCsv(m.archivedAt ? m.archivedAt.toISOString() : ''),
    escapeCsv(m.createdAt.toISOString()),
    escapeCsv(m.updatedAt.toISOString()),
  ])

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=attendees.csv',
    },
  })
}
