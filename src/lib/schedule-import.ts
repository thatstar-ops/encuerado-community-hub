import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { put } from '@vercel/blob'
import * as cheerio from 'cheerio'

export const SCHEDULE_URL = 'https://www.encueradoweekend.com/schedule'
export const SCHEDULE_SOURCE_LABEL = 'Original Encuerado Schedule'
const IMAGE_HOST = 'f5612f3afb86ee00d6f9.cdn6.editmysite.com'
const SCHEDULE_HTML_LIMIT_BYTES = 2_000_000
const FLYER_LIMIT_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const FLYER_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 3
const SCHEDULE_TIME_ZONE = 'America/Los_Angeles'

const FLYER_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const DATE_RANGE_PATTERN = /(?:Thurs?|Friday|Saturday|Sunday)[^@]*?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|\u2013|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i

export type ScheduleSourceMode = 'automatic' | 'fallback'
export type FlyerHandling = 'copy' | 'external' | 'none'
export type PreviewStatus =
  | 'New Event'
  | 'Already Imported'
  | 'Possible Existing Match'
  | 'Update Available'
  | 'Invalid or Incomplete'
  | 'Needs Review'
export type ScheduleUpdateField = 'title' | 'description' | 'location' | 'startAt' | 'endAt' | 'flyerUrl' | 'sourceUrl'
export type DuplicateReason = 'Exact externalKey' | 'Existing sourceUrl' | 'Normalized title plus event start date'

export type ScheduleEvent = {
  title: string
  description: string
  location: string
  sourceDateText: string
  startAt: string
  endAt: string
  overnight: boolean
  flyerUrl: string
  sourceUrl: string
  externalKey: string
  extraction: 'automatic' | 'last verified schedule data' | 'manual'
  extractionLabel?: 'Automatically Extracted' | 'Manual Fallback' | 'Manually Added'
  warnings: string[]
}

export type FlyerCopyResult =
  | { ok: true; url: string; storage: 'blob'; contentType: string; byteLength: number }
  | { ok: false; error: string; fallbackUrl?: string }

export type ExistingScheduleEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  flyerImageUrl: string | null
  sourceUrl: string | null
  externalKey: string | null
}

export const scheduleComparisonFields = [
  ['title', 'title'],
  ['description', 'description'],
  ['location', 'location'],
  ['startAt', 'start time'],
  ['endAt', 'end time'],
  ['flyerUrl', 'flyer'],
  ['sourceUrl', 'source URL'],
] as const

const fallback = [
  ['ATAME/VPL Crossover', 'Thurs, September 3rd, 6pm - 2am', 'PRECINCT LA', 'Bondage & Discipline Party, play with the contestants of Los Angeles Mr Cuero 2026.', 'ATAME_1781125889.jpeg'],
  ['Primer impacto', 'Friday, September 4th, 8pm-2 am', 'The Vidal Colab', 'This is your chance to flog or get flogged by the contestants of Los Angeles Mr Cuero 2026!', '2026-06-10_15-47-47_1781131697.jpg'],
  ['aguas frescas wet play party', 'Saturday, September 5th, 2pm-6pm', 'ROUGH TRADE GEAR LA', 'Come soak yourself in all the fun and get a chance to play with the contestants of Los Angeles Mr Cuero 2026.', 'AGUAS FRESCAS_1781126251.jpeg'],
  ['Mr cuero contest & after party at vidal collective in echo park', 'Sunday, September 6th, 8pm-3 am', 'VIDAL COLLECTIVE IN ECHO PARK', "You are our judges, that's right! The winner of Los Angeles Mr Cuero 2025 will be selected by the audience. Come early to the contest, vote for your favorite and then stick around for the AFTER PARTY celebration until 3 am", 'mr cuero_1781126864.png'],
]

export function clean(value: string) { return value.replace(/\s+/g, ' ').trim() }
export function normalizeEventTitle(value: string) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
export function eventStartDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
export function validateScheduleEvent(event: ScheduleEvent) {
  const errors: string[] = []
  if (!event.title.trim() || event.title.length > 200) errors.push('Title must be present and 200 characters or fewer.')
  if (!event.description.trim() || event.description.length > 10_000) errors.push('Description must be present and 10,000 characters or fewer.')
  if (!event.location.trim() || event.location.length > 500) errors.push('Location must be present and 500 characters or fewer.')
  if (!safeHttpUrl(event.sourceUrl) || event.sourceUrl !== SCHEDULE_URL) errors.push('Source URL must be the approved Encuerado schedule source.')
  if (!event.externalKey.trim() || event.externalKey.length > 300) errors.push('External key is missing or too long.')
  if (event.flyerUrl && !safeHttpUrl(event.flyerUrl)) errors.push('Flyer URL must be a valid http or https URL.')
  const startsAt = new Date(event.startAt)
  const endsAt = new Date(event.endAt)
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) errors.push('Start and end times must be valid dates.')
  if (!Number.isNaN(startsAt.valueOf()) && !Number.isNaN(endsAt.valueOf()) && endsAt <= startsAt) errors.push('End time must be after start time.')
  return errors
}

