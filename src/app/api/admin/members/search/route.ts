import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  await requireSuperAdmin()

  const query = (req.nextUrl.searchParams.get('q') || '').trim()

  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const members = await prisma.member.findMany({
    where: {
      archivedAt: null,
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { preferredName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 15,
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
      createdAt: true,
      _count: {
        select: {
          registrations: true,
          volunteerAssignments: true,
          ticketPurchases: true,
          sponsorFulfillments: true,
          participationRecords: true,
        },
      },
    },
  })

  return NextResponse.json({
    results: members.map((member) => ({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      preferredName: member.preferredName,
      email: member.email,
      phone: member.phone,
      city: member.city,
      state: member.state,
      createdAt: member.createdAt,
      recordCount:
        member._count.registrations +
        member._count.volunteerAssignments +
        member._count.ticketPurchases +
        member._count.sponsorFulfillments +
        member._count.participationRecords,
      counts: member._count,
    })),
  })
}
