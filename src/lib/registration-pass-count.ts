export function getRegistrationPassCount(notes: string | null | undefined) {
  const text = String(notes || '')

  // Registration notes accumulate one segment per order, e.g.
  //   "Stripe order cs_live_abc - 1 pass - Encuerado Weekend Pass"
  //   "TicketSpice order NCRD-123 · 2 passes · PADRINO Sponsor Package"
  // One person can hold passes from SEVERAL orders (a paid one plus comped
  // ones), so the real total is the sum across orders. But the same order can
  // also appear twice in one note, so sum per DISTINCT order id - that double
  // counting is what the previous Math.max() was guarding against.
  //
  // The \D{1,12} between id and count tolerates " - ", " · ", and the
  // mojibake " Ã‚Â· " still present in older saved notes.
  const perOrder = new Map<string, number>()

  for (const match of text.matchAll(
    /(?:Stripe|TicketSpice)\s+order\s+([A-Za-z0-9_-]+)\D{1,12}?(\d+)\s+(?:pass|passes|ticket|tickets)\b/gi
  )) {
    const count = Number(match[2])
    if (Number.isFinite(count) && count > 0) perOrder.set(match[1], count)
  }

  if (perOrder.size > 0) {
    return Array.from(perOrder.values()).reduce((sum, n) => sum + n, 0)
  }

  // Fallback for manual or legacy notes with no order id: keep the old
  // max-based behaviour so a note repeating one count doesn't double it.
  const matches = Array.from(
    text.matchAll(/(\d+)\s+(?:pass|passes|ticket|tickets)\b/gi)
  )
  const counts = matches
    .map((match) => Number(match[1]))
    .filter((count) => Number.isFinite(count) && count > 0)

  return counts.length ? Math.max(...counts) : 1
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
