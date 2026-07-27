import { NextResponse } from 'next/server'
import { getContestVotingResults } from '@/lib/contest-voting'
import { getCurrentAdmin } from '@/lib/auth'

function canUseContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN', 'VOTING'].includes(admin?.role)
}

export async function GET() {
  const admin = await getCurrentAdmin()

  if (!admin || !canUseContestVoting(admin)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await getContestVotingResults()
  return NextResponse.json(results)
}
