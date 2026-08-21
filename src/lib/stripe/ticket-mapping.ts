// Stripe Price ID -> internal ticket classification. This is the Stripe
// equivalent of INDIVIDUAL_TICKET_ALIASES + the weekend_pass/vip_pass/addon
// classification in src/lib/ticketspice/process-eligible-orders.ts, built
// from the real product catalog (scripts/list-stripe-products.mjs) and
// confirmed with Rick 2026-08-10.
//
// IMPORTANT: when a new ticket type is added in Stripe, add a line here.
// Any Price ID not listed below falls through as "unknown" and gets
// flagged for manual review instead of silently mis-processed - see
// /admin/stripe-webhooks.
//
// Notes on what's intentionally NOT mapped:
// - ATAME/VPL Crossover and Sombras de Mi Barrio: free events, no ticket
//   sold for them individually - only reachable via Weekend Pass / VIP /
//   Sponsor.
// - Carne Asada: that event already happened this cycle: no Stripe product
//   exists for it and none is expected.

export type StripeTicketClassification = {
  type: 'weekend_pass' | 'vip_pass' | 'sponsor' | 'individual_event' | 'addon' | 'unknown'
  eventTitle?: string
  productCategory?: string
  purchaseType?: string
  accessLevel?: string
  passCount?: number
  unclaimedPassCount?: number
  vipAccess?: boolean
  priorityCheckIn?: boolean
  pinIncluded?: boolean
  shirtIncluded?: boolean
  sponsorTierDollars?: number
}

export const STRIPE_PRICE_MAP: Record<string, StripeTicketClassification> = {
  // Encuerado Weekend Pass - $150 (prod_V34juIvQpYz1tU)
  // Includes both a T-shirt and a pin (confirmed with Rick 2026-08-10 -
  // the Stripe product description text doesn't mention the pin, but it's
  // included same as VIP Pass).
  price_1U2yaNCanyYsdjhJQCM03Qxo: {
    type: 'weekend_pass',
    productCategory: 'Pass',
    purchaseType: 'Weekend Pass',
    accessLevel: 'Weekend',
    passCount: 1,
    unclaimedPassCount: 0,
    vipAccess: false,
    priorityCheckIn: false,
    pinIncluded: true,
    shirtIncluded: true,
  },

  // Encuerado Weekend VIP Pass - $260 (prod_V34mAiByDHwfK9)
  // Admits 2 people under one purchaser identity, same as before - includes
  // shirt AND pin per the current product description.
  price_1U2yccCanyYsdjhJn3G22Qen: {
    type: 'vip_pass',
    productCategory: 'Pass',
    purchaseType: 'VIP Pass',
    accessLevel: 'VIP',
    passCount: 2,
    unclaimedPassCount: 1,
    vipAccess: true,
    priorityCheckIn: true,
    pinIncluded: true,
    shirtIncluded: true,
  },

  // ANYTHING GOES - MR CUERO CONTEST AND AFTER PARTY - $40 (prod_V34puGlEDLSrtK)
  price_1U2yfaCanyYsdjhJ6TTI78t9: {
    type: 'individual_event',
    eventTitle: 'Mr Cuero Contest & After Party',
    productCategory: 'Individual Ticket',
    purchaseType: 'Individual Ticket',
    accessLevel: 'Event',
    passCount: 1,
  },

  // AGUAS FRESCAS PISS QUEEN (BEER AND WATER INCLUDED) - $50 (prod_V34obzZzx1HuZg)
  price_1U2yejCanyYsdjhJhBAMXaYb: {
    type: 'individual_event',
    eventTitle: 'Aguas Frescas Wet Play Party',
    productCategory: 'Individual Ticket',
    purchaseType: 'Individual Ticket',
    accessLevel: 'Event',
    passCount: 1,
  },

  // Primer Impacto - $35 (prod_V34n7iQwi3lYlB)
  price_1U2ye4CanyYsdjhJnbroKWUV: {
    type: 'individual_event',
    eventTitle: 'Primer Impacto',
    productCategory: 'Individual Ticket',
    purchaseType: 'Individual Ticket',
    accessLevel: 'Event',
    passCount: 1,
  },

  // Encuerado T shirt (standalone addon) - $35 (prod_V34uWnBVFnluuf)
  price_1U2ykXCanyYsdjhJXvE1BuDd: {
    type: 'addon',
    productCategory: 'Merch',
    purchaseType: 'T-Shirt',
  },

  // Encuerado Pin (standalone addon) - $10 (prod_V34uvKRS7iGzZN)
  price_1U2yl3CanyYsdjhJom764Vnt: {
    type: 'addon',
    productCategory: 'Merch',
    purchaseType: 'Pin',
  },

  // Mero Mero Sponsorship - $1000 fixed (prod_V37EUIxmugwEJ0)
  price_1U30zYCanyYsdjhJWS620vix: {
    type: 'sponsor',
    productCategory: 'Sponsor',
    purchaseType: 'Sponsor',
    sponsorTierDollars: 1000,
  },

  // Padrino Sponsorship - $500 fixed (prod_V34rNUllxaL00r)
  price_1U2yhSCanyYsdjhJOKkmGBPI: {
    type: 'sponsor',
    productCategory: 'Sponsor',
    purchaseType: 'Sponsor',
    sponsorTierDollars: 500,
  },

  // Compadre Sponsorship - $300 fixed (prod_V34q7XEMhEK0Pp)
  price_1U2ygfCanyYsdjhJOvcRVdzn: {
    type: 'sponsor',
    productCategory: 'Sponsor',
    purchaseType: 'Sponsor',
    sponsorTierDollars: 300,
  },
}

export function classifyStripePrice(priceId: string | null | undefined): StripeTicketClassification {
  if (!priceId) return { type: 'unknown' }
  return STRIPE_PRICE_MAP[priceId] || { type: 'unknown' }
}
