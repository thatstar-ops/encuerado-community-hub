import { addHours } from '@/lib/timezone'

/**
 * Generates default and optional suggested shifts for an event.
 * All times are stored as real Date objects, but the UI/server conversion
 * must treat form edits as America/Los_Angeles wall-clock time.
 */

export const DEFAULT_SHIFT_DURATION_HOURS = 3

export interface ShiftSuggestion {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  neededCount: number
  notes: string
  isDefault: boolean
  exists?: boolean
}

function createThreeHourShift({
  id,
  title,
  startsAt,
  neededCount,
  notes,
  isDefault,
}: {
  id: string
  title: string
  startsAt: Date
  neededCount: number
  notes: string
  isDefault: boolean
}): ShiftSuggestion {
  return {
    id,
    title,
    startsAt,
    endsAt: addHours(startsAt, DEFAULT_SHIFT_DURATION_HOURS),
    neededCount,
    notes,
    isDefault,
  }
}

export function generateDefaultSuggestions(
  eventStart: Date,
  eventEnd: Date | null
): ShiftSuggestion[] {
  const start = new Date(eventStart)
  const end = eventEnd ? new Date(eventEnd) : null

  if (Number.isNaN(start.valueOf())) return []

  const suggestions: ShiftSuggestion[] = []

  suggestions.push(
    createThreeHourShift({
      id: 'setup',
      title: 'Setup',
      startsAt: addHours(start, -3),
      neededCount: 2,
      notes: 'Set up venue, tables, registration area.',
      isDefault: true,
    })
  )

  suggestions.push(
    createThreeHourShift({
      id: 'checkin',
      title: 'Check-In Crew',
      startsAt: start,
      neededCount: 3,
      notes: 'Check in attendees, hand out materials.',
      isDefault: true,
    })
  )

  suggestions.push(
    createThreeHourShift({
      id: 'general',
      title: 'General Support',
      startsAt: start,
      neededCount: 2,
      notes: 'Help with general event tasks, crowd management.',
      isDefault: true,
    })
  )

  if (end && !Number.isNaN(end.valueOf())) {
    suggestions.push(
      createThreeHourShift({
        id: 'takedown',
        title: 'Takedown & Cleanup',
        startsAt: end,
        neededCount: 3,
        notes: 'Clean up venue, pack supplies, return equipment.',
        isDefault: true,
      })
    )
  }

  return suggestions
}

export function generateOptionalSuggestion(
  type: 'program' | 'contestant',
  eventStart: Date,
  eventEnd: Date | null
): ShiftSuggestion | null {
  const start = new Date(eventStart)

  if (Number.isNaN(start.valueOf())) return null

  if (type === 'program') {
    return createThreeHourShift({
      id: `optional-${type}-${Date.now()}`,
      title: 'Program Support',
      startsAt: start,
      neededCount: 2,
      notes: 'Support program activities, speakers, performers.',
      isDefault: false,
    })
  }

  return createThreeHourShift({
    id: `optional-${type}-${Date.now()}`,
    title: 'Contestant Support',
    startsAt: addHours(start, -1),
    neededCount: 2,
    notes: 'Help contestants with check-in, registration, and questions.',
    isDefault: false,
  })
}