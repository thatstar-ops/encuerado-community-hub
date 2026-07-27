'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  parseCampaignContent,
  renderCampaignHtml,
  type CampaignBlock,
} from '@/lib/campaign-content'

type Event = { id: string; title: string }
type ExternalContactList = { id: string; label: string }

type AudienceConfig = {
  segments: string[]
  eventIds: string[]
  externalContactListIds: string[]
  manualEmails: string
  // Optional per-segment year filter for year-aware segments (attendees,
  // volunteers, sponsors). Missing/empty array = all years for that segment.
  categoryYears: Record<string, number[]>
}

const AUDIENCE_CATEGORIES: { value: string; label: string; yearAware: boolean }[] = [
  { value: 'all_contacts', label: 'All Contacts', yearAware: false },
  { value: 'attendees', label: 'Attendees', yearAware: true },
  { value: 'volunteers', label: 'Volunteers', yearAware: true },
  { value: 'sponsors', label: 'Sponsors', yearAware: true },
  { value: 'weekend_crew', label: 'Weekend Crew', yearAware: false },
]

type CampaignFormInitialData = {
  id: string
  title?: string | null
  subject?: string | null
  previewText?: string | null
  body?: string | null
  fromEmail?: string | null
  recipientType?: string | null
  recipientEventId?: string | null
  manualEmails?: string | null
  audienceConfig?: unknown
  status?: string | null
  content?: unknown
}

