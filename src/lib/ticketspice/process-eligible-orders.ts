import { prisma } from '@/lib/prisma'
import { WEEKEND_PASS_EVENT_TITLES, sponsorBenefitsFromCents } from './sponsor-tiers'

// ============================================================
// EVENT / TICKET MAPPING
// ============================================================
// Weekend passes intentionally map to this fixed official weekend event list.
// If you add a new event that should be included in a weekend pass, add it
// here — WEEKEND_PASS_EVENT_TITLES now lives in ./sponsor-tiers.ts since the
// manual admin entry tool needs the same list.

// TicketSpice ticket labels -> app event titles.
// Matching is normalized, so punctuation/case/extra spacing is less fragile.
const INDIVIDUAL_TICKET_ALIASES: Record<string, string> = {
  'ATAME / VPL CROSSOVER': 'ATAME/VPL Crossover',
  'ATAME/VPL CROSSOVER': 'ATAME/VPL Crossover',
  'PRIMER IMPACTO': 'Primer Impacto',
  'AGUAS FRESCAS PISS QUEEN (BEER AND WATER INCLUDED)': 'Aguas Frescas Wet Play Party',
  'AGUAS FRESCAS WET PLAY PARTY': 'Aguas Frescas Wet Play Party',
  'SOMBRAS DE MI BARRIO - ART SHOW OPENING': 'Sombras de Mi Barrio',
  'SOMBRAS DE MI BARRIO': 'Sombras de Mi Barrio',
  'ANYTHING GOES - MR CUERO CONTEST AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'ANYTHING GOES - MR CUERO CONTEST PRE AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'CARNE ASADA PLAY AND POOL PARTY': 'Carne Asada Play and Pool Party',
  'MR CUERO CONTEST AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'MR CUERO CONTEST & AFTER PARTY': 'Mr Cuero Contest & After Party',
}

type TicketClassification = {
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
  pinQuantity?: number
  sponsorNeedsReview?: boolean
}

type EventLookup = {
  byNormalizedTitle: Map<string, { id: string; title: string }>
}

function normalizeKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalTicketLabel(value: unknown) {
  return normalizeKey(value).toUpperCase()
}

function buildAliasMap() {
  const map = new Map<string, string>()

  for (const [ticketLabel, eventTitle] of Object.entries(INDIVIDUAL_TICKET_ALIASES)) {
    map.set(normalizeKey(ticketLabel), eventTitle)
  }

  return map
}

function classifyTicket(
  label: string,
  quantity: number,
  eventLookup: EventLookup
): TicketClassification {
  const normalized = normalizeKey(label)
  const canonical = canonicalTicketLabel(label)
  const aliasMap = buildAliasMap()

  if (canonical === 'ENCUERADO WEEKEND PASS') {
    return {
      type: 'weekend_pass',
      productCategory: 'Pass',
      purchaseType: 'Weekend Pass',
      accessLevel: 'Weekend',
      passCount: quantity || 1,
      unclaimedPassCount: 0,
      vipAccess: false,
      priorityCheckIn: false,
    }
  }

  if (canonical === 'ENCUERADO WEEKEND VIP PASS') {
    return {
      type: 'vip_pass',
      productCategory: 'Pass',
      purchaseType: 'VIP Pass',
      accessLevel: 'VIP',
      passCount: 2,
      unclaimedPassCount: 1,
      vipAccess: true,
      priorityCheckIn: true,
    }
  }

  if (canonical === 'BE A SPONSOR' || canonical.includes('SPONSOR')) {
    return {
      type: 'sponsor',
      productCategory: 'Sponsor',
      purchaseType: 'Sponsor',
      sponsorNeedsReview: true,
    }
  }

  if (canonical === 'ENCUERADO T SHIRT' || canonical.includes('T SHIRT') || canonical.includes('TSHIRT')) {
    return {
      type: 'addon',
      productCategory: 'Merch',
      purchaseType: 'T-Shirt',
    }
  }

  if (canonical === 'ENCUERADO PIN' || canonical.endsWith(' PIN') || canonical.includes(' PIN ')) {
    return {
      type: 'addon',
      productCategory: 'Merch',
      purchaseType: 'Pin',
      pinIncluded: true,
      pinQuantity: quantity || 1,
    }
  }

  const mappedEventTitle = aliasMap.get(normalized)
  if (mappedEventTitle) {
    return {
      type: 'individual_event',
      eventTitle: mappedEventTitle,
      productCategory: 'Individual Ticket',
      purchaseType: 'Individual Ticket',
      accessLevel: 'Event',
      passCount: quantity || 1,
    }
  }

  // New-event fallback:
  // If the TicketSpice ticket label matches an app Event title after normalization,
  // treat it as an individual event ticket without adding a code alias.
  const matchingEvent = eventLookup.byNormalizedTitle.get(normalized)
  if (matchingEvent) {
    return {
      type: 'individual_event',
      eventTitle: matchingEvent.title,
      productCategory: 'Individual Ticket',
      purchaseType: 'Individual Ticket',
      accessLevel: 'Event',
      passCount: quantity || 1,
    }
  }

  return { type: 'unknown' }
}

