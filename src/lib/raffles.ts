// Single source of truth for the fixed raffle links. Each key is the URL
// slug (/raffle/<slug>) and each value is the display name used for the
// page heading, the ExternalContactList label, and the entry sourceLabel.
//
// All raffles give away the same prize (an Encuerado Weekend Pass) - only
// the event they're collected at differs. Add a new raffle by adding a
// line here; no other code changes needed.
export const RAFFLES: Record<string, string> = {
  'dore-alley': 'Dore Alley',
  'carne-asada': 'Carne Asada',
  contramundo: 'ContraMundo',
  machete: 'Machete',
  'mr-rough-trade-gear-contest': 'Rough Trade Gear',
}

export type RaffleId = keyof typeof RAFFLES

export function isValidRaffleId(value: string): value is RaffleId {
  return Object.prototype.hasOwnProperty.call(RAFFLES, value)
}

// Raffles that are no longer accepting entries (their event already
// happened). Kept in RAFFLES above on purpose - existing QR codes/links for
// a closed raffle still resolve to a real page instead of a 404, they just
// show a "closed" message and the server action rejects any submission.
const CLOSED_RAFFLE_IDS: RaffleId[] = ['dore-alley', 'carne-asada']

export function isRaffleClosed(raffleId: string): boolean {
  return (CLOSED_RAFFLE_IDS as string[]).includes(raffleId)
}

export function raffleLabel(raffleId: string): string {
  return RAFFLES[raffleId] || raffleId
}

// The ExternalContactList each raffle's entries are grouped under. Giving
// each raffle its own list (rather than one shared list) is what makes
// "one entry per raffle" work for free - the existing unique(listId,
// memberId) constraint on ExternalContactListMember naturally allows the
// same person into up to 3 lists (one per raffle) while still blocking a
// second entry into the same raffle's list.
export function raffleListLabel(raffleId: string): string {
  return `Raffle 2026 - ${raffleLabel(raffleId)}`
}