type RecipientPreview = {
  total: number
  sample: { email: string; name?: string | null; source: string }[]
  duplicateCount: number
  invalidCount: number
  optedOutCount: number
  inactiveCount: number
  sourceLabel: string
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

const blockId = () => crypto.randomUUID()

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function fileNameToAltText(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function validateBlocksForClient(blocks: CampaignBlock[]) {
  for (const block of blocks) {
    if (block.type === 'image') {
      if (!block.imageUrl.trim() || !isHttpUrl(block.imageUrl)) {
        return 'Upload each picture or paste a valid http/https picture URL.'
      }

      if (!block.altText.trim()) {
        return 'Add alternative text for each picture.'
      }

      if (block.linkUrl && block.linkUrl.trim() && !isHttpUrl(block.linkUrl)) {
        return 'Picture links must be valid http or https URLs.'
      }
    }

    if (block.type === 'button') {
      if (!block.label.trim() || !isHttpUrl(block.url)) {
        return 'Buttons need text and a valid http or https website URL.'
      }
    }

    if (block.type === 'text') {
      if (!block.heading?.trim() && !block.body.trim()) {
        return 'Text blocks cannot be empty.'
      }
    }
  }

  return null
}

function parseAudienceConfig(value: unknown): AudienceConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const raw = value as Partial<AudienceConfig>

  const categoryYears: Record<string, number[]> = {}
  if (raw.categoryYears && typeof raw.categoryYears === 'object' && !Array.isArray(raw.categoryYears)) {
    for (const [key, years] of Object.entries(raw.categoryYears)) {
      if (Array.isArray(years)) {
        const parsed = years.map(Number).filter((n) => Number.isInteger(n))
        if (parsed.length) categoryYears[key] = parsed
      }
    }
  }

  return {
    segments: Array.isArray(raw.segments) ? raw.segments.map(String) : [],
    eventIds: Array.isArray(raw.eventIds) ? raw.eventIds.map(String) : [],
    externalContactListIds: Array.isArray(raw.externalContactListIds)
      ? raw.externalContactListIds.map(String)
      : [],
    manualEmails: raw.manualEmails ? String(raw.manualEmails) : '',
    categoryYears,
  }
}

function emptyAudienceConfig(): AudienceConfig {
  return {
    segments: [],
    eventIds: [],
    externalContactListIds: [],
    manualEmails: '',
    categoryYears: {},
  }
}

function audienceHasSelection(config: AudienceConfig) {
  return (
    config.segments.length > 0 ||
    config.eventIds.length > 0 ||
    config.externalContactListIds.length > 0 ||
    config.manualEmails.trim().length > 0
  )
}

export default function CampaignForm({
  events,
  externalContactLists,
  availableYears = [],
  initialData,
}: {
  events: Event[]
  externalContactLists: ExternalContactList[]
  availableYears?: number[]
  initialData?: CampaignFormInitialData
}) {
  const router = useRouter()

  const existingBlocks = parseCampaignContent(initialData?.content)

  const savedAudienceConfig = parseAudienceConfig(initialData?.audienceConfig)
  const initialCombinedMode =
    initialData?.recipientType === 'combined' || Boolean(savedAudienceConfig)

  const [blocks, setBlocks] = useState<CampaignBlock[]>(existingBlocks || [])

  const [form, setForm] = useState({
    title: initialData?.title || '',
    subject: initialData?.subject || '',
    previewText: initialData?.previewText || '',
    body: initialData?.body || '',
    fromEmail: initialData?.fromEmail || '',
    recipientType:
      initialData?.recipientType && initialData.recipientType !== 'combined'
        ? initialData.recipientType
        : 'all_contacts',
    recipientEventId: initialData?.recipientEventId || '',
    manualEmails:
      initialData?.recipientType === 'manual_list'
        ? initialData?.manualEmails || ''
        : '',
  })

  const [useCombinedAudience, setUseCombinedAudience] =
    useState(initialCombinedMode)

  const [audienceConfig, setAudienceConfig] = useState<AudienceConfig>(
    savedAudienceConfig || emptyAudienceConfig()
  )

  const isLockedCampaign =
    initialData?.status === 'Sent' || initialData?.status === 'Sending' || initialData?.status === 'Scheduled'

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recipientPreview, setRecipientPreview] =
    useState<RecipientPreview | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const previewHtml = useMemo(
    () => renderCampaignHtml(blocks.length ? blocks : undefined, form.body),
    [blocks, form.body]
  )

  const change = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm({ ...form, [event.target.name]: event.target.value })

  const updateBlock = (id: string, patch: Partial<CampaignBlock>) =>
    setBlocks((current) =>
      current.map((block) =>
        block.id === id ? ({ ...block, ...patch } as CampaignBlock) : block
      )
    )

  const move = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return

    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBlocks(next)
  }

  const add = (type: CampaignBlock['type']) =>
    setBlocks([
      ...blocks,
      type === 'text'
        ? { id: blockId(), type, heading: '', body: '' }
        : type === 'button'
          ? { id: blockId(), type, label: '', url: '' }
          : {
              id: blockId(),
              type,
              imageUrl: '',
              altText: '',
              linkUrl: '',
              caption: '',
            },
    ])

  function toggleAudienceArray(
    key: 'segments' | 'eventIds' | 'externalContactListIds',
    value: string
  ) {
    setAudienceConfig((current) => {
      const existing = current[key]
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value]

      return {
        ...current,
        [key]: next,
      }
    })
  }

  function toggleCategoryYear(segment: string, year: number) {
    setAudienceConfig((current) => {
      const existingYears = current.categoryYears[segment] || []
      const nextYears = existingYears.includes(year)
        ? existingYears.filter((y) => y !== year)
        : [...existingYears, year]

      return {
        ...current,
        categoryYears: { ...current.categoryYears, [segment]: nextYears },
      }
    })
  }

  function setSegmentAllYears(segment: string) {
    setAudienceConfig((current) => ({
      ...current,
      categoryYears: { ...current.categoryYears, [segment]: [] },
    }))
  }

  function buildAudiencePayload() {
    if (useCombinedAudience) {
      return {
        recipientType: 'combined',
        recipientEventId: '',
        manualEmails: '',
        audienceConfig,
      }
    }

    return {
      recipientType: form.recipientType,
      recipientEventId: form.recipientEventId,
      manualEmails: form.manualEmails,
      audienceConfig: null,
    }
  }

  async function fetchPreview() {
    setBusy(true)
    setMessage('')
    setShowPreview(false)

    if (useCombinedAudience && !audienceHasSelection(audienceConfig)) {
      setBusy(false)
      return setMessage('Choose at least one audience source.')
    }

    const res = await fetch('/api/campaigns/preview-recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAudiencePayload()),
    })

    const data = await res.json()

    setBusy(false)

    if (!res.ok) return setMessage(data.error || 'Preview failed.')

    setRecipientPreview(data)
    setShowPreview(true)
  }

  async function save(status = 'Draft') {
    if (isLockedCampaign) {
      return setMessage(
        'This campaign is locked because it has already been sent, scheduled, or is sending. Duplicate it to make a new draft.'
      )
    }

    setBusy(true)
    setMessage('')

    const blockError = validateBlocksForClient(blocks)
    if (blockError) {
      setBusy(false)
      return setMessage(blockError)
    }

    if (useCombinedAudience && !audienceHasSelection(audienceConfig)) {
      setBusy(false)
      return setMessage('Choose at least one audience source.')
    }

    const audiencePayload = buildAudiencePayload()

    if (status === 'Sending') {
      const previewRes = await fetch('/api/campaigns/preview-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audiencePayload),
      })

      const previewData = await previewRes.json()

      if (!previewRes.ok || previewData.total === 0) {
        setBusy(false)
        return setMessage('This campaign has no valid recipients.')
      }
    }

    const saveStatus = status === 'Sending' ? 'Draft' : status

    const payload = {
      ...form,
      ...audiencePayload,
      content: blocks.length ? blocks : undefined,
      status: saveStatus,
    }

    const url = initialData ? '/api/campaigns/' + initialData.id : '/api/campaigns'

    const response = await fetch(url, {
      method: initialData ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      setBusy(false)
      return setMessage(result.error || 'Unable to save this campaign.')
    }

    if (status === 'Sending') {
      const sendUrl = '/api/campaigns/' + result.id + '/send'
      const sent = await fetch(sendUrl, { method: 'POST' })
      const sendResult = await sent.json()

      setBusy(false)

      if (!sent.ok) {
        return setMessage(
          'Campaign saved, but send failed: ' +
            (sendResult.error || 'Unknown error')
        )
      }

      router.push('/admin/campaigns')
    } else {
      setBusy(false)
      router.push('/admin/campaigns')
    }
  }

  async function upload(file: File, id: string) {
    setBusy(true)
    setMessage('Uploading picture...')

    const data = new FormData()
    data.set('file', file)

    try {
      const response = await fetch('/api/admin/campaign-images', {
        method: 'POST',
        body: data,
      })

      const result = await response.json()

      if (!response.ok) {
        setBusy(false)
        setMessage(result.error || 'Picture upload failed.')
        return
      }

      const uploadedUrl = String(result.url || '').trim()

      if (!isHttpUrl(uploadedUrl)) {
        setBusy(false)
        setMessage('Picture upload did not return a valid http/https URL.')
        return
      }

      const fallbackAlt =
        fileNameToAltText(file.name) || 'Encuerado campaign picture'

      setBlocks((current) =>
        current.map((block) => {
          if (block.id !== id || block.type !== 'image') return block

          return {
            ...block,
            imageUrl: uploadedUrl,
            altText: block.altText.trim() ? block.altText : fallbackAlt,
          }
        })
      )

      setBusy(false)
      setMessage('Picture uploaded. Review the alternative text before sending.')
    } catch {
      setBusy(false)
      setMessage('Network error. Please check your connection and try again.')
    }
  }

  async function sendTest() {
    const to = window.prompt('Test recipient email')
    if (!to) return

    const blockError = validateBlocksForClient(blocks)
    if (blockError) return setMessage(blockError)

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: form.subject,
          body: form.body,
          content: blocks.length ? blocks : undefined,
          campaignId: initialData?.id || 'test',
        }),
      })

      let result
      try {
        result = await response.json()
      } catch {
        result = { error: 'Invalid response from server.' }
      }

      setBusy(false)

      if (response.ok) setMessage('Test email sent.')
      else setMessage(result.error || 'Test email failed with status ' + response.status)
    } catch {
      setBusy(false)
      setMessage('Test email could not be sent due to a network error.')
    }
  }

  return (
    <div className="grid gap-8">
      {isLockedCampaign && (
        <div className="rounded-xl border border-[#B11218] bg-yellow-950/40 p-4 text-yellow-100">
          <div className="font-bold">Campaign locked</div>
          <p className="mt-1 text-sm">
            This campaign has already been sent, scheduled, or is currently sending. Duplicate it from the campaign list to create a new editable draft.
          </p>
        </div>
      )}

      <div className="grid gap-5">
        <label className="grid gap-2">
          <span className="font-bold">Campaign Title</span>
          <input
            name="title"
            value={form.title}
            onChange={change}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <span className="font-bold">Subject</span>
          <input
            name="subject"
            value={form.subject}
            onChange={change}
            required
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <span className="font-bold">Preview Text</span>
          <input
            name="previewText"
            value={form.previewText}
            onChange={change}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <span className="font-bold">From Email</span>
          <input
            name="fromEmail"
            value={form.fromEmail}
            onChange={change}
            className={inputClass}
          />
        </label>

        <section className="grid gap-4 rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5">
          <div>
            <h2 className="text-2xl font-bold text-white">Audience</h2>
            <p className="mt-1 text-sm text-[#B7B7B7]">
              Choose one source, or combine multiple segments and saved lists.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setUseCombinedAudience(false)}
              className={
                !useCombinedAudience
                  ? 'rounded-lg bg-[#B11218] px-4 py-3 font-bold text-white'
                  : 'rounded-lg border border-[#3A1215] px-4 py-3 font-bold text-white hover:border-[#B11218]'
              }
            >
              Single Source
            </button>

            <button
              type="button"
              onClick={() => setUseCombinedAudience(true)}
              className={
                useCombinedAudience
                  ? 'rounded-lg bg-[#B11218] px-4 py-3 font-bold text-white'
                  : 'rounded-lg border border-[#3A1215] px-4 py-3 font-bold text-white hover:border-[#B11218]'
              }
            >
              Combined Audience
            </button>
          </div>

          {!useCombinedAudience && (
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-bold">Recipient Type</span>
                <select
                  name="recipientType"
                  value={form.recipientType}
                  onChange={change}
                  className={inputClass}
                >
                  <option value="all_contacts">All Contacts</option>
                  <option value="past_attendees">Past Attendees</option>
                  <option value="specific_event">Attendees from Specific Event</option>
                  <option value="volunteers">Volunteers</option>
                  <option value="external_contact_list">External Contact List</option>
                  <option value="manual_list">Manual List</option>
                </select>
              </label>

              {form.recipientType === 'specific_event' && (
                <label className="grid gap-2">
                  <span className="font-bold">Select Event</span>
                  <select
                    name="recipientEventId"
                    value={form.recipientEventId}
                    onChange={change}
                    className={inputClass}
                  >
                    <option value="">Choose...</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.recipientType === 'external_contact_list' && (
                <label className="grid gap-2">
                  <span className="font-bold">Select External Contact List</span>
                  <select
                    name="recipientEventId"
                    value={form.recipientEventId}
                    onChange={change}
                    className={inputClass}
                  >
                    <option value="">Choose...</option>
                    {externalContactLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.recipientType === 'manual_list' && (
                <label className="grid gap-2">
                  <span className="font-bold">Manual Emails</span>
                  <textarea
                    name="manualEmails"
                    value={form.manualEmails}
                    onChange={change}
                    rows={4}
                    className={inputClass}
                  />
                </label>
              )}
            </div>
          )}

          {useCombinedAudience && (
            <div className="grid gap-5">
              <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
                <h3 className="font-bold text-white">Segments</h3>
                <p className="mt-1 text-sm text-[#8F8F8F]">
                  Pick who to reach. For Attendees, Volunteers, and Sponsors you can
                  limit to specific years, or leave it on All Years to reach everyone
                  regardless of when they participated.
                </p>
                <div className="mt-3 grid gap-3">
                  {AUDIENCE_CATEGORIES.map(({ value, label, yearAware }) => {
                    const checked = audienceConfig.segments.includes(value)
                    const selectedYears = audienceConfig.categoryYears[value] || []
                    const isAllYears = selectedYears.length === 0

                    return (
                      <div
                        key={value}
                        className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-3"
                      >
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAudienceArray('segments', value)}
                          />
                          <span className="font-bold text-white">{label}</span>
                        </label>

                        {checked && yearAware && (
                          <div className="mt-3 flex flex-wrap gap-2 pl-7">
                            <button
                              type="button"
                              onClick={() => setSegmentAllYears(value)}
                              className={
                                isAllYears
                                  ? 'rounded-full bg-[#B11218] px-3 py-1 text-xs font-bold text-white'
                                  : 'rounded-full border border-[#3A1215] px-3 py-1 text-xs font-bold text-white hover:border-[#B11218]'
                              }
                            >
                              All Years
                            </button>

                            {availableYears.length === 0 && (
                              <span className="text-xs text-[#8F8F8F]">
                                No year-tagged records found yet.
                              </span>
                            )}

                            {availableYears.map((year) => (
                              <button
                                key={year}
                                type="button"
                                onClick={() => toggleCategoryYear(value, year)}
                                className={
                                  selectedYears.includes(year)
                                    ? 'rounded-full bg-[#B11218] px-3 py-1 text-xs font-bold text-white'
                                    : 'rounded-full border border-[#3A1215] px-3 py-1 text-xs font-bold text-white hover:border-[#B11218]'
                                }
                              >
                                {year}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
                <h3 className="font-bold text-white">Event Audiences</h3>
                <p className="mt-1 text-sm text-[#8F8F8F]">
                  Select one or more event registration lists.
                </p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="text-sm text-[#8F8F8F]">No events found.</p>
                  ) : (
                    events.map((event) => (
                      <label
                        key={event.id}
                        className="flex items-center gap-3 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-3"
                      >
                        <input
                          type="checkbox"
                          checked={audienceConfig.eventIds.includes(event.id)}
                          onChange={() => toggleAudienceArray('eventIds', event.id)}
                        />
                        <span className="font-bold text-white">{event.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
                <h3 className="font-bold text-white">Saved Contact Lists</h3>
                <p className="mt-1 text-sm text-[#8F8F8F]">
                  Select one or more imported/saved lists, like Weekend Crew or Latrine Duty lists.
                </p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">
                  {externalContactLists.length === 0 ? (
                    <p className="text-sm text-[#8F8F8F]">No saved lists found.</p>
                  ) : (
                    externalContactLists.map((list) => (
                      <label
                        key={list.id}
                        className="flex items-center gap-3 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-3"
                      >
                        <input
                          type="checkbox"
                          checked={audienceConfig.externalContactListIds.includes(list.id)}
                          onChange={() =>
                            toggleAudienceArray('externalContactListIds', list.id)
                          }
                        />
                        <span className="font-bold text-white">{list.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <label className="grid gap-2">
                <span className="font-bold">Manual Extra Emails</span>
                <textarea
                  value={audienceConfig.manualEmails}
                  onChange={(event) =>
                    setAudienceConfig({
                      ...audienceConfig,
                      manualEmails: event.target.value,
                    })
                  }
                  rows={4}
                  className={inputClass}
                  placeholder="Optional. Add extra emails separated by commas, spaces, or new lines."
                />
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={busy || isLockedCampaign}
            onClick={fetchPreview}
            className="rounded-lg border border-[#B11218] px-4 py-2 font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
          >
            {busy ? 'Working...' : 'Preview Recipients'}
          </button>

          {showPreview && recipientPreview && (
            <div className="rounded-xl border border-[#3A1215] bg-[#151111] p-5">
              <h2 className="text-xl font-bold text-white">Recipient Preview</h2>
              <div className="mt-2 grid gap-1 text-sm text-[#B7B7B7]">
                <div>
                  <span className="font-bold">Source:</span>{' '}
                  {recipientPreview.sourceLabel}
                </div>
                <div>
                  <span className="font-bold">Total valid:</span>{' '}
                  {recipientPreview.total}
                </div>
                {recipientPreview.duplicateCount > 0 && (
                  <div>
                    <span className="font-bold">Duplicates removed:</span>{' '}
                    {recipientPreview.duplicateCount}
                  </div>
                )}
                {recipientPreview.invalidCount > 0 && (
                  <div>
                    <span className="font-bold">Invalid emails skipped:</span>{' '}
                    {recipientPreview.invalidCount}
                  </div>
                )}
                {recipientPreview.optedOutCount > 0 && (
                  <div>
                    <span className="font-bold">Opt-outs excluded:</span>{' '}
                    {recipientPreview.optedOutCount}
                  </div>
                )}
                {recipientPreview.inactiveCount > 0 && (
                  <div>
                    <span className="font-bold">Archived/inactive skipped:</span>{' '}
                    {recipientPreview.inactiveCount}
                  </div>
                )}
              </div>

              {recipientPreview.sample.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-bold text-white">
                    Sample first 25:
                  </div>
                  <div className="mt-1 max-h-64 overflow-y-auto rounded-lg bg-[#0B0B0B] p-3 text-sm text-[#B7B7B7]">
                    {recipientPreview.sample.map((r, i) => (
                      <div key={i} className="flex flex-wrap gap-2">
                        <span>{r.email}</span>
                        {r.name && <span className="text-[#8F8F8F]">({r.name})</span>}
                        <span className="text-[#777777]">- {r.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {initialData && !existingBlocks && (
        <div className="rounded-lg border border-[#3A1215] bg-[#151111] p-4 text-[#B7B7B7]">
          This is a legacy campaign. Its existing email body is preserved and will
          continue to send unchanged.
        </div>
      )}

      <section className="grid gap-4 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-5">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => add('text')}
            className="rounded-lg bg-[#B11218] px-4 py-2 font-bold text-white"
          >
            Add Text
          </button>
          <button
            type="button"
            onClick={() => add('button')}
            className="rounded-lg border border-[#B11218] px-4 py-2 font-bold text-[#B11218]"
          >
            Add Button/Link
          </button>
          <button
            type="button"
            onClick={() => add('image')}
            className="rounded-lg border border-[#B11218] px-4 py-2 font-bold text-[#B11218]"
          >
            Add Picture
          </button>
        </div>

        {blocks.map((block, index) => (
          <div
            key={block.id}
            className="grid gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4"
          >
            <div className="flex items-center justify-between">
              <strong>
                {block.type === 'text'
                  ? 'Text'
                  : block.type === 'button'
                    ? 'Button/Link'
                    : 'Picture'}
              </strong>

              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={!index}
                  className="rounded border border-[#3A1215] px-2 py-1 text-sm"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === blocks.length - 1}
                  className="rounded border border-[#3A1215] px-2 py-1 text-sm"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => setBlocks(blocks.filter((item) => item.id !== block.id))}
                  className="rounded border border-red-500 px-2 py-1 text-sm text-red-200"
                >
                  Delete
                </button>
              </span>
            </div>

            {block.type === 'text' && (
              <>
                <input
                  placeholder="Optional heading"
                  value={block.heading || ''}
                  onChange={(event) =>
                    updateBlock(block.id, { heading: event.target.value })
                  }
                  className={inputClass}
                />
                <textarea
                  placeholder="Paragraph text"
                  value={block.body}
                  onChange={(event) =>
                    updateBlock(block.id, { body: event.target.value })
                  }
                  rows={5}
                  className={inputClass}
                />
              </>
            )}

            {block.type === 'button' && (
              <>
                <input
                  placeholder="Button Text"
                  value={block.label}
                  onChange={(event) =>
                    updateBlock(block.id, { label: event.target.value })
                  }
                  className={inputClass}
                />
                <input
                  placeholder="Website URL"
                  value={block.url}
                  onChange={(event) =>
                    updateBlock(block.id, { url: event.target.value })
                  }
                  className={inputClass}
                />
              </>
            )}

            {block.type === 'image' && (
              <>
                <div className="grid gap-2">
                  <span className="font-bold text-white">
                    Upload from Device
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) upload(file, block.id)
                    }}
                    className="block w-full text-sm text-[#B7B7B7] file:mr-4 file:rounded-lg file:border-0 file:bg-[#B11218] file:px-4 file:py-2 file:font-bold file:text-white hover:file:bg-yellow-300"
                  />
                  <p className="text-xs text-[#8F8F8F]">
                    Choose an image from your phone, tablet, or computer.
                  </p>
                </div>

                <div className="grid gap-1">
                  <span className="text-sm font-bold text-[#B7B7B7]">
                    Or paste a picture URL
                  </span>
                  <input
                    placeholder="Paste image URL here"
                    value={block.imageUrl}
                    onChange={(event) =>
                      updateBlock(block.id, { imageUrl: event.target.value })
                    }
                    className={inputClass}
                  />
                </div>

                <span className="text-sm font-bold text-[#B7B7B7]">
                  Alternative Text required
                </span>
                <input
                  placeholder="Describe this picture for accessibility"
                  value={block.altText}
                  onChange={(event) =>
                    updateBlock(block.id, { altText: event.target.value })
                  }
                  className={inputClass}
                />

                <input
                  placeholder="Optional clickable website URL"
                  value={block.linkUrl || ''}
                  onChange={(event) =>
                    updateBlock(block.id, { linkUrl: event.target.value })
                  }
                  className={inputClass}
                />

                <input
                  placeholder="Caption"
                  value={block.caption || ''}
                  onChange={(event) =>
                    updateBlock(block.id, { caption: event.target.value })
                  }
                  className={inputClass}
                />

                {block.imageUrl && (
                  <img
                    src={block.imageUrl}
                    alt={block.altText || 'Picture preview'}
                    className="max-h-48 max-w-full object-contain"
                  />
                )}
              </>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-bold">Preview</h2>
        <div
          className="max-w-[600px] bg-white p-4 text-black"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </section>

      {message && <p className="font-bold text-[#B11218]">{message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || isLockedCampaign}
          onClick={() => save()}
          className="rounded-lg bg-[#2A0E10] px-4 py-3 font-bold"
        >
          Save Draft
        </button>
        <button
          type="button"
          disabled={busy || isLockedCampaign}
          onClick={sendTest}
          className="rounded-lg border border-[#B11218] px-4 py-3 font-bold text-[#B11218]"
        >
          Send Test Email
        </button>
        <button
          type="button"
          disabled={busy || isLockedCampaign}
          onClick={() => save('Sending')}
          className="rounded-lg bg-[#B11218] px-4 py-3 font-bold text-white"
        >
          Schedule Send
        </button>
      </div>
    </div>
  )
}
