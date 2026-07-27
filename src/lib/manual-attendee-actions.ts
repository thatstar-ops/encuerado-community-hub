'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { WEEKEND_PASS_EVENT_TITLES, sponsorBenefitsFromCents } from '@/lib/ticketspice/sponsor-tiers'
import { ENTRY_TYPES, type EntryType } from '@/lib/manual-entry-types'

function redirectWithNotice(status: 'success' | 'blocked', message: string): never {
  const params = new URLSearchParams({ actionStatus: status, actionMessage: message })
  redirect(`/admin/sponsors/new?${params.toString()}`)
}

function requiredText(formData: FormData, name: string, label: string, max: number) {
  const value = String(formData.get(name) || '').trim()
  if (!value) redirectWithNotice('blocked', `${label} is required.`)
  if (value.length > max) redirectWithNotice('blocked', `${label} must be ${max} characters or fewer.`)
  return value
}

function optionalText(formData: FormData, name: string, max: number) {
  const value = String(formData.get(name) || '').trim()
  if (value.length > max) redirectWithNotice('blocked', `That field must be ${max} characters or fewer.`)
  return value || null
}

function requiredEmail(formData: FormData, name: string) {
  const value = String(formData.get(name) || '').trim().toLowerCase()
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    redirectWithNotice('blocked', 'A valid email address is required.')
  }
  return value
}

function requiredYear(formData: FormData, name: string) {
  const value = Number(formData.get(name))
  if (!Number.isInteger(value) || value < 1900 || value > 2100) {
    redirectWithNotice('blocked', 'Year must be a valid four-digit year.')
  }
  return value
}

/**
 * Builds a registration note containing "N pass(es)" so
 * getRegistrationPassCount() (src/lib/registration-pass-count.ts) picks up
 * the right ticket count on check-in screens — same convention the
 * TicketSpice pipeline uses (buildTicketRegistrationNote), written fresh
 * here to avoid a known mojibake bug in that function's dash character.
 */
function buildManualRegistrationNote(label: string, quantity: number) {
  const passLabel = quantity === 1 ? '1 pass' : `${quantity} passes`
  return `Manual entry - ${passLabel} - ${label}`
}

async function upsertMember(formData: FormData) {
  const firstName = requiredText(formData, 'firstName', 'First name', 100)
  const lastName = requiredText(formData, 'lastName', 'Last name', 100)
  const preferredName = optionalText(formData, 'preferredName', 100)
  const email = requiredEmail(formData, 'email')
  const phone = optionalText(formData, 'phone', 40)
  const city = optionalText(formData, 'city', 100)
  const state = optionalText(formData, 'state', 100)
  const country = optionalText(formData, 'country', 100) || 'USA'
  const year = requiredYear(formData, 'year')

  const member = await prisma.member.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      preferredName,
      phone: phone || undefined,
      city: city || undefined,
      state: state || undefined,
      country,
      archivedAt: null,
    },
    create: {
      firstName,
      lastName,
      preferredName,
      email,
      phone,
      city,
      state,
      country,
      firstYearAttended: year,
    },
  })

  return { member, year }
}

async function ensureParticipationRecord(memberId: string, year: number) {
  const existing = await prisma.participationRecord.findUnique({
    where: { memberId_year_type: { memberId, year, type: 'ATTENDEE' } },
  })

  if (!existing) {
    await prisma.participationRecord.create({
      data: { memberId, year, type: 'ATTENDEE', source: 'Manual Entry' },
    })
  }
}

async function registerForEventTitles(
  memberId: string,
  eventTitles: string[],
  noteLabel: string,
  quantity: number
) {
  const events = await prisma.event.findMany({
    where: {
      title: { in: eventTitles },
      archivedAt: null,
      cancelledAt: null,
    },
    select: { id: true, title: true },
  })

  const missing = eventTitles.filter(
    (title) => !events.some((event) => event.title === title)
  )

  for (const event of events) {
    const note = buildManualRegistrationNote(noteLabel, quantity)

    const existing = await prisma.eventRegistration.findUnique({
      where: { memberId_eventId: { memberId, eventId: event.id } },
    })

    if (existing) {
      const mergedNotes = existing.notes?.includes(note)
        ? existing.notes
        : [existing.notes, note].filter(Boolean).join('\n')

      await prisma.eventRegistration.update({
        where: { id: existing.id },
        data: { notes: mergedNotes, status: 'Paid' },
      })
    } else {
      await prisma.eventRegistration.create({
        data: {
          memberId,
          eventId: event.id,
          status: 'Paid',
          notes: note,
        },
      })
    }
  }

  return missing
}