export function sameTitleAndStartDate(event: ScheduleEvent, existing: ExistingScheduleEvent) {
  return normalizeEventTitle(existing.title) === normalizeEventTitle(event.title) && eventStartDate(existing.startsAt) === eventStartDate(event.startAt)
}

export function findScheduleDuplicate(event: ScheduleEvent, existingEvents: ExistingScheduleEvent[]) {
  const exactExternalKey = existingEvents.find((existing) => existing.externalKey && existing.externalKey === event.externalKey)
  if (exactExternalKey) return { event: exactExternalKey, reason: 'Exact externalKey' as DuplicateReason }

  const sourceUrlMatch = existingEvents.find((existing) => existing.sourceUrl === event.sourceUrl && (
    normalizeEventTitle(existing.title) === normalizeEventTitle(event.title) ||
    eventStartDate(existing.startsAt) === eventStartDate(event.startAt)
  ))
  if (sourceUrlMatch) return { event: sourceUrlMatch, reason: 'Existing sourceUrl' as DuplicateReason }

  const titleAndDateMatch = existingEvents.find((existing) => sameTitleAndStartDate(event, existing))
  if (titleAndDateMatch) return { event: titleAndDateMatch, reason: 'Normalized title plus event start date' as DuplicateReason }

  return null
}

function comparisonValue(field: ScheduleUpdateField, event: ScheduleEvent, existing: ExistingScheduleEvent) {
  if (field === 'title') return { source: event.title, current: existing.title }
  if (field === 'description') return { source: event.description, current: existing.description || '' }
  if (field === 'location') return { source: event.location, current: existing.location || '' }
  if (field === 'startAt') return { source: event.startAt, current: existing.startsAt.toISOString() }
  if (field === 'endAt') return { source: event.endAt, current: existing.endsAt?.toISOString() || '' }
  if (field === 'flyerUrl') return { source: event.flyerUrl, current: existing.flyerImageUrl || '' }
  return { source: event.sourceUrl, current: existing.sourceUrl || '' }
}

export function buildScheduleComparisons(event: ScheduleEvent, existing: ExistingScheduleEvent) {
  return scheduleComparisonFields.map(([field, label]) => {
    const value = comparisonValue(field, event, existing)
    return {
      field,
      label,
      source: value.source,
      current: value.current,
      changed: value.source !== value.current,
    }
  })
}

