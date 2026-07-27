import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { ensureContestVotingSession, getContestVotingResults } from '@/lib/contest-voting'
import { saveContestVotingSnapshot } from '@/lib/contest-voting-archive'

function canManageContestVoting(admin: any) {
  return ['SUPER_ADMIN', 'ADMIN'].includes(admin?.role)
}

async function updateContestSettings(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const sessionId = String(formData.get('sessionId') || '')
  const title = String(formData.get('title') || 'Contest Voting').trim() || 'Contest Voting'
  const contestantCountRaw = Number(formData.get('contestantCount'))
  const contestantCount = Number.isFinite(contestantCountRaw)
    ? Math.max(1, Math.min(20, Math.floor(contestantCountRaw)))
    : 5

  const session = await prisma.contestVotingSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      contestants: {
        orderBy: {
          displayOrder: 'asc',
        },
      },
    },
  })

  if (!session) {
    redirect('/admin/contest-voting/settings')
  }

  await prisma.contestVotingSession.update({
    where: {
      id: session.id,
    },
    data: {
      title,
    },
  })

  for (let index = 0; index < 20; index++) {
    const displayOrder = index + 1
    const fieldName = 'contestantName' + String(displayOrder)
    const rawName = String(formData.get(fieldName) || '').trim()
    const existing = session.contestants.find(
      (contestant) => contestant.displayOrder === displayOrder
    )

    const shouldBeActive = displayOrder <= contestantCount
    const fallbackName = 'Contestant ' + String(displayOrder)
    const name = rawName || fallbackName

    if (existing) {
      await prisma.contestContestant.update({
        where: {
          id: existing.id,
        },
        data: {
          name,
          displayOrder,
          isActive: shouldBeActive,
        },
      })
    } else if (shouldBeActive) {
      await prisma.contestContestant.create({
        data: {
          sessionId: session.id,
          name,
          displayOrder,
          isActive: true,
        },
      })
    }
  }

  redirect('/admin/contest-voting/settings?saved=1')
}

async function clearContestVotes(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const sessionId = String(formData.get('sessionId') || '')
  const confirmText = String(formData.get('confirmText') || '').trim().toUpperCase()

  if (confirmText !== 'CLEAR') {
    redirect('/admin/contest-voting/settings?clearError=1')
  }

  await prisma.contestVote.deleteMany({
    where: {
      sessionId,
    },
  })

  redirect('/admin/contest-voting/settings?cleared=1')
}

async function startContestVoting(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const sessionId = String(formData.get('sessionId') || '')

  await prisma.contestVotingSession.update({
    where: {
      id: sessionId,
    },
    data: {
      isOpen: true,
    },
  })

  redirect('/admin/contest-voting/settings?started=1')
}


async function saveCurrentContestResults(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const sessionId = String(formData.get('sessionId') || '')

  await saveContestVotingSnapshot({
    sessionId,
    createdByEmail: admin.email,
    createdByName: admin.name,
    reason: 'Manual save',
  })

  redirect('/admin/contest-voting/settings?savedResults=1')
}

async function endContestVoting(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin || !canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const sessionId = String(formData.get('sessionId') || '')

  await prisma.contestVotingSession.update({
    where: {
      id: sessionId,
    },
    data: {
      isOpen: false,
    },
  })

  await saveContestVotingSnapshot({
    sessionId,
    createdByEmail: admin.email,
    createdByName: admin.name,
    reason: 'Final tally saved when voting ended',
  })

  redirect('/admin/contest-voting/settings?ended=1&savedResults=1')
}

