import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params

  const list = await prisma.externalContactList.findUnique({
    where: { id },
    include: {
      members: {
        include: { member: true },
        orderBy: { importedAt: 'asc' },
      },
    },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const header = 'Name,Email,Phone,City,State,Country,Imported At,Source Label'
  const rows = list.members.map((clm) => {
    const m = clm.member
    return [
      `${m.preferredName || m.firstName} ${m.lastName}`,
      m.email,
      m.phone || '',
      m.city || '',
      m.state || '',
      m.country || '',
      clm.importedAt.toISOString(),
      clm.sourceLabel || '',
    ].map((field) => `"${field.replace(/"/g, '""')}"`).join(',')
  }).join('\n')

  const csv = header + '\n' + rows

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${list.label.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`,
    },
  })
}
