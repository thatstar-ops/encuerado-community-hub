'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ScheduleEvent } from '@/lib/schedule-import'

type DuplicateStatus = 'New Event' | 'Already Imported' | 'Possible Existing Match' | 'Update Available' | 'Invalid or Incomplete' | 'Needs Review'
type ImportAction = 'skip' | 'create' | 'update' | 'separate'
type UpdateField = 'title' | 'description' | 'location' | 'startAt' | 'endAt' | 'flyerUrl' | 'sourceUrl'
type FlyerHandling = 'copy' | 'external' | 'none'
type RowKind = 'source' | 'manual'

type Comparison = {
  field: UpdateField
  label: string
  source: string
  current: string
  changed: boolean
}

type ImportValues = {
  title: string
  description: string
  location: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  flyerUrl: string
  sourceUrl: string
}

type PreviewEvent = ScheduleEvent & {
  rowKind: RowKind
  duplicateStatus: DuplicateStatus
  validationErrors: string[]
  duplicateMatch: { id: string; title: string; startsAt: string; reason: string } | null
  comparisons: Comparison[]
  action: ImportAction
  importValues: ImportValues
  updateFields: Record<UpdateField, boolean>
  flyerHandling: FlyerHandling
  allowExternalFlyerFallback: boolean
  externalFlyerConfirmed: boolean
  importSeparatelyConfirmed: boolean
}

type ImportResult = {
  title: string
  action: ImportAction
  status: 'imported' | 'updated' | 'skipped' | 'failed'
  message: string
  flyerStorage?: string
}

const EVENT_TIME_ZONE = 'America/Los_Angeles'
const SCHEDULE_URL = 'https://www.encueradoweekend.com/schedule'

const updateFieldLabels: Record<UpdateField, string> = {
  title: 'title',
  description: 'description',
  location: 'location',
  startAt: 'start time',
  endAt: 'end time',
  flyerUrl: 'flyer',
  sourceUrl: 'source URL',
}

function suggestedAction(event: Pick<PreviewEvent, 'duplicateStatus'>): ImportAction {
  if (event.duplicateStatus === 'New Event' || event.duplicateStatus === 'Needs Review') return 'create'
  if (event.duplicateStatus === 'Update Available' || event.duplicateStatus === 'Possible Existing Match') return 'update'
  return 'skip'
}

function canSelectEvent(event: Pick<PreviewEvent, 'duplicateStatus' | 'rowKind'>) {
  return event.rowKind === 'manual' || (event.duplicateStatus !== 'Already Imported' && event.duplicateStatus !== 'Invalid or Incomplete')
}

