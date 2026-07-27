import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'

function canUseContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN', 'VOTING'].includes(admin?.role)
}
import { ensureContestVotingSession } from '@/lib/contest-voting'
import { ContestVotingPad } from '@/components/admin/ContestVotingPad'

export default async function ContestVotingPadPage() {
  const admin = await getCurrentAdmin()

  if (!admin || !canUseContestVoting(admin)) {
    redirect('/admin/login?redirect=/admin/contest-voting/vote')
  }

  await ensureContestVotingSession()

  return <ContestVotingPad />
}
