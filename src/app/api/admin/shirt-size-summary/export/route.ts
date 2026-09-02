import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  normalizeSize,
  parseSizes,
  passShirtSeats,
  SHIRT_SIZES,
} from '@/lib/shirt-sizes'

// Shirt sizes live in three unrelated places and nothing else adds them up:
//   1. VolunteerProfile.shirtSize      - but only volunteers who worked enough shifts
//   2. TicketPurchase.shirtSize        - Weekend / VIP passes
//   3. SponsorFulfillment.shirtSizes   - sponsors, who are owed shirtCount each
//
// Several products cover more than one person (a VIP pass seats 2, a sponsor
// package includes 2 shirts) but checkout only ever asked ONE size per order.
// Every seat past the first is therefore a real shirt with no size attached -
// counted here as "Unknown" rather than silently dropped.
const SIZES = SHIRT_SIZES

// A volunteer earns a shirt at this many active shifts. Override per request
// with ?minShifts=2 if the policy changes.
const DEFAULT_MIN_SHIFTS = 3
const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function emptyTally(): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const size of SIZES) tally[size] = 0
  return tally
}

export async function GET(request: Request) {
  await requireSuperAdmin()

  const requested = Number(new URL(request.url).searchParams.get('minShifts'))
  const minShifts =
    Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_MIN_SHIFTS

  // ---------- 1. Volunteers ----------
  const profiles = await prisma.volunteerProfile.findMany({
    select: {
      shirtSize: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          volunteerAssignments: { select: { status: true } },
        },
      },
    },
  })

  const volunteerTally = emptyTally()
  const missing: Array<[string, string, string, string]> = []
  let volunteersEligible = 0
  let volunteerUnknown = 0

  for (const profile of profiles) {
    const shifts = profile.member.volunteerAssignments.filter((a) =>
      ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)
    ).length
    if (shifts < minShifts) continue

    volunteersEligible++
    const size = normalizeSize(profile.shirtSize)
    if (size) {
      volunteerTally[size]++
    } else {
      volunteerUnknown++
      missing.push([
        'Volunteer',
        `${profile.member.firstName} ${profile.member.lastName}`,
        profile.member.email,
        `${shifts} shifts, no size on file`,
      ])
    }
  }

  // ---------- 2. Pass holders ----------
  const passes = await prisma.ticketPurchase.findMany({
    where: { purchaseType: { in: ['Weekend Pass', 'VIP Pass'] } },
    select: {
      shirtSize: true,
      purchaseType: true,
      passCount: true,
      amountPaidCents: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  const passTally = emptyTally()
  let passSeats = 0
  let passUnknown = 0

  for (const pass of passes) {
    const seats = passShirtSeats(pass)
    passSeats += seats

    // Comped ($0) passes earn no shirt, so they contribute nothing to the
    // order and never appear on the chase list.
    if (seats === 0) continue

    const sizes = parseSizes(pass.shirtSize)
    for (const size of sizes) passTally[size]++

    const gap = seats - sizes.length
    if (gap > 0) {
      passUnknown += gap
      missing.push([
        pass.purchaseType || 'Pass',
        `${pass.member.firstName} ${pass.member.lastName}`,
        pass.member.email,
        `${seats} seat(s), ${sizes.length} size(s) known, ${gap} missing`,
      ])
    }
  }

  // ---------- 3. Sponsors ----------
  const sponsors = await prisma.sponsorFulfillment.findMany({
    select: {
      sponsorTier: true,
      shirtCount: true,
      shirtSizes: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  const sponsorTally = emptyTally()
  let sponsorOwed = 0
  let sponsorUnknown = 0

  for (const sponsor of sponsors) {
    const owed = Number(sponsor.shirtCount) || 0
    sponsorOwed += owed

    const sizes = parseSizes(sponsor.shirtSizes)
    for (const size of sizes) sponsorTally[size]++

    const gap = owed - sizes.length
    if (gap > 0) {
      sponsorUnknown += gap
      missing.push([
        `${sponsor.sponsorTier || 'Sponsor'} sponsor`,
        `${sponsor.member.firstName} ${sponsor.member.lastName}`,
        sponsor.member.email,
        `owed ${owed}, ${sizes.length} size(s) known, ${gap} missing`,
      ])
    }
  }

  // ---------- CSV ----------
  const totalUnknown = volunteerUnknown + passUnknown + sponsorUnknown
  const rows: string[] = []

  rows.push(`Encuerado shirt order - volunteers need ${minShifts}+ shifts to earn a shirt`)
  rows.push('')
  rows.push(['Size', 'Volunteers', 'Pass Holders', 'Sponsors', 'Total'].join(','))

  let knownTotal = 0
  for (const size of SIZES) {
    const total = volunteerTally[size] + passTally[size] + sponsorTally[size]
    if (total === 0) continue
    knownTotal += total
    rows.push(
      [size, volunteerTally[size], passTally[size], sponsorTally[size], total]
        .map(escapeCsv)
        .join(',')
    )
  }

  rows.push(
    ['Size unknown', volunteerUnknown, passUnknown, sponsorUnknown, totalUnknown]
      .map(escapeCsv)
      .join(',')
  )
  rows.push(
    [
      'TOTAL SHIRTS',
      volunteersEligible,
      passSeats,
      sponsorOwed,
      knownTotal + totalUnknown,
    ]
      .map(escapeCsv)
      .join(',')
  )

  rows.push('')
  rows.push(`People counted: ${volunteersEligible} volunteers (of ${profiles.length} profiles), ${passSeats} pass holders across ${passes.length} purchases, ${sponsorOwed} sponsor shirts across ${sponsors.length} sponsors`)

  rows.push('')
  rows.push('WHO STILL NEEDS TO GIVE A SIZE')
  rows.push(['Group', 'Name', 'Email', 'Detail'].join(','))
  if (missing.length === 0) {
    rows.push('Nobody - every shirt has a size')
  } else {
    for (const row of missing) rows.push(row.map(escapeCsv).join(','))
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=shirt-order-summary.csv',
    },
  })
}
