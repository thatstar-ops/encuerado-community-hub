import { prisma } from './prisma'

export type RecipientType =
  | 'all_contacts'
  | 'past_attendees'
  | 'specific_event'
  | 'volunteers'
  | 'manual_list'
  | 'external_contact_list'
  | 'combined'

export type ResolvedRecipient = {
  email: string
  name?: string | null
  source: string
}

export type RecipientResolution = {
  recipients: ResolvedRecipient[]
  total: number
  sample: ResolvedRecipient[]
  duplicateCount: number
  invalidCount: number
  optedOutCount: number
  inactiveCount: number
  sourceLabel: string
}

export type AudienceConfig = {
  segments?: string[]
  eventIds?: string[]
  externalContactListIds?: string[]
  manualEmails?: string | null
  // Optional per-segment year filter for the year-aware segments
  // ('attendees', 'volunteers', 'sponsors'). Missing/empty array for a key
  // means "all years" for that segment - this keeps old saved campaigns
  // (which never had this field) resolving exactly as they did before.
  categoryYears?: Record<string, number[]>
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function sourceLabel(recipientType: RecipientType) {
  const labels: Record<RecipientType, string> = {
    all_contacts: 'All Contacts',
    past_attendees: 'Past Attendees',
    specific_event: 'Specific Event',
    volunteers: 'Volunteers',
    external_contact_list: 'External Contact List',
    manual_list: 'Manual List',
    combined: 'Combined Audience',
  }
  return labels[recipientType]
}

function displayName(member: {
  preferredName?: string | null
  firstName?: string | null
  lastName?: string | null
}) {
  return (
    member.preferredName ||
    [member.firstName, member.lastName].filter(Boolean).join(' ').trim() ||
    null
  )
}

function parseAudienceConfig(value: unknown): AudienceConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as AudienceConfig

  const categoryYears: Record<string, number[]> = {}
  if (raw.categoryYears && typeof raw.categoryYears === 'object' && !Array.isArray(raw.categoryYears)) {
    for (const [key, years] of Object.entries(raw.categoryYears)) {
      if (Array.isArray(years)) {
        const parsed = years.map(Number).filter((n) => Number.isInteger(n))
        if (parsed.length) categoryYears[key] = parsed
      }
    }
  }

  return {
    segments: Array.isArray(raw.segments) ? raw.segments.map(String) : [],
    eventIds: Array.isArray(raw.eventIds) ? raw.eventIds.map(String) : [],
    externalContactListIds: Array.isArray(raw.externalContactListIds)
      ? raw.externalContactListIds.map(String)
      : [],
    manualEmails: raw.manualEmails ? String(raw.manualEmails) : null,
    categoryYears,
  }
}

// Returns the year filter for a year-aware segment, or null meaning "all years".
function getSegmentYears(config: AudienceConfig, segment: string): number[] | null {
  const years = config.categoryYears?.[segment]
  return years && years.length ? years : null
}

function emptyResolution(label: string): RecipientResolution {
  return {
    recipients: [],
    total: 0,
    sample: [],
    duplicateCount: 0,
    invalidCount: 0,
    optedOutCount: 0,
    inactiveCount: 0,
    sourceLabel: label,
  }
}

function buildRawEmailResolution(
  rows: { email?: string | null; name?: string | null; source?: string | null }[],
  label: string
): RecipientResolution {
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []

  let duplicateCount = 0
  let invalidCount = 0

  for (const row of rows) {
    const email = normalizeEmail(row.email || '')

    if (!email || !isValidEmail(email)) {
      invalidCount++
      continue
    }

    if (seen.has(email)) {
      duplicateCount++
      continue
    }

    seen.add(email)
    recipients.push({
      email,
      name: row.name || null,
      source: row.source || label,
    })
  }

  return {
    recipients,
    total: recipients.length,
    sample: recipients.slice(0, 25),
    duplicateCount,
    invalidCount,
    optedOutCount: 0,
    inactiveCount: 0,
    sourceLabel: label,
  }
}

function buildManualResolution(manualEmails: string | null | undefined, label: string) {
  const raw = (manualEmails || '').split(/[,\n\r\t\s;]+/)
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []
  let duplicateCount = 0
  let invalidCount = 0

  for (const rawEmail of raw) {
    const email = normalizeEmail(rawEmail)
    if (!email) continue

    if (!isValidEmail(email)) {
      invalidCount++
      continue
    }

    if (seen.has(email)) {
      duplicateCount++
      continue
    }

    seen.add(email)
    recipients.push({ email, source: label })
  }

  return {
    recipients,
    total: recipients.length,
    sample: recipients.slice(0, 25),
    duplicateCount,
    invalidCount,
    optedOutCount: 0,
    inactiveCount: 0,
    sourceLabel: label,
  }
}

