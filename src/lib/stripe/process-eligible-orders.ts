import { prisma } from '@/lib/prisma'
import { WEEKEND_PASS_EVENT_TITLES, sponsorBenefitsFromCents } from '../ticketspice/sponsor-tiers'
import { classifyStripePrice } from './ticket-mapping'

const CURRENT_YEAR = 2026

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
  purchasesCreated: number
  purchasesExisting: number
  purchasesUpdated: number
  addonsSkipped: number
  manualReview: number
  unmappedPrices: number
  missingMappedEvents: number
  sponsorFulfillmentsCreated: number
  sponsorFulfillmentsExisting: number
  sponsorFulfillmentsUpdated: number
  logsMarkedProcessed: number
}

function emptySummary(logsScanned: number): Summary {
  return {
    logsScanned,
    skipped: 0,
    ordersProcessed: 0,
    attendeesCreated: 0,
    attendeesUpdated: 0,
    participationCreated: 0,
    participationExisting: 0,
    registrationsCreated: 0,
    registrationsExisting: 0,
    purchasesCreated: 0,
    purchasesExisting: 0,
    purchasesUpdated: 0,
    addonsSkipped: 0,
    manualReview: 0,
    unmappedPrices: 0,
    missingMappedEvents: 0,
    sponsorFulfillmentsCreated: 0,
    sponsorFulfillmentsExisting: 0,
    sponsorFulfillmentsUpdated: 0,
    logsMarkedProcessed: 0,
  }
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

type EventLookup = { byNormalizedTitle: Map<string, { id: string; title: string }> }

function buildEventLookup(events: Array<{ id: string; title: string }>): EventLookup {
  const byNormalizedTitle = new Map<string, { id: string; title: string }>()
  for (const event of events) byNormalizedTitle.set(normalizeKey(event.title), event)
  return { byNormalizedTitle }
}

function findEventId(eventTitle: string, eventLookup: EventLookup) {
  return eventLookup.byNormalizedTitle.get(normalizeKey(eventTitle))?.id || null
}

function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = String(fullName || '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}


// Stripe checkout collects the T-shirt size as a custom field on the SESSION
// (key "tshirtsize", a dropdown) - not on the line item. So it has to be read
// off the session and applied to every purchase in that order. Stripe returns
// the dropdown's machine value, e.g. "s" or "xxl", so it needs normalising.
function shirtSizeFromStripeSession(session: any): string | null {
  const fields = Array.isArray(session?.custom_fields) ? session.custom_fields : []

  const field = fields.find((entry: any) => {
    const key = String(entry?.key || '').toLowerCase().replace(/[^a-z]/g, '')
    const label = String(entry?.label?.custom || '').toLowerCase()
    return key.includes('shirt') || label.includes('shirt')
  })
  if (!field) return null

  const raw =
    field?.dropdown?.value ??
    field?.text?.value ??
    field?.numeric?.value ??
    null

  const value = String(raw ?? '').trim()
  if (!value) return null

  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'].includes(normalized)) {
    return normalized
  }

  // Tolerate "2XL" / "3XL" style values.
  const numeric = normalized.match(/^([2-5])XL$/)
  if (numeric) return 'X'.repeat(Number(numeric[1])) + 'L'

  return value
}

function buildRegistrationNote(sessionId: string, label: string, quantity: number) {
  const passLabel = quantity === 1 ? '1 pass' : String(quantity) + ' passes'
  return 'Stripe order ' + sessionId + ' - ' + passLabel + ' - ' + label
}

function mergeNotes(existing: string | null, note: string) {
  const current = String(existing || '').trim()
  if (!current) return note
  if (current.includes(note)) return current
  return current + '\n' + note
}

async function registerForEvent({
  dryRun,
  memberId,
  eventId,
  summary,
  sessionId,
  label,
  quantity,
}: {
  dryRun: boolean
  memberId: string
  eventId: string
  summary: Summary
  sessionId: string
  label: string
  quantity: number
}) {
  const note = buildRegistrationNote(sessionId, label, quantity)

  const existing = await prisma.eventRegistration.findFirst({
    where: { memberId, eventId },
    select: { id: true, notes: true },
  })

  if (existing) {
    if (!dryRun) {
      const merged = mergeNotes(existing.notes, note)
      if (merged !== existing.notes) {
        await prisma.eventRegistration.update({
          where: { id: existing.id },
          data: { notes: merged, status: 'Paid' },
        })
      }
    }
    summary.registrationsExisting++
    return
  }

  if (!dryRun) {
    await prisma.eventRegistration.create({
      data: { memberId, eventId, status: 'Paid', notes: note },
    })
  }
  summary.registrationsCreated++
}

async function upsertSponsorFulfillment({
  dryRun,
  memberId,
  sponsorTierDollars,
  summary,
}: {
  dryRun: boolean
  memberId: string
  sponsorTierDollars: number
  summary: Summary
}) {
  const benefits = sponsorBenefitsFromCents(sponsorTierDollars * 100, 'Stripe')
  const notes =
    benefits.notes +
    ' Anonymity preference not collected at Stripe checkout - confirm with sponsor directly.'

  const existing = await prisma.sponsorFulfillment.findFirst({
    where: { memberId, eventYear: CURRENT_YEAR },
    select: { id: true },
  })

  if (existing) {
    if (!dryRun) {
      await prisma.sponsorFulfillment.update({
        where: { id: existing.id },
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
    } else {
      summary.sponsorFulfillmentsExisting++
    }
    return benefits
  }

  if (!dryRun) {
    await prisma.sponsorFulfillment.create({
      data: {
        memberId,
        eventYear: CURRENT_YEAR,
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
  }
  summary.sponsorFulfillmentsCreated++
  return benefits
}

// ============================================================
// PROCESSING FUNCTION
// ============================================================
export async function processStripeEligibleOrders(dryRun: boolean, logId?: string) {
  const events = await prisma.event.findMany({
    select: { id: true, title: true },
  })
  const eventLookup = buildEventLookup(events)

  const logs = await prisma.stripeWebhookLog.findMany({
    where: {
      processedAt: null,
      ...(logId ? { id: logId } : {}),
    },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      payloadJson: true,
      lineItemsJson: true,
      eventType: true,
      receivedAt: true,
    },
  })

  const summary = emptySummary(logs.length)

  for (const log of logs) {
    const eventType = log.eventType

    if (eventType !== 'checkout.session.completed' && eventType !== 'checkout.session.async_payment_succeeded') {
      summary.skipped++
      continue
    }

    const payload = log.payloadJson as any
    const session = payload?.data?.object

    if (!session || typeof session !== 'object') {
      summary.skipped++
      continue
    }

    if (session.payment_status !== 'paid') {
      summary.skipped++
      continue
    }

    const lineItems = Array.isArray(log.lineItemsJson) ? (log.lineItemsJson as any[]) : []

    if (!lineItems.length) {
      summary.manualReview++
      continue
    }

    const customerDetails = session.customer_details || {}
    const orderShirtSize = shirtSizeFromStripeSession(session)
    const email = String(customerDetails.email || '').trim().toLowerCase()
    const phone = String(customerDetails.phone || '').trim() || null
    const { firstName, lastName } = splitName(customerDetails.name)

    if (!email || !firstName) {
      summary.manualReview++
      continue
    }

    let member = await prisma.member.findFirst({ where: { email } })
    let memberCreated = false

    if (!member && phone) {
      const byPhone = await prisma.member.findMany({ where: { phone } })
      if (byPhone.length === 1) {
        member = byPhone[0]
      } else if (byPhone.length > 1) {
        summary.manualReview++
        continue
      }
    }

    if (!member) {
      if (!dryRun) {
        member = await prisma.member.create({
          data: {
            firstName,
            lastName: lastName || firstName,
            email,
            phone,
            firstYearAttended: CURRENT_YEAR,
          },
        })
        memberCreated = true
      }
      summary.attendeesCreated++
    } else {
      if (!dryRun) {
        const updateData: any = {}
        if (!member.phone && phone) updateData.phone = phone
        if (member.firstYearAttended > CURRENT_YEAR) updateData.firstYearAttended = CURRENT_YEAR
        if (Object.keys(updateData).length) {
          await prisma.member.update({ where: { id: member.id }, data: updateData })
        }
      }
      summary.attendeesUpdated++
    }

    const memberId = member?.id || null

    if (memberId && !dryRun) {
      const existingPart = await prisma.participationRecord.findFirst({
        where: { memberId, year: CURRENT_YEAR, type: 'ATTENDEE' },
      })
      if (!existingPart) {
        await prisma.participationRecord.create({
          data: { memberId, year: CURRENT_YEAR, type: 'ATTENDEE', source: 'Stripe' },
        })
        summary.participationCreated++
      } else {
        summary.participationExisting++
      }
    }

    if (!memberId) {
      // dryRun with no member yet resolved - can't do per-line-item work below.
      summary.ordersProcessed++
      continue
    }

    for (const item of lineItems) {
      const priceId = item?.price?.id || null
      const classification = classifyStripePrice(priceId)
      const quantity = Number(item?.quantity) || 1
      const amountPaidCents = Number(item?.amount_total)
      const productName =
        item?.description ||
        item?.price?.product?.name ||
        classification.purchaseType ||
        'Unknown Stripe line item'

      // --- Registration ---
      if (classification.type === 'individual_event' && classification.eventTitle) {
        const eventId = findEventId(classification.eventTitle, eventLookup)
        if (!eventId) {
          summary.manualReview++
          summary.missingMappedEvents++
        } else if (!dryRun) {
          await registerForEvent({
            dryRun,
            memberId,
            eventId,
            summary,
            sessionId: session.id,
            label: productName,
            quantity,
          })
        } else {
          summary.registrationsExisting++
        }
      } else if (classification.type === 'weekend_pass' || classification.type === 'vip_pass') {
        for (const eventTitle of WEEKEND_PASS_EVENT_TITLES) {
          const eventId = findEventId(eventTitle, eventLookup)
          if (!eventId) {
            summary.manualReview++
            summary.missingMappedEvents++
            continue
          }
          if (!dryRun) {
            await registerForEvent({
              dryRun,
              memberId,
              eventId,
              summary,
              sessionId: session.id,
              label: productName,
              quantity: classification.type === 'weekend_pass' ? quantity : classification.passCount || 2,
            })
          }
        }
      } else if (classification.type === 'sponsor' && classification.sponsorTierDollars) {
        if (!dryRun) {
          const benefits = await upsertSponsorFulfillment({
            dryRun,
            memberId,
            sponsorTierDollars: classification.sponsorTierDollars,
            summary,
          })
          for (const eventTitle of WEEKEND_PASS_EVENT_TITLES) {
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
              sessionId: session.id,
              label: productName,
              quantity: benefits.wristbandCount || benefits.packageCount || 1,
            })
          }
        }
      } else if (classification.type === 'addon') {
        summary.addonsSkipped++
      } else {
        summary.manualReview++
        summary.unmappedPrices++
      }

      // --- Purchase record (all types, including addon/unknown) ---
      if (!dryRun) {
        const lineItemId = item?.id || `${session.id}-${priceId || 'unknown'}`

        const existingPurchase = await prisma.ticketPurchase.findFirst({
          where: {
            externalSource: 'Stripe',
            externalOrderId: session.id,
            externalLineItemId: lineItemId,
          },
          select: { id: true },
        })

        const purchaseData = {
          externalSource: 'Stripe',
          externalOrderId: session.id,
          externalLineItemId: lineItemId,
          orderNumber: null,
          productName,
          productCategory: classification.productCategory || null,
          purchaseType: classification.purchaseType || null,
          accessLevel: classification.accessLevel || null,
          passCount:
            classification.type === 'vip_pass' ? classification.passCount || 2 : quantity,
          unclaimedPassCount: classification.unclaimedPassCount || 0,
          vipAccess: classification.vipAccess || false,
          priorityCheckIn: classification.priorityCheckIn || false,
          paymentStatus: 'Paid',
          amountPaidCents: Number.isFinite(amountPaidCents) ? amountPaidCents : null,
          purchasedAt: session.created ? new Date(session.created * 1000) : null,
          shirtSize: orderShirtSize,
          pinIncluded: classification.pinIncluded || false,
          pinQuantity: classification.pinIncluded ? 1 : 0,
          sponsorNeedsReview: classification.type === 'sponsor',
          rawProductJson: item,
        }

        if (existingPurchase) {
          summary.purchasesExisting++
        } else {
          await prisma.ticketPurchase.create({
            data: { ...purchaseData, memberId },
          })
          summary.purchasesCreated++
        }
      }
    }

    summary.ordersProcessed++

    if (!dryRun) {
      await prisma.stripeWebhookLog.update({
        where: { id: log.id },
        data: { processedAt: new Date(), status: 'processed', error: null },
      })
      summary.logsMarkedProcessed++
    }
  }

  return summary
}
