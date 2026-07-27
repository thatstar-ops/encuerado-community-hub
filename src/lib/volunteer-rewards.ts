export type RewardLevel = 0 | 1 | 2 | 3

export type VolunteerRewardAssignment = {
  status: string
  shift?: {
    archivedAt?: Date | string | null
    cancelledAt?: Date | string | null
  } | null
}

export type RewardInfo = {
  shiftCount: number
  rawActiveShiftCount: number
  rewardLevel: RewardLevel
  label: string
  items: string[]
  pinIncluded: boolean
  shirtIncluded: boolean
  eventAdmissionIncluded: boolean
  fullVolunteerPackage: boolean
}

const ACTIVE_STATUSES = ['Assigned', 'Confirmed', 'Interested']
const IGNORED_STATUSES = ['Cancelled', 'Declined', 'Removed', 'No Show']

export function isActiveVolunteerAssignment(assignment: VolunteerRewardAssignment) {
  if (!assignment) return false
  if (IGNORED_STATUSES.includes(assignment.status)) return false
  if (!ACTIVE_STATUSES.includes(assignment.status)) return false
  if (assignment.shift?.archivedAt) return false
  if (assignment.shift?.cancelledAt) return false
  return true
}

export function computeVolunteerReward(assignments: VolunteerRewardAssignment[]): RewardInfo {
  const activeAssignments = assignments.filter(isActiveVolunteerAssignment)
  const rawActiveShiftCount = activeAssignments.length
  const shiftCount = Math.min(rawActiveShiftCount, 3)

  let rewardLevel: RewardLevel = 0
  if (shiftCount >= 3) rewardLevel = 3
  else if (shiftCount === 2) rewardLevel = 2
  else if (shiftCount === 1) rewardLevel = 1

  const pinIncluded = rewardLevel >= 1
  const shirtIncluded = rewardLevel >= 2
  const eventAdmissionIncluded = rewardLevel >= 1
  const fullVolunteerPackage = rewardLevel === 3

  const items: string[] = []

  if (rewardLevel === 1) {
    items.push('Free admission to the event you helped make possible')
    items.push('Exclusive Encuerado Weekend 2026 commemorative pin')
  }

  if (rewardLevel === 2) {
    items.push('Official Encuerado Weekend 2026 commemorative T-shirt')
    items.push('Commemorative pin')
    items.push('Free admission to the events you volunteered for')
  }

  if (rewardLevel === 3) {
    items.push('Complete Encuerado Weekend 2026 Volunteer Package')
    items.push('Official commemorative T-shirt')
    items.push('Commemorative pin')
    items.push('Free admission to all the events you helped make possible')
  }

  let label = 'No volunteer reward yet'
  if (rewardLevel === 1) label = '1-shift volunteer reward'
  else if (rewardLevel === 2) label = '2-shift volunteer reward'
  else if (rewardLevel === 3) label = '3-shift complete volunteer package'

  return {
    shiftCount,
    rawActiveShiftCount,
    rewardLevel,
    label,
    items,
    pinIncluded,
    shirtIncluded,
    eventAdmissionIncluded,
    fullVolunteerPackage,
  }
}