function emptyUpdateFields() {
  return {
    title: false,
    description: false,
    location: false,
    startAt: false,
    endAt: false,
    flyerUrl: false,
    sourceUrl: false,
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value || ''
}

function dateTimeParts(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return {
    date: `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`,
    time: `${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`,
  }
}

function wallTimeMs(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Date.UTC(
    Number(partValue(parts, 'year')),
    Number(partValue(parts, 'month')) - 1,
    Number(partValue(parts, 'day')),
    Number(partValue(parts, 'hour')),
    Number(partValue(parts, 'minute')),
  )
}

function zonedDateTimeToIso(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return ''
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return ''
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let guess = new Date(target)
  for (let index = 0; index < 3; index += 1) {
    guess = new Date(guess.getTime() + target - wallTimeMs(guess))
  }
  return guess.toISOString()
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value || '-'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function importValuesFromEvent(event: ScheduleEvent): ImportValues {
  const start = dateTimeParts(event.startAt)
  const end = dateTimeParts(event.endAt)
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    flyerUrl: event.flyerUrl,
    sourceUrl: event.sourceUrl,
  }
}

function blankManualEvent(): PreviewEvent {
  return {
    title: '',
    description: '',
    location: '',
    sourceDateText: 'Manually added by admin',
    startAt: '',
    endAt: '',
    overnight: false,
    flyerUrl: '',
    sourceUrl: SCHEDULE_URL,
    externalKey: `manual:${crypto.randomUUID()}`,
    extraction: 'manual',
    extractionLabel: 'Manually Added',
    warnings: ['Manually Added: review every import value before confirming.'],
    rowKind: 'manual',
    duplicateStatus: 'Needs Review',
    validationErrors: [],
    duplicateMatch: null,
    comparisons: [],
    action: 'create',
    importValues: {
      title: '',
      description: '',
      location: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      flyerUrl: '',
      sourceUrl: SCHEDULE_URL,
    },
    updateFields: emptyUpdateFields(),
    flyerHandling: 'none',
    allowExternalFlyerFallback: false,
    externalFlyerConfirmed: false,
    importSeparatelyConfirmed: false,
  }
}

function sourceLabel(event: PreviewEvent) {
  if (event.rowKind === 'manual') return 'Manually Added'
  if (event.extraction === 'last verified schedule data') return 'Last Verified Fallback - Review Required'
  return event.duplicateStatus === 'Needs Review' ? 'Automatically Extracted - Review Required' : 'Automatically Extracted'
}

function isHttpUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

function rowDateTimes(values: ImportValues) {
  const startAt = zonedDateTimeToIso(values.startDate, values.startTime)
  const endAt = zonedDateTimeToIso(values.endDate, values.endTime)
  return { startAt, endAt }
}

function rowErrors(event: PreviewEvent) {
  if (event.action === 'skip') return []
  const errors: string[] = []
  const values = event.importValues
  const { startAt, endAt } = rowDateTimes(values)
  const flyerChanged = values.flyerUrl.trim() !== event.flyerUrl

  if (!values.title.trim()) errors.push('Missing title.')
  if (values.title.length > 200) errors.push('Title must be 200 characters or fewer.')
  if (!values.description.trim()) errors.push('Missing description.')
  if (values.description.length > 10_000) errors.push('Description must be 10,000 characters or fewer.')
  if (!values.location.trim()) errors.push('Missing location.')
  if (values.location.length > 500) errors.push('Location must be 500 characters or fewer.')
  if (!values.startDate || !values.startTime) errors.push('Missing start date/time.')
  if (!values.endDate || !values.endTime) errors.push('Missing end date/time.')
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) errors.push('End date/time must be after start date/time.')
  if (values.flyerUrl && !isHttpUrl(values.flyerUrl)) errors.push('Invalid flyer URL.')
  if (!isHttpUrl(values.sourceUrl) || values.sourceUrl !== SCHEDULE_URL) errors.push('Source URL must remain the approved Encuerado schedule URL.')
  if (values.flyerUrl && flyerChanged && event.flyerHandling === 'copy') errors.push('Custom flyer URLs cannot be copied to Blob here. Choose Use External Flyer or clear the flyer.')
  if (values.flyerUrl && flyerChanged && event.flyerHandling === 'external' && !event.externalFlyerConfirmed) errors.push('Custom external flyer URL requires explicit review confirmation.')
  if (event.duplicateStatus === 'Possible Existing Match' && event.action !== 'update' && event.action !== 'separate') errors.push('Possible duplicate requires update existing or explicit separate import.')
  if (event.action === 'separate' && !event.importSeparatelyConfirmed) errors.push('Separate import requires explicit confirmation.')
  if (event.action === 'update' && !Object.values(event.updateFields).some(Boolean)) errors.push('Choose at least one field to update.')
  return errors
}

