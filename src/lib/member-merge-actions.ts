'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

function redirectWithNotice(status: 'success' | 'blocked', message: string): never {
  const params = new URLSearchParams({ actionStatus: status, actionMessage: message })
  redirect(`/admin/members/merge?${params.toString()}`)
}

/**
 * Merges a duplicate Member record (`mergeId`) into the surviving record
 * (`keepId`): reassigns every related row (registrations, tickets, sponsor
 * fulfillments, volunteer history, participation records, email history,
 * saved-list memberships) onto the keeper, then archives the loser instead
 * of deleting it - preserving history and an audit trail.
 *
 * Several child tables have a unique constraint on memberId + something else
 * (e.g. one EventRegistration per member per event). Where both members
 * already have a conflicting row, the keeper's row wins and the loser's
 * duplicate row is dropped rather than reassigned (reassigning would violate
 * the constraint).
 */
export async function mergeMembers(formData: FormData) {
  await requireSuperAdmin()

  const keepId = String(formData.get('keepId') || '').trim()
  const mergeId = String(formData.get('mergeId') || '').trim()
  const confirmPhrase = String(formData.get('confirmPhrase') || '').trim()

  if (!keepId || !mergeId) redirectWithNotice('blocked', 'Choose two members to merge.')
  if (keepId === mergeId) redirectWithNotice('blocked', 'Choose two different members.')
  if (confirmPhrase !== 'MERGE') redirectWithNotice('blocked', 'Type MERGE to confirm the merge.')

  const [keeper, loser] = await Promise.all([
    prisma.member.findUnique({ where: { id: keepId } }),
    prisma.member.findUnique({ where: { id: mergeId } }),
  ])

  if (!keeper || !loser) redirectWithNotice('blocked', 'One or both members could not be found.')
  if (loser.archivedAt) redirectWithNotice('blocked', 'That member record is already archived.')

  const dateStr = new Date().toISOString().slice(0, 10)
  // Free up the loser's email address rather than leaving it live on an
  // archived record. Using the .invalid TLD (reserved by RFC 2606) makes it
  // obvious this address is intentionally dead. If this exact email is used
  // again later (e.g. a future TicketSpice order), it'll create a fresh
  // Member rather than silently reviving this archived duplicate - a new
  // record is a safer failure mode than a silent resurrection, and staff can
  // merge again if needed.
  const archivedEmail = `merged-${mergeId}@duplicate.invalid`

  await prisma.$transaction(async (tx) => {
    // ParticipationRecord: unique(memberId, year, type)
    const loserParticipation = await tx.participationRecord.findMany({ where: { memberId: mergeId } })
    const keeperParticipationKeys = new Set(
      (
        await tx.participationRecord.findMany({
          where: { memberId: keepId },
          select: { year: true, type: true },
        })
      ).map((r) => `${r.year}:${r.type}`)
    )
    for (const record of loserParticipation) {
      const key = `${record.year}:${record.type}`
      if (keeperParticipationKeys.has(key)) {
        await tx.participationRecord.delete({ where: { id: record.id } })
      } else {
        await tx.participationRecord.update({ where: { id: record.id }, data: { memberId: keepId } })
        keeperParticipationKeys.add(key)
      }
    }

    // EventRegistration: unique(memberId, eventId)
    const loserRegistrations = await tx.eventRegistration.findMany({ where: { memberId: mergeId } })
    const keeperEventIds = new Set(
      (
        await tx.eventRegistration.findMany({ where: { memberId: keepId }, select: { eventId: true } })
      ).map((r) => r.eventId)
    )
    for (const registration of loserRegistrations) {
      if (keeperEventIds.has(registration.eventId)) {
        await tx.eventRegistration.delete({ where: { id: registration.id } })
      } else {
        await tx.eventRegistration.update({ where: { id: registration.id }, data: { memberId: keepId } })
        keeperEventIds.add(registration.eventId)
      }
    }

    // VolunteerProfile: one per member (unique memberId).
    const [keeperProfile, loserProfile] = await Promise.all([
      tx.volunteerProfile.findUnique({ where: { memberId: keepId } }),
      tx.volunteerProfile.findUnique({ where: { memberId: mergeId } }),
    ])

    if (loserProfile) {
      if (!keeperProfile) {
        await tx.volunteerProfile.update({ where: { id: loserProfile.id }, data: { memberId: keepId } })
      } else {
        await tx.volunteerProfile.update({
          where: { id: keeperProfile.id },
          data: {
            preferredRoles: keeperProfile.preferredRoles || loserProfile.preferredRoles,
            availability: keeperProfile.availability || loserProfile.availability,
            experience: keeperProfile.experience || loserProfile.experience,
            emergencyName: keeperProfile.emergencyName || loserProfile.emergencyName,
            emergencyPhone: keeperProfile.emergencyPhone || loserProfile.emergencyPhone,
            shirtSize: keeperProfile.shirtSize || loserProfile.shirtSize,
            notes: [keeperProfile.notes, loserProfile.notes].filter(Boolean).join('\n') || null,
          },
        })
        await tx.volunteerProfile.delete({ where: { id: loserProfile.id } })
      }
    }

    // VolunteerAssignment: unique(shiftId, memberId)
    const loserAssignments = await tx.volunteerAssignment.findMany({ where: { memberId: mergeId } })
    const keeperShiftIds = new Set(
      (
        await tx.volunteerAssignment.findMany({ where: { memberId: keepId }, select: { shiftId: true } })
      ).map((r) => r.shiftId)
    )
    for (const assignment of loserAssignments) {
      if (keeperShiftIds.has(assignment.shiftId)) {
        await tx.volunteerAssignment.delete({ where: { id: assignment.id } })
      } else {
        await tx.volunteerAssignment.update({ where: { id: assignment.id }, data: { memberId: keepId } })
        keeperShiftIds.add(assignment.shiftId)
      }
    }

    // EmailCampaignRecipientQueue + EmailLog: no memberId-scoped unique
    // constraint, safe to bulk reassign.
    await tx.emailCampaignRecipientQueue.updateMany({ where: { memberId: mergeId }, data: { memberId: keepId } })
    await tx.emailLog.updateMany({ where: { memberId: mergeId }, data: { memberId: keepId } })

    // ExternalContactListMember: unique(externalContactListId, memberId)
    const loserListMemberships = await tx.externalContactListMember.findMany({ where: { memberId: mergeId } })
    const keeperListIds = new Set(
      (
        await tx.externalContactListMember.findMany({
          where: { memberId: keepId },
          select: { externalContactListId: true },
        })
      ).map((r) => r.externalContactListId)
    )
    for (const membership of loserListMemberships) {
      if (keeperListIds.has(membership.externalContactListId)) {
        await tx.externalContactListMember.delete({ where: { id: membership.id } })
      } else {
        await tx.externalContactListMember.update({
          where: { id: membership.id },
          data: { memberId: keepId },
        })
        keeperListIds.add(membership.externalContactListId)
      }
    }

    // TicketPurchase: no memberId-scoped unique constraint, safe to bulk reassign.
    await tx.ticketPurchase.updateMany({ where: { memberId: mergeId }, data: { memberId: keepId } })

    // SponsorFulfillment: unique(memberId, eventYear)
    const loserSponsorships = await tx.sponsorFulfillment.findMany({ where: { memberId: mergeId } })
    const keeperSponsorYears = new Set(
      (
        await tx.sponsorFulfillment.findMany({ where: { memberId: keepId }, select: { eventYear: true } })
      ).map((r) => r.eventYear)
    )
    for (const sponsorship of loserSponsorships) {
      if (keeperSponsorYears.has(sponsorship.eventYear)) {
        await tx.sponsorFulfillment.delete({ where: { id: sponsorship.id } })
      } else {
        await tx.sponsorFulfillment.update({ where: { id: sponsorship.id }, data: { memberId: keepId } })
        keeperSponsorYears.add(sponsorship.eventYear)
      }
    }

    const mergeNote = `Merged into ${keeper.firstName} ${keeper.lastName} <${keeper.email}> (id ${keepId}) on ${dateStr}. Original email was ${loser.email}.`
    const keeperNote = `Merged duplicate: ${loser.firstName} ${loser.lastName} <${loser.email}> (id ${mergeId}) on ${dateStr}.`

    await tx.member.update({
      where: { id: mergeId },
      data: {
        archivedAt: new Date(),
        email: archivedEmail,
        notes: [loser.notes, mergeNote].filter(Boolean).join('\n'),
      },
    })

    await tx.member.update({
      where: { id: keepId },
      data: {
        notes: [keeper.notes, keeperNote].filter(Boolean).join('\n'),
        firstYearAttended: Math.min(keeper.firstYearAttended, loser.firstYearAttended),
      },
    })
  })

  redirectWithNotice(
    'success',
    `Merged ${loser.firstName} ${loser.lastName} (${loser.email}) into ${keeper.firstName} ${keeper.lastName} (${keeper.email}). The duplicate record was archived.`
  )
}
