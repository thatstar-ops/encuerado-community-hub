'use client'

import { useRef, useState } from 'react'

type ExternalContactImportPreview = {
  rows: Array<{
    rowNumber: number
    name: string
    email: string
    phone: string
    memberStatus: string
    matchMethod: string
    alreadyInList?: boolean
    errors: string[]
    action: string
  }>
  summary: Record<string, number>
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default function ExternalContactImportForm({
  adminEmail,
}: {
  adminEmail: string
}) {
  const [label, setLabel] = useState('')
  const [preview, setPreview] =
    useState<ExternalContactImportPreview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function submit(endpoint: string) {
    const form = formRef.current
    if (!form) return

    setBusy(true)
    setMessage('')

    const response = await fetch(endpoint, {
      method: 'POST',
      body: new FormData(form),
    })

    const result = await response.json()
    setBusy(false)

    if (!response.ok) {
      setMessage(result.error || 'Unable to process this CSV.')
      return
    }

    if (endpoint.endsWith('/preview')) {
      setPreview(result)
      return
    }

    const imported = result.results.filter(
      (row: { result: string }) => row.result === 'imported',
    ).length

    setMessage(
      'Import complete. ' + imported + ' contacts imported.',
    )
    setPreview(null)
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => event.preventDefault()}
      className="mt-6 grid gap-5"
    >
      <input
        type="hidden"
        name="overrideUsedByEmail"
        value={adminEmail}
      />

      <label className="rounded-xl border border-[#B11218] bg-[#151111] p-4 text-sm text-white">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="superAdminImportOverride"
            value="yes"
            className="mt-1 h-5 w-5"
          />
          <div>
            <div className="font-black text-[#FFB3B6]">
              Super admin override
            </div>
            <div className="mt-1 text-[#B7B7B7]">
              Allow incomplete profiles or name and phone conflicts
              during review. Invalid emails, duplicate CSV rows,
              ambiguous matches, and records without an email or usable
              phone number will still be blocked.
            </div>
          </div>
        </div>
      </label>

      <label className="grid gap-2">
        <span className="font-bold text-white">
          External Contact List Label *
        </span>
        <input
          name="listLabel"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          placeholder="e.g. Latrine 2026, Sponsor Leads 2026"
          className={inputClass}
        />
      </label>

      <label className="grid gap-2">
        <span className="font-bold text-white">CSV File</span>
        <input
          name="csvFile"
          type="file"
          accept=".csv,text/csv"
          required
          className={inputClass}
        />
        <p className="mt-1 text-sm text-[#8F8F8F]">
          Upload a CSV UTF-8 file. The importer will automatically look
          for name, email, phone, address, and notes columns.
        </p>
      </label>

      <button
        type="button"
        disabled={busy || !label}
        onClick={() =>
          submit('/api/admin/external-contact-import/preview')
        }
        className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Working...' : 'Preview Import'}
      </button>

      {message && (
        <p className="font-semibold text-[#B11218]">{message}</p>
      )}

      {preview && (
        <div className="grid gap-5 rounded-lg border border-[#3A1215] bg-[#151111] p-5">
          <h2 className="text-2xl font-bold">Preview Import</h2>

          <div className="grid gap-2 text-sm md:grid-cols-3">
            {Object.entries(preview.summary).map(([key, value]) => (
              <div key={key}>
                <span className="text-[#8F8F8F]">{key}: </span>
                {value}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr>
                  {[
                    'Row',
                    'Name',
                    'Email',
                    'Phone',
                    'Member',
                    'Match',
                    'In List?',
                    'Errors / Override',
                    'Action',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="p-2 text-left"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className="border-t border-[#2A0E10]"
                  >
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.email}</td>
                    <td className="p-2">{row.phone}</td>
                    <td className="p-2">{row.memberStatus}</td>
                    <td className="p-2">{row.matchMethod}</td>
                    <td className="p-2">
                      {row.alreadyInList ? 'Yes' : 'No'}
                    </td>
                    <td className="p-2 text-[#FFB3B6]">
                      {row.errors.join(' ') || '—'}
                    </td>
                    <td className="p-2">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submit('/api/admin/external-contact-import/commit')
            }
            className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white"
          >
            Confirm Import
          </button>
        </div>
      )}
    </form>
  )
}
