'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ProcessResult = {
  ok?: boolean
  sentCount?: number
  failedCount?: number
  skippedCount?: number
  processedCount?: number
  message?: string
  error?: string
  [key: string]: unknown
}

export default function ProcessCampaignQueueButton({
  dueCount,
  dailyLimit,
}: {
  dueCount: number
  dailyLimit: number
}) {
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<ProcessResult | null>(null)

  async function processQueue() {
    if (dueCount <= 0) {
      setResult({ message: 'No due scheduled emails to process right now.' })
      return
    }

    const confirmed = window.confirm(
      `This will process due scheduled email queue items now.\n\nDue now: ${dueCount}\nDaily safety limit: ${dailyLimit}\n\nContinue?`
    )

    if (!confirmed) return

    setIsProcessing(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/campaign-queue/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = (await response.json().catch(() => ({}))) as ProcessResult

      if (!response.ok) {
        setResult({
          ok: false,
          error: data.error || `Request failed with status ${response.status}`,
          ...data,
        })
        return
      }

      setResult(data)
      router.refresh()
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to process queue.',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Manual Queue Processor</h2>
          <p className="mt-1 text-sm text-[#B7B7B7]">
            Send due scheduled campaign emails now instead of waiting for Vercel cron.
          </p>
          <p className="mt-2 text-sm text-[#B7B7B7]">
            Due now:{' '}
            <span className="font-bold text-white">{dueCount}</span>
            {' '}• Daily safety limit:{' '}
            <span className="font-bold text-white">{dailyLimit}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={processQueue}
          disabled={isProcessing || dueCount <= 0}
          className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22] disabled:cursor-not-allowed disabled:bg-[#3A1215] disabled:text-[#777]"
        >
          {isProcessing ? 'Processing...' : 'Send Due Batch Now'}
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
            <div>
              <p className="font-bold text-[#ffb4b4]">Queue processing failed</p>
              <p className="mt-1">{result.error}</p>
            </div>
          ) : (
            <div>
              <p className="font-bold text-green-300">Queue processor finished</p>
              <div className="mt-2 grid gap-1 text-[#D7D7D7]">
                {typeof result.processedCount === 'number' ? (
                  <p>Processed: {result.processedCount}</p>
                ) : null}
                {typeof result.sentCount === 'number' ? <p>Sent: {result.sentCount}</p> : null}
                {typeof result.failedCount === 'number' ? <p>Failed: {result.failedCount}</p> : null}
                {typeof result.skippedCount === 'number' ? <p>Skipped: {result.skippedCount}</p> : null}
                {result.message ? <p>{result.message}</p> : null}
              </div>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-[#B7B7B7]">
              Raw response
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black p-3 text-xs text-[#B7B7B7]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  )
}