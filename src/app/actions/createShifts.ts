'use server'

import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addHours, parseEventDateInput } from '@/lib/timezone'

const DEFAULT_SHIFT_DURATION_HOURS = 3

type SuggestedShiftInput = {
  title: string
  startsAt: string
  endsAt: string | null
  neededCount: number
  notes: string
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function shiftOverlap(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null
) {
  if (aEnd && bEnd) {
    return aStart < bEnd && bStart < aEnd
  }

  return Math.abs(aStart.getTime() - bStart.getTime()) < 60000
}

function safeNeededCount(value: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.floor(parsed))
}

export async function createSuggestedShifts(
  eventId: string,
  shifts: SuggestedShiftInput[]
) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    return { success: false, error: 'Unauthorized' }
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      location: true,
      archivedAt: true,
      cancelledAt: true,
      status: true,
    },
  })

  if (!event || event.archivedAt || event.cancelledAt || event.status === 'Cancelled') {
    return { success: false, error: 'Choose an active event for these shifts.' }
  }

  const existing = await prisma.volunteerShift.findMany({
    where: {
      eventId,
      archivedAt: null,
      cancelledAt: null,
      NOT: {
        status: 'Cancelled',
      },
    },
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
    },
  })

  const created: string[] = []
  const duplicates: string[] = []
  const invalid: string[] = []
  const seenInThisRequest: Array<{
    title: string
    startsAt: Date
    endsAt: Date | null
  }> = []

  for (const shift of shifts) {
    const title = String(shift.title || '').trim()

    if (!title || !shift.startsAt) {
      invalid.push(title || 'Untitled shift')
      continue
    }

    let startsAt: Date
    let endsAt: Date | null

    try {
      startsAt = parseEventDateInput(shift.startsAt)
      endsAt = shift.endsAt ? parseEventDateInput(shift.endsAt) : addHours(startsAt, DEFAULT_SHIFT_DURATION_HOURS)
    } catch {
      invalid.push(title)
      continue
    }

    if (endsAt && endsAt <= startsAt) {
      endsAt = addHours(startsAt, DEFAULT_SHIFT_DURATION_HOURS)
    }

    const normalizedTitle = normalizeTitle(title)

    const isDuplicateExisting = existing.some((ex) => {
      return (
        normalizeTitle(ex.title) === normalizedTitle &&
        shiftOverlap(startsAt, endsAt, ex.startsAt, ex.endsAt)
      )
    })

    const isDuplicateInRequest = seenInThisRequest.some((ex) => {
      return (
        normalizeTitle(ex.title) === normalizedTitle &&
        shiftOverlap(startsAt, endsAt, ex.startsAt, ex.endsAt)
      )
    })

    if (isDuplicateExisting || isDuplicateInRequest) {
      duplicates.push(title)
      continue
    }

    await prisma.volunteerShift.create({
      data: {
        eventId,
        title,
        startsAt,
        endsAt,
        neededCount: safeNeededCount(shift.neededCount),
        notes: String(shift.notes || '').trim() || null,
        status: 'Open',
        location: event.location || null,
      },
    })

    created.push(title)
    seenInThisRequest.push({ title, startsAt, endsAt })
  }

  let message = `Created ${created.length} shift(s).`

  if (duplicates.length > 0) {
    message += ` Skipped duplicates: ${duplicates.join(', ')}.`
  }

  if (invalid.length > 0) {
    message += ` Skipped invalid shifts: ${invalid.join(', ')}.`
  }

  return {
    success: true,
    message,
    created: created.length,
    skipped: duplicates.length + invalid.length,
  }
}