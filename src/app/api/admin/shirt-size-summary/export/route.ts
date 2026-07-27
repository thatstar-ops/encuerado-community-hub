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

  const sizes = await prisma.volunteerProfile.groupBy({
    by: ['shirtSize'],
    _count: {
      shirtSize: true,
    },
    where: {
      shirtSize: { not: null },
    },
  })

  const totalWithShirtSize = sizes.reduce((acc, s) => acc + s._count.shirtSize, 0)
  const totalVolunteers = await prisma.volunteerProfile.count()
  const noShirtSize = totalVolunteers - totalWithShirtSize

  const headers = ['Shirt Size', 'Count']
  const rows = sizes.map((s) => [
    escapeCsv(s.shirtSize),
    escapeCsv(s._count.shirtSize),
  ])

  if (noShirtSize > 0) {
    rows.push(['(blank / not set)', escapeCsv(noShirtSize)])
  }

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=shirt-size-summary.csv',
    },
  })
}
