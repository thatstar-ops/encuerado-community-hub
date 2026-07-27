/**
 * Shared timezone helpers for volunteer shifts.
 * All volunteer shift times MUST use America/Los_Angeles.
 */

export const EVENT_TIME_ZONE = 'America/Los_Angeles'

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * Convert a stored UTC Date into a "YYYY-MM-DDTHH:mm" string
 * representing the wall-clock time in Los Angeles.
 * Used to pre-fill <input type="datetime-local">.
 */
export function dateToEventDateTimeLocalValue(date: Date | null): string {
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  let hour = get('hour')

  // Some runtimes can format midnight as 24:00. datetime-local expects 00:00.
  if (hour === '24') hour = '00'

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

function offsetMinutesForTimeZone(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date)

  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || ''
  const match = offsetPart.match(/GMT([+-])(\d{2}):?(\d{2})?/)

  if (!match) {
    throw new Error(`Cannot parse ${EVENT_TIME_ZONE} offset: ${offsetPart}`)
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] || 0)

  return sign * (hours * 60 + minutes)
}

/**
 * Parse a "YYYY-MM-DDTHH:mm" value that represents Los Angeles wall-clock time
 * into the real UTC Date.
 *
 * Do not use new Date(value) for datetime-local values. That interprets the
 * value using the server/browser local timezone instead of America/Los_Angeles.
 */
export function eventDateTimeLocalToUtcDate(localValue: string): Date {
  const cleanValue = String(localValue || '').trim()

  if (!DATETIME_LOCAL_PATTERN.test(cleanValue)) {
    throw new Error('Invalid datetime-local value. Expected YYYY-MM-DDTHH:mm.')
  }

  const [datePart, timePart] = cleanValue.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute)

  // First pass: estimate with offset at the naive instant.
  let offset = offsetMinutesForTimeZone(new Date(naiveUtcMs))
  let realUtcMs = naiveUtcMs - offset * 60 * 1000

  // Second pass: handle DST boundary changes more safely.
  const correctedOffset = offsetMinutesForTimeZone(new Date(realUtcMs))
  if (correctedOffset !== offset) {
    realUtcMs = naiveUtcMs - correctedOffset * 60 * 1000
  }

  const result = new Date(realUtcMs)

  if (dateToEventDateTimeLocalValue(result) !== cleanValue) {
    throw new Error(`Could not safely convert ${cleanValue} in ${EVENT_TIME_ZONE}.`)
  }

  return result
}

/**
 * Accept either a datetime-local LA wall-clock string or a real ISO timestamp.
 * Use this for server actions that may receive values from forms or client components.
 */
export function parseEventDateInput(value: string): Date {
  const cleanValue = String(value || '').trim()

  if (!cleanValue) {
    throw new Error('Date/time value is required.')
  }

  if (DATETIME_LOCAL_PATTERN.test(cleanValue)) {
    return eventDateTimeLocalToUtcDate(cleanValue)
  }

  const date = new Date(cleanValue)

  if (Number.isNaN(date.valueOf())) {
    throw new Error('Invalid date/time value.')
  }

  return date
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Returns the LA wall-clock date key "YYYY-MM-DD" for a given UTC Date.
 */
export function getEventDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Returns the LA wall-clock hour (0-23) for a given UTC Date.
 */
export function getEventHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = parts.find((p) => p.type === 'hour')?.value || '0'
  return Number(hour === '24' ? '0' : hour)
}

/**
 * Combine a date key "YYYY-MM-DD" and an hour (0-23) into a datetime-local value.
 * Example: eventDateKeyAndHourToDateTimeLocal('2026-09-03', 17) → '2026-09-03T17:00'
 */
export function eventDateKeyAndHourToDateTimeLocal(dateKey: string, hour: number): string {
  return `${dateKey}T${String(hour).padStart(2, '0')}:00`
}