function mergeResolutions(label: string, resolutions: RecipientResolution[]): RecipientResolution {
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []

  let duplicateCount = 0
  let invalidCount = 0
  let optedOutCount = 0
  let inactiveCount = 0

  for (const resolution of resolutions) {
    duplicateCount += resolution.duplicateCount
    invalidCount += resolution.invalidCount
    optedOutCount += resolution.optedOutCount
    inactiveCount += resolution.inactiveCount

    for (const recipient of resolution.recipients) {
      const email = normalizeEmail(recipient.email)

      if (seen.has(email)) {
        duplicateCount++
        continue
      }

      seen.add(email)
      recipients.push({
        ...recipient,
        email,
      })
    }
  }

  return {
    recipients,
    total: recipients.length,
    sample: recipients.slice(0, 25),
    duplicateCount,
    invalidCount,
    optedOutCount,
    inactiveCount,
    sourceLabel: label,
  }
}

async function resolveSpecificEvent(eventId: string, label: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true },
  })

  const members = await prisma.member.findMany({
    where: {
      registrations: {
        some: { eventId },
      },
    },
    select: memberSelect,
  })

  return buildMemberResolution(members, event?.title ? `Event: ${event.title}` : label)
}

async function resolveExternalContactList(listId: string, label: string) {
  const list = await prisma.externalContactList.findUnique({
    where: { id: listId },
    select: { label: true },
  })

  const members = await prisma.member.findMany({
    where: {
      externalContactLists: {
        some: { externalContactListId: listId },
      },
    },
    select: memberSelect,
  })

  return buildMemberResolution(members, list?.label ? `List: ${list.label}` : label)
}

function yearLabel(base: string, years: number[] | null) {
  return years && years.length ? `${base} (${years.join(', ')})` : `${base} (All years)`
}

// Attendees, any year they were marked as an ATTENDEE participation record.
// `years` null = every year on record.
async function resolveAttendeesSegment(years: number[] | null, label: string) {
  const members = await prisma.member.findMany({
    where: {
      participationRecords: {
        some: years ? { type: 'ATTENDEE', year: { in: years } } : { type: 'ATTENDEE' },
      },
    },
    select: memberSelect,
  })

  return buildMemberResolution(members, label)
}

// Same statuses admin/volunteers and volunteer-shifts pages treat as "actively
// signed up" for a shift - kept in sync manually since it's a small fixed list.
const ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