export function buildSchedulePreviewEvent(event: ScheduleEvent, existingEvents: ExistingScheduleEvent[], options: { blobTokenConfigured?: boolean } = {}) {
  const validationErrors = validateScheduleEvent(event)
  const warnings = [...event.warnings]
  if (event.flyerUrl && options.blobTokenConfigured === false) {
    warnings.push('BLOB_READ_WRITE_TOKEN is not configured. Copy Flyer to Storage will fail unless storage is configured; Use External Flyer remains available after validation.')
  }
  const duplicate = findScheduleDuplicate(event, existingEvents)
  const comparisons = duplicate ? buildScheduleComparisons(event, duplicate.event) : []
  const hasChanges = comparisons.some((comparison) => comparison.changed)
  let duplicateStatus: PreviewStatus = 'New Event'

  if (validationErrors.length) duplicateStatus = 'Invalid or Incomplete'
  else if (duplicate?.reason === 'Exact externalKey' || duplicate?.reason === 'Existing sourceUrl') duplicateStatus = hasChanges ? 'Update Available' : 'Already Imported'
  else if (duplicate) duplicateStatus = 'Possible Existing Match'
  else if (event.extraction !== 'automatic' || event.warnings.length) duplicateStatus = 'Needs Review'

  return {
    ...event,
    warnings,
    duplicateStatus,
    validationErrors,
    duplicateMatch: duplicate ? {
      id: duplicate.event.id,
      title: duplicate.event.title,
      startsAt: duplicate.event.startsAt.toISOString(),
      reason: duplicate.reason,
    } : null,
    comparisons,
  }
}
function imageUrl(file: string) { return 'https://' + IMAGE_HOST + '/uploads/b/f5612f3afb86ee00d6f94e869f6b02c5f39acd4f31bc0bfc033376e5652146dd/' + encodeURIComponent(file) + '?width=2400&optimize=medium' }
function time24(value: string) {
  const match = value.toLowerCase().replace(/\s/g, '').match(/(\d{1,2})(?::(\d{2}))?(am|pm)/)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3] === 'pm') hour += 12
  return { hour, minute: Number(match[2] || 0) }
}
function eventDates(sourceDateText: string, year: number) {
  const month = sourceDateText.match(/september\s+(\d{1,2})/i)
  const times = sourceDateText.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi) || []
  if (!month || times.length < 2) return null
  const firstTime = times[0]
  const secondTime = times[1]
  if (!firstTime || !secondTime) return null
  const startTime = time24(firstTime); const endTime = time24(secondTime)
  if (!startTime || !endTime) return null
  const day = Number(month[1])
  const start = new Date(Date.UTC(year, 8, day, startTime.hour + 7, startTime.minute))
  const overnight = endTime.hour * 60 + endTime.minute <= startTime.hour * 60 + startTime.minute
  const end = new Date(Date.UTC(year, 8, day + (overnight ? 1 : 0), endTime.hour + 7, endTime.minute))
  return { startAt: start.toISOString(), endAt: end.toISOString(), overnight }
}
function key(title: string, startAt: string) { return 'encueradoweekend.com:' + clean(title).toLowerCase().replace(/[^a-z0-9]+/g, '-') + ':' + eventStartDate(startAt) }
function fromValues(title: string, sourceDateText: string, location: string, description: string, flyerUrl: string, extraction: ScheduleEvent['extraction'], year = 2026): ScheduleEvent | null {
  const dates = eventDates(sourceDateText, year)
  if (!dates) return null
  const warnings = description.includes('2025') && year === 2026 ? ['Source description mentions 2025 while the page context is 2026. Review before importing.'] : []
  return {
    title: clean(title),
    description: clean(description),
    location: clean(location),
    sourceDateText: clean(sourceDateText),
    startAt: dates.startAt,
    endAt: dates.endAt,
    overnight: dates.overnight,
    flyerUrl: safeHttpUrl(flyerUrl) || '',
    sourceUrl: SCHEDULE_URL,
    externalKey: key(title, dates.startAt),
    extraction,
    extractionLabel: extraction === 'automatic' ? 'Automatically Extracted' : 'Manual Fallback',
    warnings,
  }
}

export function lastVerifiedScheduleData() {
  return fallback.map((item) => fromValues(item[0], item[1], item[2], item[3], imageUrl(item[4]), 'last verified schedule data')).filter(Boolean) as ScheduleEvent[]
}

async function readLimitedResponse(response: Response, byteLimit: number) {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > byteLimit) throw new Error('The response was too large to import safely.')

  if (!response.body) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > byteLimit) throw new Error('The response was too large to import safely.')
    return new Uint8Array(buffer)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    if (received > byteLimit) throw new Error('The response was too large to import safely.')
    chunks.push(value)
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function isPrivateAddress(address: string) {
  const version = isIP(address)
  if (version === 4) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  }
  return true
}

async function assertPublicFetchUrl(value: string) {
  const normalized = safeHttpUrl(value)
  if (!normalized) throw new Error('Only http and https URLs are allowed.')
  const url = new URL(normalized)
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Localhost URLs are not allowed.')
  if (host === '169.254.169.254') throw new Error('Metadata endpoint URLs are not allowed.')
  if (isIP(host) && isPrivateAddress(host)) throw new Error('Private network URLs are not allowed.')

  const addresses = await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((address) => isPrivateAddress(address.address))) {
    throw new Error('Private network URLs are not allowed.')
  }
  return normalized
}

