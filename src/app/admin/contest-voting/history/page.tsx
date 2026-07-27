import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import {
  deleteContestVotingArchive,
  getContestVotingArchives,
} from '@/lib/contest-voting-archive'

function canManageContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN'].includes(admin?.role)
}

async function deleteArchive(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const archiveId = String(formData.get('archiveId') || '')

  if (archiveId) {
    await deleteContestVotingArchive(archiveId)
  }

  redirect('/admin/contest-voting/history?deleted=1')
}

export default async function ContestVotingHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ deleted?: string }>
}) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/admin/contest-voting/history')
  }

  if (!canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const params = searchParams ? await searchParams : {}
  const archives = await getContestVotingArchives()

  return (
    <main className="min-h-screen bg-[#0B0506] p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/admin/contest-voting/settings"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
          >
            Back to Voting Settings
          </Link>

          <Link
            href="/admin/contest-voting"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
          >
            Voting Dashboard
          </Link>

          <Link
            href="/admin"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
          >
            Back to Admin
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#16090B] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
            Saved voting results
          </p>
          <h1 className="mt-2 text-4xl font-black">Voting history</h1>
          <p className="mt-2 text-white/60">
            Review saved contest tallies. Deleting a saved result does not delete current live votes.
          </p>

          {params?.deleted === '1' ? (
            <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-sm font-bold text-green-200">
              Saved voting result deleted.
            </div>
          ) : null}
        </div>

        <div className="mt-6 space-y-5">
          {archives.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#16090B] p-8 text-center text-white/60">
              No saved voting results yet.
            </div>
          ) : null}

          {archives.map((archive) => {
            const snapshot = archive.snapshotJson || {}
            const contestants = Array.isArray(snapshot.contestants)
              ? snapshot.contestants
              : []

            return (
              <div
                key={archive.id}
                className="rounded-3xl border border-white/10 bg-[#16090B] p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-white">
                      {archive.title}
                    </h2>
                    <p className="mt-1 text-sm text-white/50">
                      Saved {archive.createdAt.toLocaleString()}
                      {archive.createdByEmail ? ' by ' + archive.createdByEmail : ''}
                    </p>
                    <p className="mt-1 text-sm text-white/50">
                      Reason: {archive.reason || 'Saved result'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#B11218] px-5 py-4 text-center text-white">
                    <p className="text-sm font-black uppercase">Total votes</p>
                    <p className="text-4xl font-black">{archive.totalVotes}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-[#0B0506] p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-white/50">
                    Winner / leader at save time
                  </p>
                  <p className="mt-2 text-3xl font-black text-[#B11218]">
                    {archive.winnerName || 'No votes'}
                  </p>
                  <p className="text-sm text-white/50">
                    {archive.winnerVotes ?? 0} votes
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  {contestants.map((contestant: any, index: number) => (
                    <div
                      key={contestant.id || contestant.name || index}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B0506] p-4"
                    >
                      <div>
                        <p className="text-lg font-black text-white">
                          {index + 1}. {contestant.name}
                        </p>
                      </div>
                      <p className="text-2xl font-black text-[#B11218]">
                        {contestant.voteCount || 0}
                      </p>
                    </div>
                  ))}
                </div>

                <form action={deleteArchive} className="mt-5">
                  <input type="hidden" name="archiveId" value={archive.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-red-400 px-5 py-3 text-sm font-black text-red-200 hover:bg-red-500 hover:text-white"
                  >
                    Delete this saved result
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