export async function createManualEntry(formData: FormData) {
  await requireSuperAdmin()

  const entryType = String(formData.get('entryType') || '') as EntryType
  if (!ENTRY_TYPES.includes(entryType)) {
    redirectWithNotice('blocked', 'Choose a valid entry type.')
  }

  const { member, year } = await upsertMember(formData)
  await ensureParticipationRecord(member.id, year)

  const externalOrderId = `manual-${Date.now()}-${member.id.slice(-6)}`

  if (entryType === 'sponsor') {
    const amountDollars = Number(formData.get('amountDollars'))
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      redirectWithNotice('blocked', 'Enter a valid sponsor amount in dollars.')
    }

    const displayName = optionalText(formData, 'displayName', 160)
    const isAnonymous = formData.get('isAnonymous') === 'on'
    const amountCents = Math.round(amountDollars * 100)

    const benefits = sponsorBenefitsFromCents(amountCents, 'Manual entry')

    const missing = await registerForEventTitles(
      member.id,
      WEEKEND_PASS_EVENT_TITLES,
      `${benefits.sponsorTier} Sponsor Package`,
      benefits.wristbandCount || benefits.packageCount || 1
    )

    await prisma.sponsorFulfillment.upsert({
      where: { memberId_eventYear: { memberId: member.id, eventYear: year } },
      update: {
        sponsorTier: benefits.sponsorTier,
        displayName,
        isAnonymous,
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
        notes: benefits.notes,
      },
      create: {
        memberId: member.id,
        eventYear: year,
        sponsorTier: benefits.sponsorTier,
        displayName,
        isAnonymous,
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
        notes: benefits.notes,
      },
    })

    await prisma.ticketPurchase.create({
      data: {
        memberId: member.id,
        externalSource: 'Manual',
        externalOrderId,
        externalLineItemId: '1',
        productName: `${benefits.sponsorTier} Sponsor`,
        productCategory: 'Sponsor',
        purchaseType: 'Sponsor',
        accessLevel: benefits.accessLevel,
        passCount: benefits.packageCount,
        vipAccess: benefits.sponsorTier === 'EL MERO MERO',
        priorityCheckIn: benefits.sponsorTier !== 'Sponsor - Needs Review',
        amountPaidCents: amountCents,
        purchasedAt: new Date(),
        sponsorTier: benefits.sponsorTier,
        sponsorType: 'Manual',
        sponsorNeedsReview: benefits.sponsorTier === 'Sponsor - Needs Review',
      },
    })

    if (missing.length > 0) {
      redirectWithNotice(
        'success',
        `Sponsor logged as ${benefits.sponsorTier}. Note: could not find these events to register (check titles match exactly): ${missing.join(', ')}.`
      )
    }

    redirectWithNotice(
      'success',
      `${member.firstName} ${member.lastName} logged as a $${amountDollars} sponsor (${benefits.sponsorTier}) and registered for all weekend events.`
    )
  }

  if (entryType === 'weekend_pass' || entryType === 'vip_pass') {
    const quantity = Math.max(1, Number(formData.get('quantity')) || 1)
    const isVip = entryType === 'vip_pass'

    const missing = await registerForEventTitles(
      member.id,
      WEEKEND_PASS_EVENT_TITLES,
      isVip ? 'VIP Pass' : 'Weekend Pass',
      quantity
    )

    await prisma.ticketPurchase.create({
      data: {
        memberId: member.id,
        externalSource: 'Manual',
        externalOrderId,
        externalLineItemId: '1',
        productName: isVip ? 'Encuerado Weekend VIP Pass' : 'Encuerado Weekend Pass',
        productCategory: 'Pass',
        purchaseType: isVip ? 'VIP Pass' : 'Weekend Pass',
        accessLevel: isVip ? 'VIP' : 'Weekend',
        passCount: quantity,
        vipAccess: isVip,
        priorityCheckIn: isVip,
        purchasedAt: new Date(),
      },
    })

    if (missing.length > 0) {
      redirectWithNotice(
        'success',
        `${member.firstName} ${member.lastName} logged with a ${isVip ? 'VIP' : 'weekend'} pass. Note: could not find these events (check titles match exactly): ${missing.join(', ')}.`
      )
    }

    redirectWithNotice(
      'success',
      `${member.firstName} ${member.lastName} logged with a ${isVip ? 'VIP' : 'weekend'} pass and registered for all weekend events.`
    )
  }

  // individual_event
  const eventId = String(formData.get('eventId') || '').trim()
  if (!eventId) redirectWithNotice('blocked', 'Choose an event for an individual ticket.')

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  })
  if (!event) redirectWithNotice('blocked', 'Selected event could not be found.')

  const quantity = Math.max(1, Number(formData.get('quantity')) || 1)

  await registerForEventTitles(member.id, [event.title], 'Individual Ticket', quantity)

  await prisma.ticketPurchase.create({
    data: {
      memberId: member.id,
      externalSource: 'Manual',
      externalOrderId,
      externalLineItemId: '1',
      productName: event.title,
      productCategory: 'Individual Ticket',
      purchaseType: 'Individual Ticket',
      accessLevel: 'Event',
      passCount: quantity,
      purchasedAt: new Date(),
    },
  })

  redirectWithNotice(
    'success',
    `${member.firstName} ${member.lastName} logged with an individual ticket for ${event.title}.`
  )
}
