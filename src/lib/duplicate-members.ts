import { prisma } from './prisma'

export type DuplicateCandidate = {
  id: string
  firstName: string
  lastName: string
  preferredName: string | null
  email: string
  phone: string | null
  city: string | null
  state: string | null
  createdAt: Date
  recordCount: number
  counts: {
    registrations: number
    volunteerAssignments: number
    ticketPurchases: number
    sponsorFulfillments: number
    participationRecords: number
  }
}

export type DuplicateGroup = {
  matchedBy: 'name' | 'phone'
  members: DuplicateCandidate[]
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

/**
 * Scans active (non-archived) members for likely duplicates by matching
 * normalized full name or normalized phone number. Every candidate pair
 * necessarily has a *different* email (Member.email is unique in the
 * schema) - this exists specifically to catch the case every member-creation
 * path (TicketSpice webhook, CSV import, manual entry) misses: same person,
 * different email address, so no automatic path ever recognized them as the
 * same member.
 *
 * This is discovery only, not auto-merge. A shared name is a strong hint,
 * not proof - two different real people can share a name. A human still
 * has to look at both records and type MERGE to confirm.
 */
export async function findPossibleDuplicateGroups(): Promise<DuplicateGroup[]> {
  const members = await prisma.member.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      createdAt: true,
      _count: {
        select: {
          registrations: true,
          volunteerAssignments: true,
          ticketPurchases: true,
          sponsorFulfillments: true,
          participationRecords: true,
        },
      },
    },
  })

  const toCandidate = (member: (typeof members)[number]): DuplicateCandidate => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    preferredName: member.preferredName,
    email: member.email,
    phone: member.phone,
    city: member.city,
    state: member.state,
    createdAt: member.createdAt,
    recordCount:
      member._count.registrations +
      member._count.volunteerAssignments +
      member._count.ticketPurchases +
      member._count.sponsorFulfillments +
      member._count.participationRecords,
    counts: member._count,
  })

  const byName = new Map<string, typeof members>()
  const byPhone = new Map<string, typeof members>()

  for (const member of members) {
    const nameKey = normalizeName(`${member.firstName} ${member.lastName}`)
    if (nameKey) {
      const bucket = byName.get(nameKey) || []
      bucket.push(member)
      byName.set(nameKey, bucket)
    }

    const phoneKey = member.phone ? normalizePhone(member.phone) : ''
    // Skip too-short "phone" values (e.g. leftover junk data) to avoid noise.
    if (phoneKey.length >= 7) {
      const bucket = byPhone.get(phoneKey) || []
      bucket.push(member)
      byPhone.set(phoneKey, bucket)
    }
  }

  const groups: DuplicateGroup[] = []
  const seenPairKeys = new Set<string>()

  function pairKey(ids: string[]) {
    return [...ids].sort().join(':')
  }

  for (const bucket of byName.values()) {
    if (bucket.length < 2) continue
    const key = pairKey(bucket.map((m) => m.id))
    if (seenPairKeys.has(key)) continue
    seenPairKeys.add(key)
    groups.push({ matchedBy: 'name', members: bucket.map(toCandidate) })
  }

  for (const bucket of byPhone.values()) {
    if (bucket.length < 2) continue
    const key = pairKey(bucket.map((m) => m.id))
    if (seenPairKeys.has(key)) continue
    seenPairKeys.add(key)
    groups.push({ matchedBy: 'phone', members: bucket.map(toCandidate) })
  }

  return groups
}
