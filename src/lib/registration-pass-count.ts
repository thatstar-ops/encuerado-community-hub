export function getRegistrationPassCount(notes: string | null | undefined) {
  const text = String(notes || '')

  const matches = Array.from(
    text.matchAll(/(\d+)\s+(?:pass|passes|ticket|tickets)\b/gi)
  )

  if (matches.length === 0) return 1

  const counts = matches
    .map((match) => Number(match[1]))
    .filter((count) => Number.isFinite(count) && count > 0)

  if (counts.length === 0) return 1

  return Math.max(...counts)
}

export function getRegistrationPassLabel(notes: string | null | undefined) {
  const count = getRegistrationPassCount(notes)
  return count === 1 ? '1 ticket' : `${count} tickets`
}

export function getRegistrationPassBadgeClass(notes: string | null | undefined) {
  const count = getRegistrationPassCount(notes)

  return count > 1
    ? 'rounded-full bg-yellow-400 px-3 py-1 text-sm font-black text-black'
    : 'rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white'
}