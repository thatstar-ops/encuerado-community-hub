import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'

function canUseContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN', 'VOTING'].includes(admin?.role)
}
import { ensureContestVotingSession } from '@/lib/contest-voting'
import { ContestVotingDashboard } from '@/components/admin/ContestVotingDashboard'

function canManageContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN'].includes(admin?.role)
}

export default async function ContestVotingDashboardPage() {
  const admin = await getCurrentAdmin()

  if (!admin || !canUseContestVoting(admin)) {
    redirect('/admin/login?redirect=/admin/contest-voting')
  }

  await ensureContestVotingSession()

  return (
    <main className="min-h-screen bg-[#0B0506] p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl border border-white/10 bg-[#16090B] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
                Voting dashboard
              </p>
              <h1 className="mt-2 text-4xl font-black text-white">Contest Voting</h1>
              <p className="mt-2 text-white/60">
                View live results, open the casting screen, manage ballot settings, and review saved history.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {admin.role === 'VOTING' ? null : (
              <a
                href="/admin"
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
              >
                Back to Admin
              </a>
            )}

            <a
              href="/admin/contest-voting/vote"
              className="rounded-full bg-[#B11218] px-5 py-3 text-sm font-black text-white hover:bg-[#D11A22]"
            >
              Cast Vote / Voting Screen
            </a>

            {canManageContestVoting(admin) ? (
              <>
                <a
                  href="/admin/contest-voting/settings"
                  className="rounded-full border border-[#B11218]/50 px-5 py-3 text-sm font-bold text-[#D11A22] hover:bg-[#B11218] hover:text-white"
                >
                  Voting Settings
                </a>

                <a
                  href="/admin/contest-voting/history"
                  className="rounded-full border border-[#B11218]/50 px-5 py-3 text-sm font-bold text-[#D11A22] hover:bg-[#B11218] hover:text-white"
                >
                  Voting History
                </a>
              </>
            ) : null}
          </div>
        </div>

        <ContestVotingDashboard />
      </div>
    </main>
  )
}