// Volunteers for a given year. Matches EITHER a VOLUNTEER participation
// record for that year OR an active shift assignment starting in that year -
// most 2026 volunteers only have the latter, since nothing in the live
// signup/assignment flow creates a ParticipationRecord automatically (it's
// only ever written by the one-off bulk participation import tool). Matching
// on assignments too keeps this segment in sync with how admin/volunteers
// already defines "volunteer in year X".
// `years` null = anyone with a volunteer profile at all (matches the
// original, year-less 'volunteers' segment behavior for legacy campaigns).
async function resolveVolunteersSegment(years: number[] | null, label: string) {
  const yearRanges = years
    ? years.map((year) => ({
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      }))
    : null

  const members = await prisma.member.findMany({
    where: {
      volunteerProfile: { isNot: null },
      ...(years && yearRanges
        ? {
            OR: [
              { participationRecords: { some: { type: 'VOLUNTEER', year: { in: years } } } },
              {
                volunteerAssignments: {
                  some: {
                    status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
                    shift: {
                      OR: yearRanges.map((range) => ({ startsAt: range })),
                      archivedAt: null,
                      cancelledAt: null,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      ...memberSelect,
      volunteerProfile: {
        select: {
          archivedAt: true,
          consentToContact: true,
        },
      },
    },
  })

  return buildMemberResolution(members, label, { respectVolunteerConsent: true })
}

// Sponsors, any year they have a SponsorFulfillment record. `years` null =
// sponsor in any year.
async function resolveSponsorsSegment(years: number[] | null, label: string) {
  const members = await prisma.member.findMany({
    where: {
      sponsorFulfillments: {
        some: years ? { eventYear: { in: years } } : {},
      },
    },
    select: memberSelect,
  })

  return buildMemberResolution(members, label)
}

const memberSelect = {
  email: true,
  archivedAt: true,
  promotionalEmailOptOut: true,
  firstName: true,
  lastName: true,
  preferredName: true,
} as const

export async function resolveCampaignRecipients(campaign: {
  recipientType: RecipientType
  recipientEventId?: string | null
  manualEmails?: string | null
  audienceConfig?: unknown
}): Promise<RecipientResolution> {
  const type = campaign.recipientType
  const label = sourceLabel(type)

  const audienceConfig = parseAudienceConfig(campaign.audienceConfig)

  if (type === 'combined') {
    const config = audienceConfig || {}
    const resolutions: RecipientResolution[] = []

    const segments = config.segments || []
    const eventIds = config.eventIds || []
    const externalContactListIds = config.externalContactListIds || []
    const combinedManualEmails = config.manualEmails || campaign.manualEmails || null

    if (segments.includes('all_contacts')) {
      const members = await prisma.member.findMany({ select: memberSelect })
      resolutions.push(buildMemberResolution(members, 'All Contacts'))
    }

    if (segments.includes('past_attendees')) {
      const currentYear = new Date().getFullYear()
      const members = await prisma.member.findMany({
        where: {
          participationRecords: {
            some: {
              type: 'ATTENDEE',
              year: { lt: currentYear },
            },
          },
        },
        select: memberSelect,
      })
      resolutions.push(buildMemberResolution(members, 'Past Attendees'))
    }

    if (segments.includes('attendees')) {
      const years = getSegmentYears(config, 'attendees')
      resolutions.push(await resolveAttendeesSegment(years, yearLabel('Attendees', years)))
    }

    if (segments.includes('volunteers')) {
      const years = getSegmentYears(config, 'volunteers')
      resolutions.push(
        await resolveVolunteersSegment(
          years,
          years ? yearLabel('Volunteers', years) : 'All Volunteer Profiles'
        )
      )
    }

    if (segments.includes('sponsors')) {
      const years = getSegmentYears(config, 'sponsors')
      resolutions.push(await resolveSponsorsSegment(years, yearLabel('Sponsors', years)))
    }

    if (segments.includes('active_2026_volunteers')) {
      const yearStart = new Date(Date.UTC(2026, 0, 1))
      const nextYearStart = new Date(Date.UTC(2027, 0, 1))

      const members = await prisma.member.findMany({
        where: {
          volunteerProfile: { isNot: null },
          volunteerAssignments: {
            some: {
              status: { in: ['Assigned', 'Confirmed', 'Interested'] },
              shift: {
                startsAt: {
                  gte: yearStart,
                  lt: nextYearStart,
                },
                archivedAt: null,
                cancelledAt: null,
              },
            },
          },
        },
        select: {
          ...memberSelect,
          volunteerProfile: {
            select: {
              archivedAt: true,
              consentToContact: true,
            },
          },
        },
      })

      resolutions.push(
        buildMemberResolution(members, '2026 Active Volunteers', {
          respectVolunteerConsent: true,
        })
      )
    }

    if (segments.includes('prior_volunteers_no_2026_shift')) {
      const yearStart = new Date(Date.UTC(2026, 0, 1))
      const nextYearStart = new Date(Date.UTC(2027, 0, 1))

      const members = await prisma.member.findMany({
        where: {
          volunteerProfile: { isNot: null },
          volunteerAssignments: {
            none: {
              status: { in: ['Assigned', 'Confirmed', 'Interested'] },
              shift: {
                startsAt: {
                  gte: yearStart,
                  lt: nextYearStart,
                },
                archivedAt: null,
                cancelledAt: null,
              },
            },
          },
        },
        select: {
          ...memberSelect,
          volunteerProfile: {
            select: {
              archivedAt: true,
              consentToContact: true,
            },
          },
        },
      })

      resolutions.push(
        buildMemberResolution(members, 'Prior Volunteers / No 2026 Shift', {
          respectVolunteerConsent: true,
        })
      )
    }

    if (segments.includes('weekend_crew')) {
      const crewMembers = await prisma.eventCrewMember.findMany({
        where: {
          email: {
            not: null,
          },
        },
        select: {
          name: true,
          email: true,
          position: true,
          event: {
            select: {
              title: true,
            },
          },
        },
      })

      resolutions.push(
        buildRawEmailResolution(
          crewMembers.map((crew) => ({
            email: crew.email,
            name: crew.name,
            source: crew.event?.title
              ? `Weekend Crew: ${crew.event.title}`
              : 'Weekend Crew',
          })),
          'Weekend Crew'
        )
      )
    }

    for (const eventId of eventIds) {
      if (eventId) resolutions.push(await resolveSpecificEvent(eventId, 'Specific Event'))
    }

    for (const listId of externalContactListIds) {
      if (listId) {
        resolutions.push(await resolveExternalContactList(listId, 'External Contact List'))
      }
    }

    if (combinedManualEmails) {
      resolutions.push(buildManualResolution(combinedManualEmails, 'Manual List'))
    }

    if (!resolutions.length) return emptyResolution('Combined Audience')

    return mergeResolutions('Combined Audience', resolutions)
  }

  if (type === 'manual_list') {
    return buildManualResolution(campaign.manualEmails, label)
  }

  if (type === 'external_contact_list') {
    if (!campaign.recipientEventId) return emptyResolution(label)
    return resolveExternalContactList(campaign.recipientEventId, label)
  }

  if (type === 'specific_event') {
    if (!campaign.recipientEventId) return emptyResolution(label)
    return resolveSpecificEvent(campaign.recipientEventId, label)
  }

  if (type === 'volunteers') {
    const members = await prisma.member.findMany({
      where: {
        volunteerProfile: { isNot: null },
      },
      select: {
        ...memberSelect,
        volunteerProfile: {
          select: {
            archivedAt: true,
            consentToContact: true,
          },
        },
      },
    })

    return buildMemberResolution(members, label, { respectVolunteerConsent: true })
  }

  if (type === 'past_attendees') {
    const currentYear = new Date().getFullYear()

    const members = await prisma.member.findMany({
      where: {
        participationRecords: {
          some: {
            type: 'ATTENDEE',
            year: { lt: currentYear },
          },
        },
      },
      select: memberSelect,
    })

    return buildMemberResolution(members, label)
  }

  const members = await prisma.member.findMany({
    select: memberSelect,
  })

  return buildMemberResolution(members, label)
}

function buildMemberResolution(
  members: {
    email: string
    archivedAt?: Date | null
    promotionalEmailOptOut?: boolean | null
    firstName?: string | null
    lastName?: string | null
    preferredName?: string | null
    volunteerProfile?: {
      archivedAt?: Date | null
      consentToContact?: boolean | null
    } | null
  }[],
  label: string,
  options: { respectVolunteerConsent?: boolean } = {}
): RecipientResolution {
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []

  let duplicateCount = 0
  let invalidCount = 0
  let optedOutCount = 0
  let inactiveCount = 0

  for (const member of members) {
    if (member.archivedAt) {
      inactiveCount++
      continue
    }

    if (member.promotionalEmailOptOut) {
      optedOutCount++
      continue
    }

    if (options.respectVolunteerConsent && member.volunteerProfile?.archivedAt) {
      inactiveCount++
      continue
    }

    if (
      options.respectVolunteerConsent &&
      member.volunteerProfile?.consentToContact === false
    ) {
      optedOutCount++
      continue
    }

    const email = normalizeEmail(member.email || '')

    if (!email || !isValidEmail(email)) {
      invalidCount++
      continue
    }

    if (seen.has(email)) {
      duplicateCount++
      continue
    }

    seen.add(email)
    recipients.push({
      email,
      name: displayName(member),
      source: label,
    })
  }

  return {
    recipients,
    total: recipients.length,
    sample: recipients.slice(0, 25),
    duplicateCount,
    invalidCount,
    optedOutCount,
    inactiveCount,
    sourceLabel: label,
  }
}

// Distinct years available across attendees, volunteers, and sponsors, for
// populating the year filter checkboxes in the campaign audience builder.
export async function getAvailableCampaignYears(): Promise<number[]> {
  const [participationYears, sponsorYears] = await Promise.all([
    prisma.participationRecord.findMany({
      distinct: ['year'],
      select: { year: true },
    }),
    prisma.sponsorFulfillment.findMany({
      distinct: ['eventYear'],
      select: { eventYear: true },
    }),
  ])

  const years = new Set<number>()
  for (const row of participationYears) years.add(row.year)
  for (const row of sponsorYears) years.add(row.eventYear)

  return Array.from(years).sort((a, b) => b - a)
}

export async function getRecipientsForCampaign(campaign: {
  recipientType: RecipientType
  recipientEventId?: string | null
  manualEmails?: string | null
  audienceConfig?: unknown
}): Promise<string[]> {
  const resolution = await resolveCampaignRecipients(campaign)
  return resolution.recipients.map((recipient) => recipient.email)
}