async function fetchWithSafety(value: string, options: { timeoutMs: number; byteLimit: number; accept: 'html' | 'image' }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    let url = await assertPublicFetchUrl(value)
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'EncueradoCommunityHub/1.0' },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error('The remote server redirected without a destination.')
        if (redirects === MAX_REDIRECTS) throw new Error('The remote server redirected too many times.')
        url = await assertPublicFetchUrl(new URL(location, url).toString())
        continue
      }

      if (!response.ok) throw new Error('The remote server returned an error.')
      const contentType = clean((response.headers.get('content-type') || '').split(';')[0].toLowerCase())
      if (options.accept === 'html' && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
        throw new Error('The schedule source did not return HTML.')
      }
      if (options.accept === 'image' && !FLYER_CONTENT_TYPES[contentType]) {
        throw new Error('The flyer must be a JPEG, PNG, or WebP image.')
      }

      const bytes = await readLimitedResponse(response, options.byteLimit)
      return { bytes, contentType, finalUrl: url }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The remote request timed out.')
    throw error
  } finally {
    clearTimeout(timeout)
  }

  throw new Error('The remote request could not be completed.')
}

export async function assertApprovedExternalFlyerUrl(flyerUrl: string, approvedFlyerUrls: string[]) {
  return assertApprovedScheduleFlyerUrl(flyerUrl, approvedFlyerUrls)
}

function approvedFlyerSet(approvedFlyerUrls?: string[]) {
  return new Set((approvedFlyerUrls || []).map((url) => safeHttpUrl(url)).filter(Boolean) as string[])
}

export function isApprovedScheduleFlyerUrl(flyerUrl: string, approvedFlyerUrls?: string[]) {
  const normalizedFlyerUrl = safeHttpUrl(flyerUrl)
  if (!normalizedFlyerUrl) return false
  const approved = approvedFlyerSet(approvedFlyerUrls)
  return approved.size > 0 && approved.has(normalizedFlyerUrl)
}

export async function assertApprovedScheduleFlyerUrl(flyerUrl: string, approvedFlyerUrls?: string[]) {
  const normalizedFlyerUrl = safeHttpUrl(flyerUrl)
  if (!normalizedFlyerUrl) throw new Error('Flyer URL is not a valid http or https URL.')
  if (!isApprovedScheduleFlyerUrl(normalizedFlyerUrl, approvedFlyerUrls)) {
    throw new Error('Flyer URL was not extracted from the approved schedule source or reviewed fallback data.')
  }
  await fetchWithSafety(normalizedFlyerUrl, { timeoutMs: FLYER_TIMEOUT_MS, byteLimit: FLYER_LIMIT_BYTES, accept: 'image' })
  return normalizedFlyerUrl
}

export async function validateExternalFlyerUrl(flyerUrl: string) {
  const normalizedFlyerUrl = safeHttpUrl(flyerUrl)
  if (!normalizedFlyerUrl) throw new Error('Flyer URL is not a valid http or https URL.')
  await fetchWithSafety(normalizedFlyerUrl, { timeoutMs: FLYER_TIMEOUT_MS, byteLimit: FLYER_LIMIT_BYTES, accept: 'image' })
  return normalizedFlyerUrl
}

export async function copyScheduleFlyerToBlob(flyerUrl: string, title: string, approvedFlyerUrls?: string[]): Promise<FlyerCopyResult> {
  const normalizedFlyerUrl = safeHttpUrl(flyerUrl)
  if (!normalizedFlyerUrl) return { ok: false, error: 'Flyer URL is not a valid http or https URL.' }
  if (!isApprovedScheduleFlyerUrl(normalizedFlyerUrl, approvedFlyerUrls)) {
    return { ok: false, error: 'Flyer URL was not extracted from the approved schedule source or reviewed fallback data.' }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: 'BLOB_READ_WRITE_TOKEN is not configured, so the flyer could not be copied to storage.', fallbackUrl: normalizedFlyerUrl }
  }

  let fetched: Awaited<ReturnType<typeof fetchWithSafety>>
  try {
    fetched = await fetchWithSafety(normalizedFlyerUrl, { timeoutMs: FLYER_TIMEOUT_MS, byteLimit: FLYER_LIMIT_BYTES, accept: 'image' })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Flyer validation failed.' }
  }

  try {
    const extension = FLYER_CONTENT_TYPES[fetched.contentType]
    const slug = clean(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'event-flyer'
    const arrayBuffer = fetched.bytes.buffer.slice(fetched.bytes.byteOffset, fetched.bytes.byteOffset + fetched.bytes.byteLength) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: fetched.contentType })
    const pathname = 'event-flyers/' + slug + '-' + crypto.randomUUID() + '.' + extension
    const uploaded = await put(pathname, blob, { access: 'public', addRandomSuffix: false })
    return { ok: true, url: uploaded.url, storage: 'blob', contentType: fetched.contentType, byteLength: fetched.bytes.byteLength }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Flyer upload failed.', fallbackUrl: normalizedFlyerUrl }
  }
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse('"' + value + '"') as string
  } catch {
    return value.replace(/\\n/g, '\n').replace(/\\\//g, '/')
  }
}

