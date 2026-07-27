import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  await requireSuperAdmin()

  const statusParam = request.nextUrl.searchParams.get('status') || 'active'
  const statusFilter = ['active', 'archived', 'all'].includes(statusParam)
    ? statusParam
    : 'active'
  const where: Prisma.VolunteerProfileWhereInput =
    statusFilter === 'all'
      ? {}
      : statusFilter === 'archived'
        ? {
            OR: [
              { archivedAt: { not: null } },
              { member: { is: { archivedAt: { not: null } } } },
            ],
          }
        : {
            archivedAt: null,
            member: { is: { archivedAt: null } },
          }

  const profiles = await prisma.volunteerProfile.findMany({
    where,
    include: {
      member: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Build CSV rows
  const rows = [
    ['Name', 'Email', 'Phone', 'Status', 'Preferred Roles', 'Availability', 'Emergency Contact', 'Consent', 'Notes'],
    ...profiles.map((p) => [
      `${p.member.firstName} ${p.member.lastName}`,
      p.member.email,
      p.member.phone || '',
      p.status,
      p.preferredRoles || '',
      p.availability || '',
      p.emergencyName && p.emergencyPhone ? `${p.emergencyName} (${p.emergencyPhone})` : '',
      p.consentToContact ? 'Yes' : 'No',
      p.notes || '',
    ]),
  ]

  const csv = rows.map((row) => row.join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=volunteers.csv',
    },
  })
}
