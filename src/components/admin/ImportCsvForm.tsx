'use client'

import { useRef, useState } from 'react'
import type { ImportPreview } from '@/lib/participation-import'

type Event = { id: string; title: string }

export default function ImportCsvForm({
  events,
  defaultCategory,
  defaultYear,
  sourceLabel,
  isSuperAdmin = false,
  adminEmail = '',
}: {
  events: Event[]
  defaultCategory?: string
  defaultYear?: string
  sourceLabel?: string
  isSuperAdmin?: boolean
  adminEmail?: string
}) {
  const [category, setCategory] = useState(defaultCategory || 'ATTENDEES')
  const [year, setYear] = useState(defaultYear || '2025')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function submit(endpoint: string) {
    const form = formRef.current
    if (!form) return
    setBusy(true)
    setMessage('')
    const response = await fetch(endpoint, { method: 'POST', body: new FormData(form) })
    const result = await response.json()
    setBusy(false)
    if (!response.ok) return setMessage(result.error || 'Unable to process this CSV.')
    if (endpoint.endsWith('/preview')) setPreview(result)
    else {
      const imported = result.results.filter((row: { result: string }) => row.result === 'imported').length
      setMessage('Import complete. ' + imported + ' rows imported.')
      setPreview(null)
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        submit('/api/imports/preview')
      }}
      className="mt-6 grid gap-5"
    >
      <input type="hidden" name="overrideUsedByEmail" value={adminEmail} />
{sourceLabel && <input type="hidden" name="sourceLabel" value={sourceLabel} />}
      {isSuperAdmin ? (
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
                Bypass strict name/email matching restrictions for this CSV import. Use only when you intentionally want to import or update despite warnings.
              </div>
            </div>
          </div>
        </label>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2"><span className="font-bold">Import Category</span>
          <select name="category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-3 text-white">
            <option value="ATTENDEES">Attendees</option><option value="VOLUNTEERS">Volunteers</option><option value="CONTACTS">General contacts</option>
          </select>
        </label>
        <label className="grid gap-2"><span className="font-bold">Participation Year</span>
          <input name="year" type="number" min="1900" max="2100" value={year} onChange={(event) => setYear(event.target.value)} required className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-3 text-white" />
        </label>
      </div>
      {category === 'ATTENDEES' && <label className="grid gap-2"><span className="font-bold">Optional event registration</span><select name="eventId" className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-3 text-white"><option value="">Do not register attendees to an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
      {category !== 'ATTENDEES' && <input type="hidden" name="eventId" value="" />}
      <label className="grid gap-2"><span className="font-bold">CSV File</span><input name="csvFile" type="file" accept=".csv,text/csv" required className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-3 text-white" /></label>
<button disabled={busy} className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white">{busy ? 'Working...' : 'Preview Import'}</button>
      {message && <p className="font-semibold text-[#B11218]">{message}</p>}
      {preview && <div className="grid gap-5 rounded-lg border border-[#3A1215] bg-[#151111] p-5">
        <h2 className="text-2xl font-bold">Preview Import</h2>
        <div className="grid gap-2 text-sm md:grid-cols-3">{Object.entries(preview.summary).map(([label, value]) => <div key={label}><span className="text-[#8F8F8F]">{label}: </span>{value}</div>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead><tr>{['Row','Name','Email','Member','Match','Participation','Volunteer Profile','Registration','Action','Errors'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber} className="border-t border-[#2A0E10]"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.name}</td><td className="p-2">{row.email}</td><td className="p-2">{row.memberStatus}</td><td className="p-2">{row.matchMethod}</td><td className="p-2">{row.participation}</td><td className="p-2">{row.volunteerProfile}</td><td className="p-2">{row.registration}</td><td className="p-2">{row.action}</td><td className="p-2 text-[#FFB3B6]">{row.errors.join(' ') || '—'}</td></tr>)}</tbody></table></div>
        <button type="button" disabled={busy} onClick={() => submit('/api/imports/commit')} className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white">Confirm Import</button>
      </div>}
    </form>
  )
}
