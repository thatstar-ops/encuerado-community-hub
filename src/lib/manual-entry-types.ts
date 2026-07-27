// Kept out of manual-attendee-actions.ts ('use server') because Next.js only
// allows async function exports from "use server" files — a plain const
// array or type export there breaks the production build.
export const ENTRY_TYPES = [
  'sponsor',
  'weekend_pass',
  'vip_pass',
  'individual_event',
] as const

export type EntryType = (typeof ENTRY_TYPES)[number]