function normalizeShirtSize(value: any): string | null {
  if (!value) return null
  const v = String(value).trim().toUpperCase()
  if (['S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(v)) return v
  if (/large/i.test(v)) return v.includes('X') ? v.toUpperCase() : 'L'
  if (/medium/i.test(v)) return 'M'
  if (/small/i.test(v)) return 'S'
  return null
}

function extractRegistrantFulfillment(payloadData: any) {
  const registrants: any[] = payloadData?.registrants || []
  let shirtSize: string | null = null
  let pinIncluded = false
  let pinQuantity = 0
  let explicitShirtProduct = false
  let explicitPinProduct = false

  for (const reg of registrants) {
    const fields = reg.data || []

    for (const field of fields) {
      const fieldKey = String(field.key || '').toLowerCase()
      const fieldLabel = String(field.label || '').toLowerCase()

      if (fieldKey === 'tshirtsize' || fieldLabel.includes('shirt') || fieldLabel.includes('t-shirt size')) {
        const size = normalizeShirtSize(field.value || field.answer)
        if (size && !shirtSize) shirtSize = size
      }

      if (field.products && Array.isArray(field.products)) {
        for (const prod of field.products) {
          const prodLabel = String(prod.label || '').toUpperCase()

          if (prodLabel.includes('PIN') && Number(prod.value) > 0) {
            explicitPinProduct = true
            pinIncluded = true
            pinQuantity = Math.max(pinQuantity, Number(prod.value) || Number(prod.quantity) || 1)
          }

          if ((prodLabel.includes('SHIRT') || prodLabel.includes('T-SHIRT')) && Number(prod.value) > 0) {
            explicitShirtProduct = true
          }
        }
      }
    }
  }

  return {
    shirtSize,
    pinIncluded,
    pinQuantity,
    explicitShirtProduct,
    explicitPinProduct,
  }
}

function parseTicketQuantity(ticket: any): number {
  const possibleValues = [
    ticket.quantity,
    ticket.qty,
    ticket.count,
    ticket.ticketQuantity,
    ticket.numberOfTickets,
  ]

  for (const value of possibleValues) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.floor(parsed))
    }
  }

  return 1
}

function buildTicketRegistrationNote({
  orderId,
  label,
  quantity,
}: {
  orderId: string
  label: string
  quantity: number
}) {
  const passLabel = quantity === 1 ? '1 pass' : String(quantity) + ' passes'
  return 'TicketSpice order ' + orderId + ' Ã‚Â· ' + passLabel + ' Ã‚Â· ' + label
}

function mergeRegistrationNotes(existingNotes: string | null, newNote: string) {
  const cleanExisting = String(existingNotes || '').trim()
  if (!cleanExisting) return newNote
  if (cleanExisting.includes(newNote)) return cleanExisting
  return cleanExisting + '\n' + newNote
}

function buildExternalLineItemId(orderId: string, ticket: any, index: number): string {
  return (
    ticket.lineItemId ||
    ticket.ticketId ||
    ticket.id ||
    ticket.lookupId ||
    `${orderId}-${index}-${String(ticket.ticketLabel || ticket.name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}`
  )
}

function extractPayloadEventType(payload: any, fallbackEventType: string | null) {
  return String(
    payload?.eventType ||
      payload?.event_type ||
      payload?.event ||
      payload?.type ||
      payload?.action ||
      fallbackEventType ||
      ''
  )
}

