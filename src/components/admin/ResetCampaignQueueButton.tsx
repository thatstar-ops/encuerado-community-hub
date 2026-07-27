'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ResetResult = {
  ok?: boolean
  resetCount?: number
  error?: string
  message?: string
}

export default function ResetCampaignQueueButton({
  campaignId,
  failedCount,
  onlyApiKeyInvalid = true,
}: {
  campaignId?: string
  failedCount: number
  onlyApiKeyInvalid?: boolean
}) {
  const router = useRouter()
  const [isResetting, setIsResetting] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)

  async function resetFailed() {
    if (failedCount <= 0) {
      setResult({ message: 'No failed queue items to reset.' })
      return
    }

    const confirmed = window.confirm(
      `This will reset failed queue items back to Scheduled.\n\nFailed items: ${failedCount}\nFilter: ${
        onlyApiKeyInvalid ? 'Only API-key related failures' : 'All failed items'
      }\n\nContinue?`
    )

    if (!confirmed) return

    setIsResetting(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/campaign-queue/reset-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId,
          onlyApiKeyInvalid,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as ResetResult

      if (!response.ok) {
        setResult({
          ok: false,
          error: data.error || `Request failed with status ${response.status}`,
        })
        return
      }

      setResult(data)
      router.refresh()
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to reset queue items.',
      })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Reset Failed Queue Items</h2>
          <p className="mt-1 text-sm text-[#B7B7B7]">
            Use this after fixing Resend/API key issues so failed attempts can be retried.
          </p>
          <p className="mt-2 text-sm text-[#B7B7B7]">
            Failed items:{' '}
            <span className="font-bold text-white">{failedCount}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={resetFailed}
          disabled={isResetting || failedCount <= 0}
          className="rounded-lg border border-[#B11218] px-5 py-3 font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white disabled:cursor-not-allowed disabled:border-[#3A1215] disabled:text-[#777]"
        >
          {isResetting ? 'Resetting...' : 'Reset API-Key Failures'}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            result.error
              ? 'border-[#B11218] bg-[#2A0E10] text-white'
              : 'border-green-800 bg-green-950/30 text-white'
          }`}
        >
          {result.error ? (
            <>
              <p className="font-bold text-[#ffb4b4]">Reset failed</p>
              <p className="mt-1">{result.error}</p>
            </>
          ) : (
            <>
              <p className="font-bold text-green-300">Reset complete</p>
              <p className="mt-1 text-[#D7D7D7]">
                Reset count: {result.resetCount ?? 0}
              </p>
              {result.message ? <p className="mt-1 text-[#D7D7D7]">{result.message}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}