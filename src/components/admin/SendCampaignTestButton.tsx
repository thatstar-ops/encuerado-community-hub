'use client'

import { useState } from 'react'

type TestResult = {
  ok?: boolean
  status?: string
  error?: string
  message?: string
  testEmail?: string
}

export default function SendCampaignTestButton({
  campaignId,
  campaignTitle,
}: {
  campaignId: string
  campaignTitle: string
}) {
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function sendTest() {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setResult({ error: 'Enter a test email address first.' })
      return
    }

    const confirmed = window.confirm(
      `Send a test email for this campaign?\n\nCampaign: ${campaignTitle}\nTest recipient: ${trimmedEmail}\n\nThis sends only one email.`
    )

    if (!confirmed) return

    setIsSending(true)
    setResult(null)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmedEmail }),
      })

      const data = (await response.json().catch(() => ({}))) as TestResult

      if (!response.ok) {
        setResult({
          ok: false,
          error: data.error || `Request failed with status ${response.status}`,
        })
        return
      }

      setResult(data)
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to send test email.',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[#2A0E10] bg-black p-3">
      <label className="block text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">
        Test Email
      </label>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded border border-[#2A0E10] bg-[#0B0B0B] px-3 py-2 text-sm text-white outline-none focus:border-[#B11218]"
        />

        <button
          type="button"
          onClick={sendTest}
          disabled={isSending}
          className="rounded bg-[#6E0D12] px-3 py-2 text-xs font-bold text-white hover:bg-[#B11218] disabled:cursor-not-allowed disabled:bg-[#3A1215] disabled:text-[#777]"
        >
          {isSending ? 'Sending...' : 'Send Test'}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-3 rounded border p-3 text-xs ${
            result.error
              ? 'border-[#B11218] bg-[#2A0E10] text-[#ffb4b4]'
              : 'border-green-800 bg-green-950/30 text-green-200'
          }`}
        >
          {result.error ? result.error : result.message || 'Test email sent.'}
        </div>
      ) : null}
    </div>
  )
}