function extractLineAmountCents(ticket: any, fallbackOrderTotalCents: number | null) {
  const possibleValues = [
    ticket.total,
    ticket.amount,
    ticket.price,
    ticket.subtotal,
    ticket.lineTotal,
    ticket.totalAmount,
    ticket.amountPaid,
  ]

  for (const value of possibleValues) {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue) && numberValue > 0) {
      return Math.round(numberValue * 100)
    }
  }

  return fallbackOrderTotalCents
}

function buildEventLookup(events: Array<{ id: string; title: string }>): EventLookup {
  const byNormalizedTitle = new Map<string, { id: string; title: string }>()

  for (const event of events) {
    byNormalizedTitle.set(normalizeKey(event.title), event)
  }

  return { byNormalizedTitle }
}

function findEventId(eventTitle: string, eventLookup: EventLookup) {
  return eventLookup.byNormalizedTitle.get(normalizeKey(eventTitle))?.id || null
}

async function registerForEvent({
  dryRun,
  memberId,
  eventId,
  summary,
  orderId,
  ticketLabel,
  quantity,
}: {
  dryRun: boolean
  memberId: string | null
  eventId: string
  summary: Summary
  orderId: string
  ticketLabel: string
  quantity: number
}) {
  if (!memberId) {
    summary.registrationsWouldCreate++
    return
  }

  const registrationNote = buildTicketRegistrationNote({
    orderId,
    label: ticketLabel,
    quantity,
  })

  const existingReg = await prisma.eventRegistration.findFirst({
    where: {
      memberId,
      eventId,
    },
    select: {
      id: true,
      notes: true,
    },
  })

  if (existingReg) {
    if (!dryRun) {
      const mergedNotes = mergeRegistrationNotes(existingReg.notes, registrationNote)
      if (mergedNotes !== existingReg.notes) {
        await prisma.eventRegistration.update({
          where: {
            id: existingReg.id,
          },
          data: {
            notes: mergedNotes,
            status: 'Paid',
          },
        })
      }
    }

    summary.registrationsExisting++
    return
  }

  if (dryRun) {
    summary.registrationsWouldCreate++
    return
  }

  await prisma.eventRegistration.create({
    data: {
      memberId,
      eventId,
      status: 'Paid',
      notes: registrationNote,
    },
  })

  summary.registrationsCreated++
}

type Summary = {
  logsScanned: number
  skipped: number
  ordersProcessed: number
  attendeesCreated: number
  attendeesUpdated: number
  participationCreated: number
  participationExisting: number
  registrationsCreated: number
  registrationsExisting: number
  registrationsWouldCreate: number
  addonsSkipped: number
  manualReview: number
  purchasesCreated: number
  purchasesExisting: number
  purchasesWouldCreate: number
  purchasesUpdated: number
  purchasesWouldUpdate: number
  shirtSizesFound: number
  explicitPinProductsFound: number
  packagePinsApplied: number
  sponsorNeedsReview: number
  duplicateRisk: number
  missingMappedEvents: number
  unknownTicketLabels: number
  logsMarkedProcessed: number
  sponsorFulfillmentsCreated: number
  sponsorFulfillmentsExisting: number
  sponsorFulfillmentsUpdated: number
}


function extractSponsorDonationCents(data: any, ticket: any) {
  const ticketData = Array.isArray(ticket?.data) ? ticket.data : []

  for (const item of ticketData) {
    if (item?.key === 'donation' && Array.isArray(item.repeater)) {
      for (const repeated of item.repeater) {
        const value = Number(repeated?.amount?.value)
        if (Number.isFinite(value) && value > 0) {
          return Math.round(value * 100)
        }
      }
    }
  }

  const deductibleTotal = Number(data?.deductibleTotal)
  if (Number.isFinite(deductibleTotal) && deductibleTotal > 0) {
    return Math.round(deductibleTotal * 100)
  }

  const total = Number(data?.total)
  if (Number.isFinite(total) && total > 0) {
    return Math.round(total * 100)
  }

  return null
}