function textFromSerializedOps(value: string) {
  const inserts = value.matchAll(/"insert":"((?:\\.|[^"\\])*)"/g)
  return clean(Array.from(inserts).map((match) => decodeJsonString(match[1] || '')).join(' '))
}

function imageFromSerializedBlock(value: string) {
  const match = value.match(/"image":\{"figure":[\s\S]*?"source":"((?:\\.|[^"\\])*)"/)
  if (!match?.[1]) return ''
  try {
    return new URL(decodeJsonString(match[1]), SCHEDULE_URL).toString()
  } catch {
    return ''
  }
}

function eventsFromSerializedBlocks(html: string, pageYear: number) {
  const events: ScheduleEvent[] = []
  const textBlocks = html.matchAll(/"text":\{"content":\{"quill":\{"ops":\[([\s\S]*?)\]\}\}\}/g)

  for (const textMatch of textBlocks) {
    const paragraph = textFromSerializedOps(textMatch[1] || '')
    const dateMatch = paragraph.match(DATE_RANGE_PATTERN)
    if (!dateMatch) continue

    const startIndex = textMatch.index || 0
    const nextBlockIndex = html.indexOf('"repeatables":[{', startIndex + 1)
    const block = html.slice(startIndex, nextBlockIndex > startIndex ? nextBlockIndex : startIndex + 8_000)
    const titleMatch = block.match(/"title":\{[\s\S]*?"content":\{"quill":\{"ops":\[([\s\S]*?)\]\}\}/)
    if (!titleMatch?.[1]) continue
    const title = textFromSerializedOps(titleMatch[1])
    const locationMatch = paragraph.match(/@\s*([^\n.!]+(?:\s+[^\n.!]+)*?)(?=\s{2,}| Bondage| This is| Come soak| You are|$)/i)
    const description = clean(paragraph.replace(dateMatch[0], '').replace(locationMatch?.[0] || '', '').replace(/^Join us,?\s*/i, ''))
    const parsed = title && dateMatch
      ? fromValues(title, dateMatch[0], locationMatch?.[1] || '', description, imageFromSerializedBlock(block), 'automatic', pageYear)
      : null
    if (parsed) events.push(parsed)
  }

  return events
}

export async function fetchSchedule() {
  const fetched = await fetchWithSafety(SCHEDULE_URL, { timeoutMs: FETCH_TIMEOUT_MS, byteLimit: SCHEDULE_HTML_LIMIT_BYTES, accept: 'html' })
  const html = new TextDecoder().decode(fetched.bytes)
  const $ = cheerio.load(html)
  const pageYear = Number((clean($('body').text()).match(/2026/) || [])[0] || 0)
  const images = $('img').map((_, image) => {
    const raw = $(image).attr('src') || $(image).attr('data-src') || $(image).attr('data-original') || ''
    try {
      return new URL(raw, SCHEDULE_URL).toString()
    } catch {
      return ''
    }
  }).get().filter(Boolean)
  let events: ScheduleEvent[] = []
  $('h2').each((index, heading) => {
    const title = clean($(heading).text())
    const paragraph = clean($(heading).nextAll('p').first().text())
    const dateMatch = paragraph.match(DATE_RANGE_PATTERN)
    const locationMatch = paragraph.match(/@\s*([^\n.!]+(?:\s+[^\n.!]+)*?)(?=\s{2,}| Bondage| This is| Come soak| You are|$)/i)
    const description = clean(paragraph.replace(dateMatch?.[0] || '', '').replace(locationMatch?.[0] || '', ''))
    const parsed = title && dateMatch ? fromValues(title, dateMatch[0], locationMatch?.[1] || '', description, images[index + 1] || '', 'automatic', pageYear || 2026) : null
    if (parsed) events.push(parsed)
  })
  if (events.length < 1) events = eventsFromSerializedBlocks(html, pageYear || 2026)
  if (events.length < 1) throw new Error('The schedule layout did not contain importable event data.')
  return events
}

export async function loadScheduleEvents(sourceMode: ScheduleSourceMode) {
  return sourceMode === 'fallback' ? lastVerifiedScheduleData() : fetchSchedule()
}