export default function ScheduleImportClient() {
  const [events, setEvents] = useState<PreviewEvent[]>([])
  const [sourceMode, setSourceMode] = useState<'automatic' | 'fallback'>('automatic')
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])
  const [busy, setBusy] = useState(false)

  async function preview(useFallback = false) {
    setBusy(true); setMessage(''); setResults([])
    const response = await fetch('/api/admin/schedule/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useFallback }) })
    const result = await response.json(); setBusy(false)
    if (!response.ok) return setMessage(result.error || 'Unable to preview the schedule.')
    setSourceMode(result.sourceMode || (useFallback ? 'fallback' : 'automatic'))
    setEvents(result.events.map((event: Omit<PreviewEvent, 'rowKind' | 'action' | 'importValues' | 'updateFields' | 'flyerHandling' | 'allowExternalFlyerFallback' | 'externalFlyerConfirmed' | 'importSeparatelyConfirmed'>) => ({
      ...event,
      rowKind: 'source',
      action: event.duplicateStatus === 'New Event' ? 'create' : 'skip',
      importValues: importValuesFromEvent(event),
      updateFields: emptyUpdateFields(),
      flyerHandling: event.flyerUrl ? 'copy' : 'none',
      allowExternalFlyerFallback: false,
      externalFlyerConfirmed: false,
      importSeparatelyConfirmed: false,
    })))
  }

  function addManualRow() {
    setEvents((current) => [...current, blankManualEvent()])
    setMessage('')
  }

  function update(index: number, patch: Partial<PreviewEvent>) {
    setEvents(events.map((event, current) => current === index ? { ...event, ...patch } : event))
  }

  function updateImportValue(index: number, field: keyof ImportValues, value: string) {
    const event = events[index]
    update(index, { importValues: { ...event.importValues, [field]: value } })
  }

  function updateField(index: number, field: UpdateField, checked: boolean) {
    const event = events[index]
    update(index, { updateFields: { ...event.updateFields, [field]: checked } })
  }

  function setChecked(index: number, checked: boolean) {
    const event = events[index]
    update(index, { action: checked && canSelectEvent(event) ? suggestedAction(event) : 'skip' })
  }

  const rowValidation = useMemo(() => events.map(rowErrors), [events])
  const validSelectedRows = events
    .map((event, index) => ({ event, index, errors: rowValidation[index] }))
    .filter((item) => item.event.action !== 'skip' && item.errors.length === 0)
  const invalidSelectedCount = events.filter((event, index) => event.action !== 'skip' && rowValidation[index].length > 0).length

  async function commit() {
    const selections = validSelectedRows.map(({ event }) => {
      const { startAt, endAt } = rowDateTimes(event.importValues)
      return {
        externalKey: event.externalKey,
        isManual: event.rowKind === 'manual',
        action: event.action,
        fields: {
          title: event.importValues.title,
          description: event.importValues.description,
          location: event.importValues.location,
          startAt,
          endAt,
          flyerUrl: event.importValues.flyerUrl,
          sourceUrl: event.importValues.sourceUrl,
        },
        updateFields: event.updateFields,
        flyerHandling: event.importValues.flyerUrl ? event.flyerHandling : 'none',
        allowExternalFlyerFallback: event.allowExternalFlyerFallback,
        externalFlyerConfirmed: event.externalFlyerConfirmed,
        importSeparatelyConfirmed: event.importSeparatelyConfirmed,
      }
    })

    if (!selections.length) {
      setMessage('No valid selected rows are ready to confirm.')
      return
    }

    setBusy(true); setMessage(''); setResults([])
    const response = await fetch('/api/admin/schedule/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceMode, selections }) })
    const result = await response.json(); setBusy(false)
    if (!response.ok) return setMessage(result.error || 'Import failed.')
    setResults(result.results || [])
    setMessage('Import complete. ' + result.imported + ' imported, ' + result.updated + ' updated, ' + result.skipped + ' skipped, ' + result.failed + ' failed.')
  }

  return <div className="grid gap-5">
    <div className="flex flex-wrap gap-3">
      <button onClick={() => preview()} disabled={busy} className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white">Fetch Schedule</button>
      <button onClick={() => preview(true)} disabled={busy} className="rounded-lg border border-[#B11218] px-5 py-3 font-bold text-[#B11218]">Manual Fallback</button>
      <button onClick={addManualRow} disabled={busy} className="rounded-lg border border-[#6E0D12] px-5 py-3 font-bold text-white hover:border-[#B11218] hover:text-[#B11218]">Add Manual Event</button>
      <Link href="/events" className="rounded-lg border border-[#3A1215] px-5 py-3 font-bold text-white hover:border-[#B11218] hover:text-[#B11218]">Cancel</Link>
    </div>

    {message && <p className="font-bold text-[#B11218]">{message}</p>}
    {sourceMode === 'fallback' && events.length > 0 && <p className="rounded-lg border border-[#B11218] bg-[#0B0B0B] p-4 font-semibold text-[#D11A22]">Last Verified Fallback - Review Required: review every field before import.</p>}
    {invalidSelectedCount > 0 && <p className="rounded-lg border border-[#B11218] bg-red-950 p-4 font-semibold text-red-100">{invalidSelectedCount} selected row(s) have errors and will not be submitted.</p>}

    {events.map((event, index) => {
      const errors = rowValidation[index]
      const startAt = zonedDateTimeToIso(event.importValues.startDate, event.importValues.startTime)
      const endAt = zonedDateTimeToIso(event.importValues.endDate, event.importValues.endTime)
      const overnight = startAt && endAt && event.importValues.endDate > event.importValues.startDate
      const flyerChanged = event.importValues.flyerUrl.trim() !== event.flyerUrl

      return <section key={event.externalKey} className="grid gap-5 rounded-lg border border-[#2A0E10] bg-[#151111] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={event.action !== 'skip'} disabled={!canSelectEvent(event)} onChange={(input) => setChecked(index, input.target.checked)} /> Select event</label>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold">{event.rowKind === 'manual' ? 'Manually Added' : event.duplicateStatus}</span>
            <span className="rounded-full bg-[#0B0B0B] px-3 py-1 text-sm">{sourceLabel(event)}</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-3">
            {event.importValues.flyerUrl ? <img src={event.importValues.flyerUrl} alt={(event.importValues.title || event.title || 'Event') + ' flyer'} className="aspect-square w-full rounded object-cover" /> : <div className="flex aspect-square items-center justify-center rounded bg-[#151111] text-sm text-[#8F8F8F]">No flyer</div>}
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
              <h2 className="font-bold text-white">Source detected</h2>
              <div className="mt-3 grid gap-2 text-sm text-[#B7B7B7]">
                <p><span className="font-bold text-white">Title:</span> {event.title || 'Manual row'}</p>
                <p><span className="font-bold text-white">Description:</span> {event.description || '-'}</p>
                <p><span className="font-bold text-white">Date text:</span> {event.sourceDateText}</p>
                <p><span className="font-bold text-white">Interpreted start:</span> {formatDateTime(event.startAt)}</p>
                <p><span className="font-bold text-white">Interpreted end:</span> {formatDateTime(event.endAt)} {event.overnight ? '(overnight)' : ''}</p>
                <p><span className="font-bold text-white">Location:</span> {event.location || '-'}</p>
                <p className="break-all"><span className="font-bold text-white">Flyer:</span> {event.flyerUrl || '-'}</p>
                <p className="break-all"><span className="font-bold text-white">Source URL:</span> {event.sourceUrl}</p>
                {event.duplicateMatch && <p><span className="font-bold text-white">Duplicate match:</span> {event.duplicateMatch.title} ({event.duplicateMatch.reason})</p>}
              </div>
            </div>

            {event.warnings.map((warning) => <p key={warning} className="rounded bg-[#B11218] p-3 font-semibold text-white">{warning}</p>)}
            {event.validationErrors.map((error) => <p key={error} className="rounded border border-[#B11218] bg-red-950 p-3 font-semibold text-red-100">{error}</p>)}
            {errors.map((error) => <p key={error} className="rounded border border-[#B11218] bg-red-950 p-3 font-semibold text-red-100">{error}</p>)}

            <div className="grid gap-3 rounded-lg border border-[#2A0E10] p-4">
              <h2 className="font-bold text-white">Import values</h2>
              <label>Event title<input value={event.importValues.title} onChange={(input) => updateImportValue(index, 'title', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
              <label>Description<textarea value={event.importValues.description} onChange={(input) => updateImportValue(index, 'description', input.target.value)} rows={4} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
              <div className="grid gap-3 md:grid-cols-2">
                <label>Start date<input type="date" value={event.importValues.startDate} onChange={(input) => updateImportValue(index, 'startDate', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
                <label>Start time<input type="time" value={event.importValues.startTime} onChange={(input) => updateImportValue(index, 'startTime', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
                <label>End date<input type="date" value={event.importValues.endDate} onChange={(input) => updateImportValue(index, 'endDate', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
                <label>End time<input type="time" value={event.importValues.endTime} onChange={(input) => updateImportValue(index, 'endTime', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
              </div>
              {overnight && <p className="text-sm font-bold text-[#B11218]">Overnight: end date is after start date.</p>}
              <label>Location<input value={event.importValues.location} onChange={(input) => updateImportValue(index, 'location', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
              <label>Flyer URL<input type="url" value={event.importValues.flyerUrl} onChange={(input) => updateImportValue(index, 'flyerUrl', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2" /></label>
              <label>Source URL<input type="url" value={event.importValues.sourceUrl} readOnly={event.rowKind !== 'manual'} onChange={(input) => updateImportValue(index, 'sourceUrl', input.target.value)} className="mt-1 w-full rounded border border-[#3A1215] bg-[#0B0B0B] p-2 read-only:text-[#8F8F8F]" /></label>
            </div>
          </div>
        </div>

        <fieldset className="grid gap-2 rounded-lg border border-[#2A0E10] p-4">
          <legend className="px-2 font-bold">Import/update choice</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={event.action === 'skip'} onChange={() => update(index, { action: 'skip' })} /> Skip</label>
          {(event.rowKind === 'manual' || event.duplicateStatus === 'New Event' || event.duplicateStatus === 'Needs Review') && <label className="flex items-center gap-2"><input type="radio" checked={event.action === 'create'} onChange={() => update(index, { action: 'create' })} /> Import as new</label>}
          {(event.duplicateStatus === 'Update Available' || event.duplicateStatus === 'Possible Existing Match') && <label className="flex items-center gap-2"><input type="radio" checked={event.action === 'update'} onChange={() => update(index, { action: 'update' })} /> Update existing</label>}
          {event.duplicateStatus === 'Possible Existing Match' && <label className="flex items-center gap-2"><input type="radio" checked={event.action === 'separate'} onChange={() => update(index, { action: 'separate' })} /> Import as separate event</label>}
          {event.action === 'separate' && <label className="flex items-center gap-2 rounded bg-[#0B0B0B] p-3"><input type="checkbox" checked={event.importSeparatelyConfirmed} onChange={(input) => update(index, { importSeparatelyConfirmed: input.target.checked })} /> Confirm separate event import</label>}
        </fieldset>

        {event.comparisons.length > 0 && event.action === 'update' && <div className="overflow-x-auto rounded-lg border border-[#2A0E10]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#0B0B0B] text-white"><tr><th className="p-3">Update</th><th className="p-3">Field</th><th className="p-3">Current</th><th className="p-3">Source detected</th></tr></thead>
            <tbody>
              {event.comparisons.map((comparison) => <tr key={comparison.field} className="border-t border-[#2A0E10]">
                <td className="p-3"><input type="checkbox" checked={event.updateFields[comparison.field]} onChange={(input) => updateField(index, comparison.field, input.target.checked)} /></td>
                <td className="p-3 font-bold">{updateFieldLabels[comparison.field]}</td>
                <td className="max-w-xs p-3 text-[#B7B7B7]">{comparison.current || '-'}</td>
                <td className="max-w-xs p-3 text-white">{comparison.source || '-'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}

        {event.action !== 'skip' && <fieldset className="grid gap-2 rounded-lg border border-[#2A0E10] p-4">
          <legend className="px-2 font-bold">Flyer handling</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={event.flyerHandling === 'none'} onChange={() => update(index, { flyerHandling: 'none' })} /> Import without flyer</label>
          <label className="flex items-center gap-2"><input type="radio" checked={event.flyerHandling === 'copy'} onChange={() => update(index, { flyerHandling: 'copy' })} /> Copy Flyer to Storage</label>
          <label className="flex items-center gap-2"><input type="radio" checked={event.flyerHandling === 'external'} onChange={() => update(index, { flyerHandling: 'external' })} /> Use External Flyer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={event.allowExternalFlyerFallback} onChange={(input) => update(index, { allowExternalFlyerFallback: input.target.checked })} /> Use External Flyer if Blob copy fails</label>
          {flyerChanged && event.flyerHandling === 'external' && <label className="flex items-center gap-2 rounded bg-[#0B0B0B] p-3"><input type="checkbox" checked={event.externalFlyerConfirmed} onChange={(input) => update(index, { externalFlyerConfirmed: input.target.checked })} /> I reviewed this custom external flyer URL</label>}
        </fieldset>}
      </section>
    })}

    {events.length > 0 && <button onClick={commit} disabled={busy || validSelectedRows.length === 0} className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white disabled:opacity-60">Confirm Import</button>}
    {results.length > 0 && <div className="grid gap-2 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
      {results.map((result) => <p key={result.title + result.action} className="text-sm"><span className="font-bold text-white">{result.title}</span>: {result.status} - {result.message}{result.flyerStorage ? ' (' + (result.flyerStorage === 'external' ? 'external image' : result.flyerStorage + ' image') + ')' : ''}</p>)}
    </div>}
  </div>
}