async function upsertSponsorFulfillment({
  dryRun,
  memberId,
  year,
  sponsorDonationCents,
  noShirtSelected,
  summary,
}: {
  dryRun: boolean
  memberId: string | null
  year: number
  sponsorDonationCents: number | null
  noShirtSelected: boolean
  summary: Summary
}) {
  if (!memberId) return

  const benefits = sponsorBenefitsFromCents(sponsorDonationCents)
  const notes = noShirtSelected
    ? benefits.notes + ' TicketSpice answer says: No T shirt.'
    : benefits.notes

  const existing = await prisma.sponsorFulfillment.findFirst({
    where: {
      memberId,
      eventYear: year,
    },
    select: {
      id: true,
    },
  })

  if (existing) {
    if (dryRun) {
      summary.sponsorFulfillmentsExisting++
      return
    }

    await prisma.sponsorFulfillment.update({
      where: {
        id: existing.id,
      },
      data: {
        sponsorTier: benefits.sponsorTier,
        accessLevel: benefits.accessLevel,
        packageCount: benefits.packageCount,
        wristbandCount: benefits.wristbandCount,
        shirtCount: benefits.shirtCount,
        pinCount: benefits.pinCount,
        giftIncluded: benefits.giftIncluded,
        giftDescription: benefits.giftDescription,
        websiteRecognition: benefits.websiteRecognition,
        socialRecognition: benefits.socialRecognition,
        closingCeremonyRecognition: benefits.closingCeremonyRecognition,
        commemorativePhoto: benefits.commemorativePhoto,
        magazineAdSize: benefits.magazineAdSize,
        notes,
      },
    })

    summary.sponsorFulfillmentsUpdated++
    return
  }

  if (dryRun) {
    summary.sponsorFulfillmentsCreated++
    return
  }

  await prisma.sponsorFulfillment.create({
    data: {
      memberId,
      eventYear: year,
      sponsorTier: benefits.sponsorTier,
      accessLevel: benefits.accessLevel,
      packageCount: benefits.packageCount,
      wristbandCount: benefits.wristbandCount,
      shirtCount: benefits.shirtCount,
      pinCount: benefits.pinCount,
      giftIncluded: benefits.giftIncluded,
      giftDescription: benefits.giftDescription,
      websiteRecognition: benefits.websiteRecognition,
      socialRecognition: benefits.socialRecognition,
      closingCeremonyRecognition: benefits.closingCeremonyRecognition,
      commemorativePhoto: benefits.commemorativePhoto,
      magazineAdSize: benefits.magazineAdSize,
      notes,
    },
  })

  summary.sponsorFulfillmentsCreated++
}

function sponsorSelectedNoShirt(data: any) {
  const registrants = Array.isArray(data?.registrants) ? data.registrants : []

  for (const registrant of registrants) {
    const fields = Array.isArray(registrant?.data) ? registrant.data : []

    for (const field of fields) {
      const key = String(field?.key || '').toLowerCase()
      const value = String(field?.value || '').toLowerCase()
      const label = String(field?.label || '').toLowerCase()

      if (
        key.includes('shirt') &&
        (value.includes('notshirt') ||
          value.includes('no tshirt') ||
          value.includes('no t shirt') ||
          value.includes('noshirt') ||
          value.includes('no shirt'))
      ) {
        return true
      }

      if (
        label.includes('shirt') &&
        (value.includes('notshirt') ||
          value.includes('no tshirt') ||
          value.includes('no t shirt') ||
          value.includes('noshirt') ||
          value.includes('no shirt'))
      ) {
        return true
      }
    }
  }

  return false
}


