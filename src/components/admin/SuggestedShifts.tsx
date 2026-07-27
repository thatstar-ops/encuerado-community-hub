'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  generateDefaultSuggestions,
  generateOptionalSuggestion,
  type ShiftSuggestion,
} from '@/lib/shift-suggestions'
import {
  addHours,
  dateToEventDateTimeLocalValue,
  eventDateTimeLocalToUtcDate,
} from '@/lib/timezone'
import { createSuggestedShifts } from '@/app/actions/createShifts'

type ExistingShift = {
  title: string
  startsAt: Date
  endsAt: Date | null
}

const optionalTypes = ['program', 'contestant'] as const
type OptionalType = (typeof optionalTypes)[number]

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

export default function SuggestedShifts({
  eventId,
  eventStart,
  eventEnd,
  existingShifts,
}: {
  eventId: string
  eventStart: Date
  eventEnd: Date | null
  existingShifts: ExistingShift[]
}) {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<ShiftSuggestion[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const normalizedEventStart = new Date(eventStart)
  const normalizedEventEnd = eventEnd ? new Date(eventEnd) : null
  const normalizedExistingShifts = existingShifts.map((shift) => ({
    ...shift,
    startsAt: new Date(shift.startsAt),
    endsAt: shift.endsAt ? new Date(shift.endsAt) : null,
  }))

  const isDuplicate = (suggestion: ShiftSuggestion, existing: ExistingShift[]) => {
    return existing.some((ex) => {
      return (
        normalizeTitle(ex.title) === normalizeTitle(suggestion.title) &&
        shiftOverlap(suggestion.startsAt, suggestion.endsAt, ex.startsAt, ex.endsAt)
      )
    })
  }

  useEffect(() => {
    const defaults = generateDefaultSuggestions(normalizedEventStart, normalizedEventEnd)
    const withExists = defaults.map((suggestion) => ({
      ...suggestion,
      exists: isDuplicate(suggestion, normalizedExistingShifts),
    }))

    setSuggestions(withExists)

    const defaultIds = withExists
      .filter((suggestion) => suggestion.isDefault && !suggestion.exists)
      .map((suggestion) => suggestion.id)

    setSelectedIds(new Set(defaultIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const addOptionalShift = (type: OptionalType) => {
    const optional = generateOptionalSuggestion(type, normalizedEventStart, normalizedEventEnd)
    if (!optional) return

    const exists = isDuplicate(optional, normalizedExistingShifts)
    const newSuggestion = { ...optional, exists }

    setSuggestions((prev) => [...prev, newSuggestion])

    if (!exists) {
      setSelectedIds((prev) => new Set(prev).add(newSuggestion.id))
    }
  }

  const updateSuggestion = (
    id: string,
    field: keyof ShiftSuggestion,
    value: string | number | null
  ) => {
    setSuggestions((prev) =>
      prev.map((suggestion) => {
        if (suggestion.id !== id) return suggestion

        if (field === 'startsAt') {
          const startsAt = eventDateTimeLocalToUtcDate(String(value || ''))
          const currentDurationMs =
            suggestion.endsAt && suggestion.endsAt > suggestion.startsAt
              ? suggestion.endsAt.getTime() - suggestion.startsAt.getTime()
              : 3 * 60 * 60 * 1000

          return {
            ...suggestion,
            startsAt,
            endsAt: new Date(startsAt.getTime() + currentDurationMs),
          }
        }

        if (field === 'endsAt') {
          const endsAt = value ? eventDateTimeLocalToUtcDate(String(value)) : addHours(suggestion.startsAt, 3)

          return {
            ...suggestion,
            endsAt: endsAt > suggestion.startsAt ? endsAt : addHours(suggestion.startsAt, 3),
          }
        }

        if (field === 'neededCount') {
          return {
            ...suggestion,
            neededCount: Math.max(1, Number(value) || 1),
          }
        }

        return {
          ...suggestion,
          [field]: value,
        }
      })
    )
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const handleCreate = async () => {
    const selected = suggestions.filter((suggestion) => selectedIds.has(suggestion.id) && !suggestion.exists)

    if (selected.length === 0) {
      setError('No new shifts selected. Some may already exist.')
      setMessage(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setMessage(null)

    const payload = selected.map((suggestion) => ({
      title: suggestion.title,
      startsAt: dateToEventDateTimeLocalValue(suggestion.startsAt),
      endsAt: suggestion.endsAt ? dateToEventDateTimeLocalValue(suggestion.endsAt) : null,
      neededCount: suggestion.neededCount,
      notes: suggestion.notes,
    }))

    try {
      const result = await createSuggestedShifts(eventId, payload)

      if (result.success) {
        setMessage(result.message || 'Created selected shifts.')
        setSelectedIds(new Set())
        router.refresh()
      } else {
        setError(result.error || 'Failed to create shifts.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
        No suggestions available. Event may be missing a start time.
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
      <h2 className="text-2xl font-bold text-white">Suggested Volunteer Shifts</h2>
      <p className="mt-1 text-sm text-[#8F8F8F]">
        Select shifts to create for this event. Default generated shift duration is 3 hours unless you edit it.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500 bg-red-900 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-lg border border-green-700 bg-green-950/40 p-3 text-sm text-green-100">
          {message}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`rounded-xl border p-4 ${
              suggestion.exists
                ? 'border-[#3A1215] bg-[#151111] opacity-60'
                : 'border-[#3A1215] bg-[#151111]'
            }`}
          >
            <div className="flex flex-wrap items-start gap-4">
              {!suggestion.exists ? (
                <input
                  type="checkbox"
                  checked={selectedIds.has(suggestion.id)}
                  onChange={() => toggleSelection(suggestion.id)}
                  className="mt-1 h-5 w-5"
                />
              ) : null}

              <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-[#8F8F8F]">Title</label>
                  <input
                    type="text"
                    value={suggestion.title}
                    onChange={(event) => updateSuggestion(suggestion.id, 'title', event.target.value)}
                    disabled={suggestion.exists}
                    className="w-full rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-2 text-white disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-[#8F8F8F]">Start</label>
                    <input
                      type="datetime-local"
                      value={dateToEventDateTimeLocalValue(suggestion.startsAt)}
                      onChange={(event) => updateSuggestion(suggestion.id, 'startsAt', event.target.value)}
                      disabled={suggestion.exists}
                      className="w-full rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-2 text-white disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#8F8F8F]">End</label>
                    <input
                      type="datetime-local"
                      value={dateToEventDateTimeLocalValue(suggestion.endsAt)}
                      onChange={(event) => updateSuggestion(suggestion.id, 'endsAt', event.target.value || null)}
                      disabled={suggestion.exists}
                      className="w-full rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-2 text-white disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#8F8F8F]">Volunteers Needed</label>
                  <input
                    type="number"
                    min="1"
                    value={suggestion.neededCount}
                    onChange={(event) => updateSuggestion(suggestion.id, 'neededCount', event.target.value)}
                    disabled={suggestion.exists}
                    className="w-full rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-2 text-white disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#8F8F8F]">Notes</label>
                  <input
                    type="text"
                    value={suggestion.notes}
                    onChange={(event) => updateSuggestion(suggestion.id, 'notes', event.target.value)}
                    disabled={suggestion.exists}
                    className="w-full rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-2 text-white disabled:opacity-50"
                  />
                </div>
              </div>

              {suggestion.exists ? (
                <span className="ml-2 text-sm font-bold text-[#B11218]">Already exists</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <select
          onChange={(event) => {
            if (event.target.value) {
              addOptionalShift(event.target.value as OptionalType)
              event.target.value = ''
            }
          }}
          defaultValue=""
          className="rounded-lg border border-[#3A1215] bg-[#151111] p-2 text-white"
        >
          <option value="">Add Optional Shift...</option>
          <option value="program">Program Support</option>
          <option value="contestant">Contestant Support</option>
        </select>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={handleCreate}
          disabled={isLoading}
          className="rounded-lg bg-[#B11218] px-5 py-2 font-bold text-white hover:bg-[#D11A22] disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create Selected Shifts'}
        </button>

        <button
          type="button"
          onClick={() => {
            setSuggestions([])
          }}
          className="rounded-lg border border-[#3A1215] px-5 py-2 font-bold text-[#B7B7B7] hover:bg-[#2A0E10]"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}