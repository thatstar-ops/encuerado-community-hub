// Shared sponsor-tier and weekend-pass-event definitions. Single source of
// truth used by both the automated TicketSpice webhook pipeline
// (process-eligible-orders.ts) and the manual "Add Sponsor / Attendee" admin
// tool (manual-attendee-actions.ts). If sponsor tiers or the weekend event
// list change, update it here only.

// Weekend passes (and full-weekend sponsor packages) intentionally map to
// this fixed official weekend event list. If you add a new event that
// should be included in a weekend pass, add it here.
export const WEEKEND_PASS_EVENT_TITLES = [
  'ATAME/VPL Crossover',
  'Primer Impacto',
  'Aguas Frescas Wet Play Party',
  'Sombras de Mi Barrio',
  'ContraMundo - Encuerado Weekend Edition',
  'Mr Cuero Contest & After Party',
]

export type SponsorBenefits = {
  sponsorTier: string
  accessLevel: string
  packageCount: number
  wristbandCount: number
  shirtCount: number
  pinCount: number
  giftIncluded: boolean
  giftDescription: string | null
  websiteRecognition: boolean
  socialRecognition: boolean
  closingCeremonyRecognition: boolean
  commemorativePhoto: boolean
  magazineAdSize: string | null
  notes: string
}

/**
 * Computes sponsor tier + benefits from a donation amount in cents.
 * `sourceLabel` only affects the generated notes text (e.g. "TicketSpice"
 * vs "Manual entry") — the tier thresholds and benefits are identical
 * regardless of how the sponsorship was recorded.
 */
export function sponsorBenefitsFromCents(
  cents: number | null,
  sourceLabel = 'TicketSpice'
): SponsorBenefits {
  const dollars = cents ? Math.round(cents / 100) : 0

  if (dollars >= 1000) {
    return {
      sponsorTier: 'EL MERO MERO',
      accessLevel: 'VIP Weekend Package',
      packageCount: 2,
      wristbandCount: 2,
      shirtCount: 2,
      pinCount: 2,
      giftIncluded: true,
      giftDescription: 'Exclusive limited-edition Encuerado Weekend gift',
      websiteRecognition: true,
      socialRecognition: true,
      closingCeremonyRecognition: true,
      commemorativePhoto: true,
      magazineAdSize: 'Full page',
      notes:
        sourceLabel +
        ' sponsor amount: $' +
        String(dollars) +
        '. EL MERO MERO includes 2 VIP Weekend Packages, 2 shirts, 2 pins, exclusive gift, full page ad, closing ceremony recognition, commemorative photo, website/social recognition. Confirm anonymity and shirt preference at check-in.',
    }
  }

  if (dollars >= 500) {
    return {
      sponsorTier: 'PADRINO',
      accessLevel: 'Full Weekend Package',
      packageCount: 2,
      wristbandCount: 2,
      shirtCount: 2,
      pinCount: 2,
      giftIncluded: false,
      giftDescription: null,
      websiteRecognition: true,
      socialRecognition: true,
      closingCeremonyRecognition: true,
      commemorativePhoto: true,
      magazineAdSize: 'Half page',
      notes:
        sourceLabel +
        ' sponsor amount: $' +
        String(dollars) +
        '. PADRINO includes 2 Full Weekend Packages, 2 shirts, 2 pins, half page ad, closing ceremony recognition, commemorative photo, website/social recognition. Confirm anonymity and shirt preference at check-in.',
    }
  }

  if (dollars >= 300) {
    return {
      sponsorTier: 'COMPADRE',
      accessLevel: 'Full Weekend Package',
      packageCount: 1,
      wristbandCount: 1,
      shirtCount: 1,
      pinCount: 1,
      giftIncluded: false,
      giftDescription: null,
      websiteRecognition: true,
      socialRecognition: true,
      closingCeremonyRecognition: false,
      commemorativePhoto: false,
      magazineAdSize: null,
      notes:
        sourceLabel +
        ' sponsor amount: $' +
        String(dollars) +
        '. COMPADRE includes 1 Full Weekend Package, 1 shirt, 1 pin, website/social recognition. Confirm anonymity and shirt preference at check-in.',
    }
  }

  return {
    sponsorTier: 'Sponsor - Needs Review',
    accessLevel: 'Sponsor Package',
    packageCount: 1,
    wristbandCount: 1,
    shirtCount: 0,
    pinCount: 0,
    giftIncluded: false,
    giftDescription: null,
    websiteRecognition: true,
    socialRecognition: true,
    closingCeremonyRecognition: false,
    commemorativePhoto: false,
    magazineAdSize: null,
    notes: sourceLabel + ' sponsor amount needs review. Confirm package benefits manually.',
  }
}
