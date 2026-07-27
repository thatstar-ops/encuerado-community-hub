import { redirect } from 'next/navigation'

export function isVotingAdmin(admin: any) {
  return admin?.role === 'VOTING'
}

export function canUseContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN', 'VOTING'].includes(admin?.role)
}

export function redirectVotingAdminAwayFromGeneralAdmin(admin: any) {
  if (isVotingAdmin(admin)) {
    redirect('/admin/contest-voting')
  }
}