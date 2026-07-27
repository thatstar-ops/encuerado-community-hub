import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureContestVotingSession } from '@/lib/contest-voting'
import { getCurrentAdmin } from '@/lib/auth'

function canUseContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN', 'VOTING'].includes(admin?.role)
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin()

  if (!admin || !canUseContestVoting(admin)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const contestantId = String(body?.contestantId || '')
  const source = String(body?.source || 'ipad')

  if (!contestantId) {
    return NextResponse.json({ error: 'Missing contestantId' }, { status: 400 })
  }

  const session = await ensureContestVotingSession()

  const contestant = session.contestants.find(
    (item) => item.id === contestantId
  )

  if (!contestant) {
    return NextResponse.json({ error: 'Invalid contestant' }, { status: 400 })
  }

  if (!session.isOpen) {
    return NextResponse.json({ error: 'Voting is closed' }, { status: 400 })
  }

  await prisma.contestVote.create({
    data: {
      sessionId: session.id,
      contestantId,
      source,
    },
  })

  return NextResponse.json({ ok: true })
}
