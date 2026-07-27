'use client'

import { useEffect, useState } from 'react'

type Contestant = {
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
  contestants: Contestant[]
  totalVotes: number
}

type ScreenState = 'ready' | 'submitting' | 'confirmed' | 'error' | 'closed'

export function ContestVotingPad() {
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [isOpen, setIsOpen] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [screenState, setScreenState] = useState<ScreenState>('ready')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadContestants() {
    try {
      const response = await fetch('/api/contest-voting/results', {
        cache: 'no-store',
      })

      if (!response.ok) {
        setScreenState('error')
        setMessage('Connection issue - voting screen could not refresh.')
        return
      }

      const data = (await response.json()) as ResultsPayload
      setContestants(data.contestants)
      setIsOpen(data.session.isOpen)

      if (!data.session.isOpen) {
        setScreenState('closed')
        setMessage('Voting is closed.')
      } else if (screenState === 'closed' || screenState === 'error') {
        setScreenState('ready')
        setMessage('')
      }
    } catch {
      setScreenState('error')
      setMessage('Connection issue - vote was not recorded. Please try again.')
    }
  }

  useEffect(() => {
    loadContestants()
    const interval = window.setInterval(loadContestants, 3000)

    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resetForNextVoter() {
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
    setSelectedName('')
    setMessage('')
    await loadContestants()

    if (isOpen) {
      setScreenState('ready')
    }

    setIsSubmitting(false)
  }

  async function vote(contestant: Contestant) {
    if (isSubmitting || !isOpen || screenState === 'submitting') return

    setIsSubmitting(true)
    setSelectedName(contestant.name)
    setScreenState('submitting')
    setMessage('Recording vote for ' + contestant.name + '...')

    try {
      const response = await fetch('/api/contest-voting/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contestantId: contestant.id,
          source: 'ipad-vote-screen',
        }),
      })

      if (response.ok) {
        setScreenState('confirmed')
        setMessage('Vote recorded for ' + contestant.name)
        await resetForNextVoter()
        return
      }

      const data = await response.json().catch(() => null)
      setScreenState('error')
      setMessage(
        data?.error
          ? String(data.error)
          : 'Vote was not recorded. Please try again.'
      )
      setIsSubmitting(false)
      await loadContestants()
    } catch {
      setScreenState('error')
      setMessage('Connection issue - vote was not recorded. Please try again.')
      setIsSubmitting(false)
    }
  }

  const buttonsDisabled = isSubmitting || !isOpen || screenState === 'submitting'

  if (screenState === 'confirmed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0506] p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#B11218]/40 bg-[#16090B] p-10 text-center shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
            Vote recorded
          </p>
          <h1 className="mt-4 text-5xl font-black md:text-7xl">
            Thank you
          </h1>
          <p className="mt-5 text-3xl font-black text-[#D11A22]">
            {selectedName}
          </p>
          <p className="mt-6 text-xl text-white/60">
            Returning to the ballot for the next voter...
          </p>
        </div>
      </div>
    )
  }

  if (screenState === 'closed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0506] p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-400/30 bg-[#16090B] p-10 text-center shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-300">
            Voting closed
          </p>
          <h1 className="mt-4 text-5xl font-black md:text-7xl">
            Voting is closed
          </h1>
          <p className="mt-6 text-xl text-white/60">
            Please see an administrator if voting should be reopened.
          </p>
          <div className="mt-8">
            <a
              href="/admin/contest-voting"
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              Back
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0506] p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex justify-end">
          <a
            href="/admin/contest-voting"
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            Back
          </a>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-[#16090B] p-5 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#B11218]">
            Contest voting
          </p>
          <h1 className="mt-2 text-4xl font-black">
            {screenState === 'submitting' ? 'Recording vote...' : 'Tap one contestant'}
          </h1>

          {message ? (
            <p
              className={
                screenState === 'error'
                  ? 'mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-xl font-bold text-red-200'
                  : 'mt-3 text-xl font-bold text-[#D11A22]'
              }
            >
              {message}
            </p>
          ) : (
            <p className="mt-3 text-white/60">Ready for iPad voting.</p>
          )}
        </div>

        {screenState === 'error' ? (
          <div className="mb-6 rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-center">
            <p className="text-2xl font-black text-red-100">
              Connection issue
            </p>
            <p className="mt-2 text-red-100/80">
              The vote may not have been recorded. Check Wi-Fi and try again.
            </p>
            <button
              type="button"
              onClick={() => {
                setScreenState('ready')
                setMessage('')
                loadContestants()
              }}
              className="mt-4 rounded-full bg-[#B11218] px-6 py-3 text-sm font-black text-white hover:bg-[#D11A22]"
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="grid gap-4">
          {contestants.map((contestant) => (
            <button
              key={contestant.id}
              type="button"
              disabled={buttonsDisabled}
              onClick={() => vote(contestant)}
              className="rounded-3xl border border-[#B11218]/40 bg-[#B11218] px-8 py-8 text-left text-4xl font-black text-white shadow-lg transition hover:scale-[1.01] hover:bg-[#D11A22] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {contestant.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}