export default async function ContestVotingSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string
    cleared?: string
    clearError?: string
    started?: string
    ended?: string
    savedResults?: string
  }>
}) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/admin/contest-voting/settings')
  }

  if (!canManageContestVoting(admin)) {
    redirect('/admin/contest-voting')
  }

  const params = searchParams ? await searchParams : {}
  const session = await ensureContestVotingSession()
  const results = await getContestVotingResults()

  const allContestants = await prisma.contestContestant.findMany({
    where: {
      sessionId: session.id,
    },
    orderBy: {
      displayOrder: 'asc',
    },
  })

  const activeCount = Math.max(
    1,
    allContestants.filter((contestant) => contestant.isActive).length || 5
  )

  const contestantsByOrder = new Map(
    allContestants.map((contestant) => [contestant.displayOrder, contestant])
  )

  const sortedContestants = [...results.contestants].sort(
    (a, b) => b.voteCount - a.voteCount
  )

  const maxVotes = Math.max(1, ...results.contestants.map((contestant) => contestant.voteCount))
  const leadingContestant = sortedContestants[0] || null

  return (
    <main className="min-h-screen bg-[#0B0506] p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/contest-voting"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              Voting Dashboard
            </Link>

            <Link
              href="/admin/contest-voting/vote"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              Voting Screen
            </Link>

            <Link
              href="/admin"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              Back to Admin
            </Link>

            <Link
              href="/admin/contest-voting/history"
              className="rounded-full border border-[#B11218]/50 px-4 py-2 text-sm font-bold text-[#D11A22] hover:bg-[#B11218] hover:text-white"
            >
              Voting History
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#16090B] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
                Voting control room
              </p>
              <h1 className="mt-2 text-4xl font-black">Contest voting settings</h1>
              <p className="mt-2 text-white/60">
                Edit the ballot, start or end voting, clear test votes, and see the tally.
              </p>
            </div>

            <div
              className={
                session.isOpen
                  ? 'rounded-2xl bg-green-400 px-5 py-4 text-white'
                  : 'rounded-2xl bg-red-500 px-5 py-4 text-white'
              }
            >
              <p className="text-sm font-black uppercase">Voting status</p>
              <p className="text-2xl font-black">{session.isOpen ? 'Open' : 'Closed'}</p>
            </div>
          </div>

          {params?.saved === '1' ? (
            <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-sm font-bold text-green-200">
              Contest voting settings saved.
            </div>
          ) : null}

          {params?.cleared === '1' ? (
            <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-sm font-bold text-green-200">
              All contest votes have been cleared.
            </div>
          ) : null}

          {params?.clearError === '1' ? (
            <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-200">
              Votes were not cleared. Type CLEAR to confirm.
            </div>
          ) : null}

          {params?.started === '1' ? (
            <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-sm font-bold text-green-200">
              Voting is now open.
            </div>
          ) : null}

          {params?.ended === '1' ? (
            <div className="mt-5 rounded-2xl border border-[#B11218]/30 bg-[#B11218]/10 p-4 text-sm font-bold text-[#D11A22] text-white">
              Voting has been closed. Final tally is shown below.
            </div>
          ) : null}

          {params?.savedResults === '1' ? (
            <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-sm font-bold text-green-200">
              Voting results have been saved to history.
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0B0506] p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-white/50">
                Total votes
              </p>
              <p className="mt-2 text-5xl font-black text-[#B11218]">
                {results.totalVotes}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0B0506] p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-white/50">
                Current leader
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {leadingContestant ? leadingContestant.name : 'No votes yet'}
              </p>
              <p className="mt-1 text-sm text-white/50">
                {leadingContestant ? String(leadingContestant.voteCount) + ' votes' : 'Waiting for votes'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0B0506] p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-white/50">
                Active contestants
              </p>
              <p className="mt-2 text-5xl font-black text-white">
                {results.contestants.length}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-[#0B0506] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-black">Live / final tally</h2>
              <p className="text-sm text-white/50">
                Refresh the page to update this control-room tally. The public dashboard still auto-refreshes.
              </p>
            </div>

            <div className="space-y-4">
              {results.contestants.map((contestant) => {
                const percent =
                  results.totalVotes > 0
                    ? Math.round((contestant.voteCount / results.totalVotes) * 100)
                    : 0

                const widthPercent = Math.max(
                  contestant.voteCount > 0 ? 8 : 0,
                  Math.round((contestant.voteCount / maxVotes) * 100)
                )

                return (
                  <div key={contestant.id}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xl font-black text-white">
                          {contestant.name}
                        </p>
                        <p className="text-sm text-white/50">{percent}% of votes</p>
                      </div>
                      <p className="text-2xl font-black text-[#B11218]">
                        {contestant.voteCount}
                      </p>
                    </div>

                    <div className="h-6 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#B11218] text-white"
                        style={{ width: String(widthPercent) + '%' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <form action={startContestVoting}>
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="rounded-full bg-green-400 px-6 py-3 text-sm font-black text-white hover:bg-green-300"
              >
                Start voting
              </button>
            </form>

            <form action={endContestVoting}>
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="rounded-full bg-red-500 px-6 py-3 text-sm font-black text-white hover:bg-red-400"
              >
                End voting and save final tally
              </button>
            </form>

            <form action={saveCurrentContestResults}>
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="rounded-full border border-[#B11218] px-6 py-3 text-sm font-black text-[#D11A22] hover:bg-[#B11218] hover:text-white"
              >
                Save current tally
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-[#16090B] p-6">
          <h2 className="text-3xl font-black">Edit ballot</h2>
          <p className="mt-2 text-white/60">
            Choose the number of contestants first. The form will show only that many name fields after saving.
          </p>

          <form action={updateContestSettings} className="mt-6 space-y-6">
            <input type="hidden" name="sessionId" value={session.id} />

            <div>
              <label className="text-sm font-bold uppercase tracking-wide text-white/60">
                Contest title
              </label>
              <input
                name="title"
                defaultValue={session.title}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B0506] px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#B11218]"
              />
            </div>

            <div>
              <label className="text-sm font-bold uppercase tracking-wide text-white/60">
                Number of contestants on ballot
              </label>
              <select
                name="contestantCount"
                defaultValue={String(activeCount)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B0506] px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#B11218]"
              >
                {Array.from({ length: 20 }).map((_, index) => {
                  const count = index + 1
                  return (
                    <option key={count} value={count}>
                      {count} contestant{count === 1 ? '' : 's'}
                    </option>
                  )
                })}
              </select>
              <p className="mt-2 text-sm text-white/50">
                After saving, only the selected number of contestant name fields will show.
              </p>
            </div>

            <div className="grid gap-4">
              {Array.from({ length: activeCount }).map((_, index) => {
                const displayOrder = index + 1
                const contestant = contestantsByOrder.get(displayOrder)

                return (
                  <div
                    key={displayOrder}
                    className="rounded-2xl border border-white/10 bg-[#0B0506] p-4"
                  >
                    <label className="text-sm font-bold uppercase tracking-wide text-white/60">
                      Contestant {displayOrder}
                    </label>
                    <input
                      name={'contestantName' + String(displayOrder)}
                      defaultValue={contestant?.name || ''}
                      placeholder={'Contestant ' + String(displayOrder)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#B11218]"
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-full bg-[#B11218] px-6 py-3 text-sm font-black text-white hover:bg-[#D11A22]"
              >
                Save voting ballot
              </button>

              <Link
                href="/admin/contest-voting/vote"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
              >
                Preview iPad Voting Screen
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-6 rounded-3xl border border-red-400/30 bg-red-400/10 p-5">
          <h2 className="text-2xl font-black text-red-100">Clear votes</h2>
          <p className="mt-2 text-sm text-red-100/80">
            This clears all votes for the current contest session but keeps the contestant names.
            Type CLEAR, then press the button.
          </p>

          <form action={clearContestVotes} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="sessionId" value={session.id} />
            <input
              name="confirmText"
              placeholder="Type CLEAR"
              className="rounded-2xl border border-red-300/30 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-red-300"
            />
            <button
              type="submit"
              className="rounded-full bg-red-500 px-6 py-3 text-sm font-black text-white hover:bg-red-400"
            >
              Clear all votes
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}