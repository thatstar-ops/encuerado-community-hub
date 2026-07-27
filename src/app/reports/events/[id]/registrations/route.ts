import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function formatDate(value: Date | null) {
  if (!value) return ''
  return value.toISOString()
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  }
) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const event = await prisma.event.findUnique({
    where: {
      id,
    },
    include: {
      registrations: {
        include: {
          member: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  })

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const headers = [
    'Event',
    'Event Starts At',
    'Attendee First Name',
    'Attendee Last Name',
    'Preferred Name',
    'Email',
    'Phone',
    'City',
    'State',
    'Registration Status',
    'Checked In',
    'Notes',
    'Registration Created At',
    'Registration Updated At',
  ]

  const rows = event.registrations.map((registration) => [
    event.title,
    formatDate(event.startsAt),
    registration.member.firstName,
    registration.member.lastName,
    registration.member.preferredName || '',
    registration.member.email,
    registration.member.phone || '',
    registration.member.city || '',
    registration.member.state || '',
    registration.status,
    registration.checkedIn ? 'Yes' : 'No',
    registration.notes || '',
    formatDate(registration.createdAt),
    formatDate(registration.updatedAt),
  ])

  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n')

  const safeTitle = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle || 'event'}-attendee-report.csv"`,
    },
  })
}