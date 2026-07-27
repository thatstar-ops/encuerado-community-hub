'use client'

import { useEffect, useMemo, useState } from 'react'

type ContestantResult = {
  id: string
  name: string
  displayOrder: number
  voteCount: number
}

type ResultsPayload = {
  session: {
    id: string
    title: string
    isOpen: boolean
  }
  contestants: ContestantResult[]
  totalVotes: number
}

export function ContestVotingDashboard() {
  const [results, setResults] = useState<ResultsPayload | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  async function loadResults() {
    const response = await fetch('/api/contest-voting/results', {
      cache: 'no-store',
    })

    if (!response.ok) return

    const data = (await response.json()) as ResultsPayload
    setResults(data)
    setLastUpdated(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    loadResults()
    const interval = window.setInterval(loadResults, 1500)

    return () => window.clearInterval(interval)
  }, [])

  const maxVotes = useMemo(() => {
    if (!results) return 1
    return Math.max(1, ...results.contestants.map((item) => item.voteCount))
  }, [results])

  if (!results) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#16090B] p-8 text-white">
        Loading contest results...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-[#16090B] p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
              Live contest voting
            </p>
            <h1 className="mt-2 text-4xl font-black">{results.session.title}</h1>
            <p className="mt-2 text-white/60">
              Auto-refreshing every 1.5 seconds. Last updated: {lastUpdated || 'now'}
            </p>
          </div>

          <div className="rounded-2xl bg-[#B11218] px-6 py-4 text-center text-white">
            <p className="text-sm font-black uppercase">Total votes</p>
            <p className="text-4xl font-black">{results.totalVotes}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0F0708] p-6">
        <div className="space-y-5">
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
                <div className="mb-2 flex items-center justify-between gap-4 text-white">
                  <div>
                    <p className="text-2xl font-black">{contestant.name}</p>
                    <p className="text-sm text-white/50">{percent}% of votes</p>
                  </div>
                  <p className="text-3xl font-black text-[#B11218]">
                    {contestant.voteCount}
                  </p>
                </div>

                <div className="h-8 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#B11218] transition-all duration-500 text-white"
                    style={{ width: String(widthPercent) + '%' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