// ============================================================
// PROCESSING FUNCTION
// ============================================================
export async function processEligibleOrders(dryRun: boolean, logId?: string) {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      title: true,
    },
  })

  const eventLookup = buildEventLookup(events)

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      processedAt: null,
      ...(logId ? { id: logId } : {}),
    },
    orderBy: {
      receivedAt: 'desc',
    },
    select: {
      id: true,
      payloadJson: true,
      rawBody: true,
      eventType: true,
      receivedAt: true,
      processedAt: true,
    },
  })

  const summary: Summary = {
    logsScanned: logs.length,
    skipped: 0,
    ordersProcessed: 0,
    attendeesCreated: 0,
    attendeesUpdated: 0,
    participationCreated: 0,
    participationExisting: 0,
    registrationsCreated: 0,
    registrationsExisting: 0,
    registrationsWouldCreate: 0,
    addonsSkipped: 0,
    manualReview: 0,
    purchasesCreated: 0,
    purchasesExisting: 0,
    purchasesWouldCreate: 0,
    purchasesUpdated: 0,
    purchasesWouldUpdate: 0,
    shirtSizesFound: 0,
    explicitPinProductsFound: 0,
    packagePinsApplied: 0,
    sponsorNeedsReview: 0,
    duplicateRisk: 0,
    missingMappedEvents: 0,
    unknownTicketLabels: 0,
    logsMarkedProcessed: 0,
    sponsorFulfillmentsCreated: 0,
    sponsorFulfillmentsExisting: 0,
    sponsorFulfillmentsUpdated: 0,
  }

  for (const log of logs) {
    let payload = log.payloadJson

    if (!payload && log.rawBody) {
      try {
        payload = JSON.parse(log.rawBody as string)
      } catch {
        summary.skipped++
        continue
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      summary.skipped++
      continue
    }

    const payloadAny = payload as any
    const eventType = extractPayloadEventType(payloadAny, log.eventType)

    if (normalizeKey(eventType) !== 'registration') {
      summary.skipped++
      continue
    }

    const data = payloadAny.data as any

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      summary.skipped++
      continue
    }

    if (data.orderStatus !== 'completed') {
      summary.skipped++
      continue
    }

    if (data.formName !== 'Encuerado Weekend 2026') {
      summary.skipped++
      continue
    }

    if (Number(data.total || 0) <= 0) {
      summary.skipped++
      continue
    }

    if (data.orderNumber === 'NCRDWKND2026-XZT0002') {
      summary.skipped++
      continue
    }

    const billing = data.billing as any

    if (!billing?.email) {
      summary.manualReview++
      continue
    }

    const firstName = String(billing.name?.first || '').trim()
    const lastName = String(billing.name?.last || '').trim()
    const email = String(billing.email || '').trim().toLowerCase()
    const phone = String(billing.phone || '').trim() || null

    if (!firstName || !lastName) {
      summary.manualReview++
      continue
    }

    let member = await prisma.member.findFirst({
      where: {
        email,
      },
    })

    let memberCreated = false

    if (!member && phone) {
      const byPhone = await prisma.member.findMany({
        where: {
          phone,
        },
      })

      if (byPhone.length === 1) {
        member = byPhone[0]
      } else if (byPhone.length > 1) {
        summary.manualReview++
        continue
      }
    }

    if (!member) {
      if (dryRun) {
        summary.attendeesCreated++
      } else {
        member = await prisma.member.create({
          data: {
            firstName,
            lastName,
            email,
            phone: phone || null,
            firstYearAttended: 2026,
          },
        })

        memberCreated = true
        summary.attendeesCreated++
      }
    } else {
      if (!dryRun) {
        const updateData: any = {}

        if (!member.phone && phone) updateData.phone = phone
        if (member.firstYearAttended > 2026) updateData.firstYearAttended = 2026

        if (Object.keys(updateData).length) {
          await prisma.member.update({
            where: {
              id: member.id,
            },
            data: updateData,
          })
        }
      }

      if (!dryRun || !memberCreated) {
        summary.attendeesUpdated++
      }
    }

    const memberId = member?.id || null

    if (memberId) {
      const existingPart = await prisma.participationRecord.findFirst({
        where: {
          memberId,
          year: 2026,
          type: 'ATTENDEE',
        },
      })

      if (!existingPart) {
        if (!dryRun) {
          await prisma.participationRecord.create({
            data: {
              memberId,
              year: 2026,
              type: 'ATTENDEE',
              source: 'TicketSpice',
            },
          })

          summary.participationCreated++
        }
      } else {
        summary.participationExisting++
      }
    }

    const fulfillment = extractRegistrantFulfillment(data)

    if (fulfillment.shirtSize) summary.shirtSizesFound++
    if (fulfillment.explicitPinProduct) summary.explicitPinProductsFound++

    const tickets = Array.isArray(data.tickets) ? data.tickets : []
    const orderId = data.orderNumber || data.orderId || `TS-${log.id}`
    const purchasedAt =
      data.registrationTimestamp ||
      data.createdAt ||
      data.completedAt ||
      data.orderDate ||
      log.receivedAt

    const paymentStatus = data.orderStatus === 'completed' ? 'Paid' : data.orderStatus
    const orderAmountPaidCents = data.total ? Math.round(Number(data.total) * 100) : null

    const orderEventTicketCounts = new Map<string, number>()

    for (const countTicket of tickets) {
      const countLabel = String(
        countTicket.ticketLabel || countTicket.name || countTicket.productName || 'Unknown'
      ).trim()
      const countQuantity = parseTicketQuantity(countTicket)
      const countClassification = classifyTicket(countLabel, countQuantity, eventLookup)

      if (
        countClassification.type === 'individual_event' ||
        countClassification.type === 'weekend_pass' ||
        countClassification.type === 'vip_pass'
      ) {
        const countTargetEventTitles =
          countClassification.type === 'individual_event'
            ? [countClassification.eventTitle!]
            : WEEKEND_PASS_EVENT_TITLES

        for (const countEventTitle of countTargetEventTitles) {
          const countKey = normalizeKey(countEventTitle)
          orderEventTicketCounts.set(
            countKey,
            (orderEventTicketCounts.get(countKey) || 0) +
              (countClassification.passCount || countQuantity || 1)
          )
        }
      }
    }

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      const label = String(ticket.ticketLabel || ticket.name || ticket.productName || 'Unknown').trim()
      const quantity = parseTicketQuantity(ticket)
      const classification = classifyTicket(label, quantity, eventLookup)

      if (
        classification.type === 'individual_event' ||
        classification.type === 'weekend_pass' ||
        classification.type === 'vip_pass'
      ) {
        const targetEventTitles =
          classification.type === 'individual_event'
            ? [classification.eventTitle!]
            : WEEKEND_PASS_EVENT_TITLES

        for (const eventTitle of targetEventTitles) {
          const eventId = findEventId(eventTitle, eventLookup)

          if (!eventId) {
            summary.manualReview++
            summary.missingMappedEvents++
            continue
          }

          await registerForEvent({
            dryRun,
            memberId,
            eventId,
            summary,
            orderId,
            ticketLabel: label,
            quantity: orderEventTicketCounts.get(normalizeKey(eventTitle)) || quantity,
          })
        }
      } else if (classification.type === 'addon') {
        summary.addonsSkipped++
      } else if (classification.type === 'sponsor') {
        summary.manualReview++
        summary.sponsorNeedsReview++

        const sponsorDonationCents = extractSponsorDonationCents(data, ticket)
        const sponsorBenefits = sponsorBenefitsFromCents(sponsorDonationCents)

        await upsertSponsorFulfillment({
          dryRun,
          memberId,
          year: 2026,
          sponsorDonationCents,
          noShirtSelected: sponsorSelectedNoShirt(data),
          summary,
        })

        for (const sponsorEventTitle of WEEKEND_PASS_EVENT_TITLES) {
          const sponsorEventId = findEventId(sponsorEventTitle, eventLookup)

          if (!sponsorEventId) {
            summary.manualReview++
            summary.missingMappedEvents++
            continue
          }

          await registerForEvent({
            dryRun,
            memberId,
            eventId: sponsorEventId,
            summary,
            orderId,
            ticketLabel: sponsorBenefits.sponsorTier + ' Sponsor Package',
            quantity: sponsorBenefits.wristbandCount || sponsorBenefits.packageCount || 1,
          })
        }
      } else {
        summary.manualReview++
        summary.unknownTicketLabels++
      }

      const lineItemId = buildExternalLineItemId(orderId, ticket, i)
      const amountPaidCents =
        classification.type === 'sponsor'
          ? extractSponsorDonationCents(data, ticket) || extractLineAmountCents(ticket, orderAmountPaidCents)
          : extractLineAmountCents(ticket, orderAmountPaidCents)

      const purchaseData: any = {
        externalSource: 'TicketSpice',
        externalOrderId: orderId,
        externalLineItemId: lineItemId,
        orderNumber: data.orderNumber || null,
        productName: label,
        productCategory: classification.productCategory || null,
        purchaseType: classification.purchaseType || null,
        accessLevel: classification.accessLevel || null,
        passCount: classification.passCount || quantity || 1,
        unclaimedPassCount: classification.unclaimedPassCount || 0,
        vipAccess: classification.vipAccess || false,
        priorityCheckIn: classification.priorityCheckIn || false,
        paymentStatus,
        amountPaidCents,
        purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
        sponsorNeedsReview: classification.sponsorNeedsReview || false,
        rawProductJson: ticket,
      }

      if (classification.type === 'weekend_pass' || classification.type === 'vip_pass') {
        purchaseData.shirtSize = fulfillment.shirtSize || null
        purchaseData.pinIncluded = true
        purchaseData.pinQuantity = Math.max(1, fulfillment.pinQuantity || 1)
        summary.packagePinsApplied++
      } else if (classification.type === 'individual_event') {
        purchaseData.shirtSize = null
        purchaseData.pinIncluded = fulfillment.explicitPinProduct
        purchaseData.pinQuantity = fulfillment.explicitPinProduct ? fulfillment.pinQuantity : 0
      } else if (classification.productCategory === 'Merch') {
        if (classification.purchaseType === 'T-Shirt') {
          purchaseData.shirtSize = fulfillment.shirtSize || null
        } else if (classification.purchaseType === 'Pin') {
          purchaseData.pinIncluded = true
          purchaseData.pinQuantity = quantity || 1
        }
      } else if (classification.type === 'sponsor') {
        purchaseData.sponsorNeedsReview = true
      }

      let existingPurchase = await prisma.ticketPurchase.findFirst({
        where: {
          externalSource: 'TicketSpice',
          externalOrderId: orderId,
          externalLineItemId: lineItemId,
        },
        select: {
          id: true,
          shirtSize: true,
          pinIncluded: true,
          pinQuantity: true,
          purchaseType: true,
          productCategory: true,
          accessLevel: true,
          paymentStatus: true,
          amountPaidCents: true,
          purchasedAt: true,
          sponsorNeedsReview: true,
        },
      })

      let duplicateRisk = false

      if (!existingPurchase) {
        const fallbackMatches = await prisma.ticketPurchase.findMany({
          where: {
            externalSource: 'TicketSpice',
            externalOrderId: orderId,
            productName: label,
          },
          select: {
            id: true,
            shirtSize: true,
            pinIncluded: true,
            pinQuantity: true,
            purchaseType: true,
            productCategory: true,
            accessLevel: true,
            paymentStatus: true,
            amountPaidCents: true,
            purchasedAt: true,
            sponsorNeedsReview: true,
          },
        })

        if (fallbackMatches.length === 1) {
          existingPurchase = fallbackMatches[0]
        } else if (fallbackMatches.length > 1) {
          duplicateRisk = true
          summary.duplicateRisk++
        }
      }

      if (existingPurchase) {
        const updateData: any = {}

        if (!existingPurchase.shirtSize && purchaseData.shirtSize) updateData.shirtSize = purchaseData.shirtSize
        if (!existingPurchase.pinIncluded && purchaseData.pinIncluded) {
          updateData.pinIncluded = purchaseData.pinIncluded
          updateData.pinQuantity = purchaseData.pinQuantity
        } else if (existingPurchase.pinIncluded && purchaseData.pinQuantity > existingPurchase.pinQuantity) {
          updateData.pinQuantity = purchaseData.pinQuantity
        }
        if (!existingPurchase.purchaseType && purchaseData.purchaseType) updateData.purchaseType = purchaseData.purchaseType
        if (!existingPurchase.productCategory && purchaseData.productCategory) updateData.productCategory = purchaseData.productCategory
        if (!existingPurchase.accessLevel && purchaseData.accessLevel) updateData.accessLevel = purchaseData.accessLevel
        if (!existingPurchase.paymentStatus && purchaseData.paymentStatus) updateData.paymentStatus = purchaseData.paymentStatus
        if (!existingPurchase.amountPaidCents && purchaseData.amountPaidCents) updateData.amountPaidCents = purchaseData.amountPaidCents
        if (!existingPurchase.purchasedAt && purchaseData.purchasedAt) updateData.purchasedAt = purchaseData.purchasedAt
        if (purchaseData.sponsorNeedsReview && !existingPurchase.sponsorNeedsReview) updateData.sponsorNeedsReview = true

        if (Object.keys(updateData).length) {
          if (dryRun) {
            summary.purchasesWouldUpdate++
          } else {
            await prisma.ticketPurchase.update({
              where: {
                id: existingPurchase.id,
              },
              data: updateData,
            })

            summary.purchasesUpdated++
          }
        } else {
          summary.purchasesExisting++
        }
      } else if (!duplicateRisk) {
        if (dryRun) {
          summary.purchasesWouldCreate++
        } else if (memberId) {
          await prisma.ticketPurchase.create({
            data: {
              ...purchaseData,
              memberId,
            },
          })

          summary.purchasesCreated++
        }
      }
    }

    summary.ordersProcessed++

    if (!dryRun) {
      await prisma.ticketSpiceWebhookLog.update({
        where: {
          id: log.id,
        },
        data: {
          processedAt: new Date(),
          status: 'processed',
          error: null,
        },
      })

      summary.logsMarkedProcessed++
    }
  }

  return summary
}