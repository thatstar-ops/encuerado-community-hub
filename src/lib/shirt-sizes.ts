// ============================================================
// SHIRT SIZES - one shared place for reading, writing and counting them.
// ============================================================
// Sizes live in three unrelated tables and several products cover more than
// one person, so a single record can owe more than one shirt:
//
//   VolunteerProfile.shirtSize    one volunteer  -> exactly 1 shirt
//   TicketPurchase.shirtSize      a VIP pass seats 2 people (passCount)
//   SponsorFulfillment.shirtSizes a sponsor package includes shirtCount shirts
//
// Checkout only ever asked ONE size per order, so every seat past the first
// starts out unknown. To avoid a schema migration mid-season, a purchase that
// owes several shirts stores them comma-separated in the single shirtSize
// column ("L, XL"). Always read it through parseSizes() and write it through
// formatSizes() so that stays consistent everywhere.

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] as const
export type ShirtSize = (typeof SHIRT_SIZES)[number]

function isKnownSize(value: string): value is ShirtSize {
  return (SHIRT_SIZES as readonly string[]).includes(value)
}

/** "l" -> "L", "2xl" -> "XXL", "Large" -> "L". Returns null if unrecognisable. */
export function normalizeSize(value: unknown): ShirtSize | null {
  const raw = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!raw) return null
  if (raw.startsWith('NO')) return null // "no t shirt"
  if (isKnownSize(raw)) return raw

  const numeric = raw.match(/^([2-5])XL$/)
  if (numeric) {
    const expanded = 'X'.repeat(Number(numeric[1])) + 'L'
    if (isKnownSize(expanded)) return expanded
  }
  if (raw === 'SMALL') return 'S'
  if (raw === 'MEDIUM') return 'M'
  if (raw === 'LARGE') return 'L'
  if (raw === 'XLARGE' || raw === 'EXTRALARGE') return 'XL'
  return null
}

/** Accepts "L, XL", ["L","XL"], a JSON string, null - always returns a clean list. */
export function parseSizes(value: unknown): ShirtSize[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed)
      } catch {
        raw = trimmed.split(',')
      }
    } else {
      raw = trimmed.split(',')
    }
  }
  if (!Array.isArray(raw)) raw = raw ? [raw] : []
  return (raw as unknown[])
    .map(normalizeSize)
    .filter((size): size is ShirtSize => size !== null)
}

/** The value to store back in a single text column. */
export function formatSizes(sizes: ShirtSize[]): string | null {
  return sizes.length ? sizes.join(', ') : null
}

/** How many shirts a pass purchase owes - a VIP pass seats 2 people. */
export function seatsForPurchase(passCount: unknown): number {
  return Math.max(1, Number(passCount) || 1)
}

/**
 * How many shirts a pass purchase earns.
 *
 * Comped / non-revenue passes ($0) do NOT come with a shirt - only paid
 * passes do. A VIP pass seats 2 people (passCount) and so earns 2 shirts
 * when it was paid for.
 */
export function passShirtSeats(purchase: {
  passCount?: unknown
  amountPaidCents?: number | null
}): number {
  const paid = Number(purchase.amountPaidCents)
  if (!Number.isFinite(paid) || paid <= 0) return 0
  return seatsForPurchase(purchase.passCount)
}
