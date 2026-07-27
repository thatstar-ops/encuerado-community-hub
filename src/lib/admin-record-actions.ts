'use server'

import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type NoticeStatus = 'success' | 'blocked'

function safeReturnTo(returnTo: string) {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/admin'
  }

  return returnTo
}

function redirectWithNotice(
  returnTo: string,
  status: NoticeStatus,
  message: string
): never {
  const target = safeReturnTo(returnTo)
  const separator = target.includes('?') ? '&' : '?'

  redirect(
    `${target}${separator}actionStatus=${status}&actionMessage=${encodeURIComponent(
      message
    )}`
  )
}

async function requireAdmin(returnTo: string) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect(`/admin/login?redirect=${encodeURIComponent(safeReturnTo(returnTo))}`)
  }
}

function confirmationPhrase(formData: FormData, expected: string) {
  return String(formData.get('confirmPhrase') || '').trim() === expected
}
export async function publishEvent(eventId: string, returnTo: string) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(returnTo)}`)

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, archivedAt: true, cancelledAt: true },
  })
  if (!event) {
    redirectWithNotice(returnTo, 'blocked', 'Event not found.')
  }
  if (event.archivedAt || event.cancelledAt) {
    redirectWithNotice(returnTo, 'blocked', 'Cannot publish an archived or cancelled event.')
  }
  if (event.status !== 'Draft') {
    redirectWithNotice(returnTo, 'blocked', 'Only Draft events can be published.')
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'Published' },
  })

  redirectWithNotice(returnTo, 'success', 'Event published successfully.')
}

export async function moveEventToDraft(eventId: string, returnTo: string) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=${encodeURIComponent(returnTo)}`)

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, archivedAt: true, cancelledAt: true },
  })
  if (!event) {
    redirectWithNotice(returnTo, 'blocked', 'Event not found.')
  }
  if (event.archivedAt || event.cancelledAt) {
    redirectWithNotice(returnTo, 'blocked', 'Cannot move an archived or cancelled event to Draft.')
  }
  if (event.status !== 'Published') {
    redirectWithNotice(returnTo, 'blocked', 'Only Published events can be moved back to Draft.')
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'Draft' },
  })

  redirectWithNotice(returnTo, 'success', 'Event moved back to Draft successfully.')
}

export async function archiveEvent(eventId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.event.update({
    where: { id: eventId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Event archived. History was kept.')
}

export async function cancelEvent(eventId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.event.update({
    where: { id: eventId },
    data: {
      cancelledAt: new Date(),
      status: 'Cancelled',
    },
  })

  redirectWithNotice(returnTo, 'success', 'Event cancelled. Registrations were kept.')
}

export async function restoreEvent(eventId: string, returnTo: string) {
  await requireAdmin(returnTo)

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true },
  })

  if (!event) {
    redirectWithNotice(returnTo, 'blocked', 'Event could not be found.')
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      archivedAt: null,
      cancelledAt: null,
      status: event.status === 'Cancelled' ? 'Draft' : event.status,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Event restored to active lists.')
}

export async function permanentlyDeleteEvent(
  eventId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  if (!confirmationPhrase(formData, 'DELETE')) {
    redirectWithNotice(returnTo, 'blocked', 'Type DELETE to permanently delete.')
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      sourceUrl: true,
      externalKey: true,
      _count: {
        select: {
          registrations: true,
          volunteerShifts: true,
        },
      },
    },
  })

  if (!event) {
    redirectWithNotice(returnTo, 'blocked', 'Event could not be found.')
  }

  const blockers = []

  if (event._count.registrations > 0) blockers.push('registrations')
  if (event._count.volunteerShifts > 0) blockers.push('volunteer shifts')
  if (event.sourceUrl || event.externalKey) blockers.push('imported source data')

  if (blockers.length > 0) {
    redirectWithNotice(
      returnTo,
      'blocked',
      `This event has ${blockers.join(', ')}, so archive or cancel it instead.`
    )
  }

  await prisma.event.delete({ where: { id: eventId } })

  redirectWithNotice('/events', 'success', 'Event permanently deleted.')
}

export async function archiveMember(memberId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.member.update({
    where: { id: memberId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Attendee archived. History was kept.')
}

export async function restoreMember(memberId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.member.update({
    where: { id: memberId },
    data: { archivedAt: null },
  })

  redirectWithNotice(returnTo, 'success', 'Attendee restored to active lists.')
}

export async function permanentlyDeleteMember(
  memberId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  if (!confirmationPhrase(formData, 'DELETE')) {
    redirectWithNotice(returnTo, 'blocked', 'Type DELETE to permanently delete.')
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      volunteerProfile: { select: { id: true } },
      _count: {
        select: {
          registrations: true,
          volunteerAssignments: true,
          participationRecords: true,
          emailLogs: true,
        },
      },
    },
  })

  if (!member) {
    redirectWithNotice(returnTo, 'blocked', 'Attendee could not be found.')
  }

  const blockers = []

  if (member._count.registrations > 0) blockers.push('event registrations')
  if (member._count.volunteerAssignments > 0) blockers.push('volunteer assignments')
  if (member._count.participationRecords > 0) blockers.push('participation history')
  if (member._count.emailLogs > 0) blockers.push('email history')
  if (member.volunteerProfile) blockers.push('volunteer profile')

  if (blockers.length > 0) {
    redirectWithNotice(
      returnTo,
      'blocked',
      `This attendee has ${blockers.join(', ')}, so archive the attendee instead.`
    )
  }

  await prisma.member.delete({ where: { id: memberId } })

  redirectWithNotice('/members', 'success', 'Attendee permanently deleted.')
}

export async function archiveVolunteerProfile(
  volunteerProfileId: string,
  returnTo: string
) {
  await requireAdmin(returnTo)

  await prisma.volunteerProfile.update({
    where: { id: volunteerProfileId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Volunteer archived. Member history was kept.')
}

export async function restoreVolunteerProfile(
  volunteerProfileId: string,
  returnTo: string
) {
  await requireAdmin(returnTo)

  await prisma.volunteerProfile.update({
    where: { id: volunteerProfileId },
    data: { archivedAt: null },
  })

  redirectWithNotice(returnTo, 'success', 'Volunteer restored to active lists.')
}

export async function archiveShift(shiftId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.volunteerShift.update({
    where: { id: shiftId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Shift archived. Assignments were kept.')
}

export async function cancelShift(shiftId: string, returnTo: string) {
  await requireAdmin(returnTo)

  await prisma.volunteerShift.update({
    where: { id: shiftId },
    data: {
      cancelledAt: new Date(),
      status: 'Cancelled',
    },
  })

  redirectWithNotice(returnTo, 'success', 'Shift cancelled. Assignments were kept.')
}

export async function restoreShift(shiftId: string, returnTo: string) {
  await requireAdmin(returnTo)

  const shift = await prisma.volunteerShift.findUnique({
    where: { id: shiftId },
    select: { status: true },
  })

  if (!shift) {
    redirectWithNotice(returnTo, 'blocked', 'Shift could not be found.')
  }

  await prisma.volunteerShift.update({
    where: { id: shiftId },
    data: {
      archivedAt: null,
      cancelledAt: null,
      status: shift.status === 'Cancelled' ? 'Open' : shift.status,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Shift restored to active lists.')
}

export async function permanentlyDeleteShift(
  shiftId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  if (!confirmationPhrase(formData, 'DELETE')) {
    redirectWithNotice(returnTo, 'blocked', 'Type DELETE to permanently delete.')
  }

  const shift = await prisma.volunteerShift.findUnique({
    where: { id: shiftId },
    select: {
      _count: {
        select: {
          assignments: true,
        },
      },
    },
  })

  if (!shift) {
    redirectWithNotice(returnTo, 'blocked', 'Shift could not be found.')
  }

  if (shift._count.assignments > 0) {
    redirectWithNotice(
      returnTo,
      'blocked',
      'This shift has volunteer assignments, so cancel or archive it instead.'
    )
  }

  await prisma.volunteerShift.delete({ where: { id: shiftId } })

  redirectWithNotice('/shifts', 'success', 'Shift permanently deleted.')
}

export async function removeRegistration(
  eventId: string,
  registrationId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  if (!confirmationPhrase(formData, 'REMOVE')) {
    redirectWithNotice(returnTo, 'blocked', 'Type REMOVE to remove this registration.')
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { eventId: true },
  })

  if (!registration || registration.eventId !== eventId) {
    redirectWithNotice(returnTo, 'blocked', 'Registration could not be found.')
  }

  await prisma.eventRegistration.delete({
    where: { id: registrationId },
  })

  redirectWithNotice(
    `/events/${eventId}`,
    'success',
    'Registration removed. The attendee profile was kept.'
  )
}

export async function removeVolunteerAssignment(
  shiftId: string,
  assignmentId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  if (!confirmationPhrase(formData, 'REMOVE')) {
    redirectWithNotice(returnTo, 'blocked', 'Type REMOVE to remove this assignment.')
  }

  const assignment = await prisma.volunteerAssignment.findUnique({
    where: { id: assignmentId },
    select: { shiftId: true },
  })

  if (!assignment || assignment.shiftId !== shiftId) {
    redirectWithNotice(returnTo, 'blocked', 'Assignment could not be found.')
  }

  await prisma.volunteerAssignment.delete({
    where: { id: assignmentId },
  })

  redirectWithNotice(
    `/shifts/${shiftId}/edit`,
    'success',
    'Volunteer removed from this shift. Member and volunteer profile were kept.'
  )
}

export async function addVolunteerAssignmentToMember(
  memberId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  const shiftId = String(formData.get('shiftId') || '').trim()
  if (!shiftId) {
    redirectWithNotice(returnTo, 'blocked', 'Choose a shift before adding an assignment.')
  }

  const activeStatuses = ['Assigned', 'Confirmed', 'Interested']

  const [member, shift] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        volunteerProfile: { select: { id: true } },
        volunteerAssignments: {
          where: {
            status: { in: activeStatuses },
            shift: {
              archivedAt: null,
              cancelledAt: null,
            },
          },
          select: { shiftId: true },
        },
      },
    }),
    prisma.volunteerShift.findFirst({
      where: {
        id: shiftId,
        status: 'Open',
        archivedAt: null,
        cancelledAt: null,
      },
      include: {
        assignments: {
          where: { status: { in: activeStatuses } },
          select: { memberId: true },
        },
      },
    }),
  ])

  if (!member) {
    redirectWithNotice(returnTo, 'blocked', 'Volunteer member could not be found.')
  }

  if (!shift) {
    redirectWithNotice(returnTo, 'blocked', 'Shift is not open or could not be found.')
  }

  const alreadyAssigned = shift.assignments.some(
    (assignment) => assignment.memberId === memberId
  )

  const spotsLeft = Math.max(shift.neededCount - shift.assignments.length, 0)
  if (spotsLeft <= 0 && !alreadyAssigned) {
    redirectWithNotice(returnTo, 'blocked', 'This shift is already full.')
  }

  await prisma.volunteerProfile.upsert({
    where: { memberId },
    update: {
      status: 'Assigned',
      consentToContact: true,
    },
    create: {
      memberId,
      status: 'Assigned',
      consentToContact: true,
    },
  })

  await prisma.volunteerAssignment.upsert({
    where: {
      shiftId_memberId: {
        shiftId,
        memberId,
      },
    },
    update: {
      status: 'Assigned',
    },
    create: {
      shiftId,
      memberId,
      status: 'Assigned',
    },
  })

  const alreadyHadThisShift = member.volunteerAssignments.some(
    (assignment) => assignment.shiftId === shiftId
  )
  const projectedActiveShiftCount = alreadyHadThisShift
    ? member.volunteerAssignments.length
    : member.volunteerAssignments.length + 1

  if (projectedActiveShiftCount > 3) {
    redirectWithNotice(
      returnTo,
      'success',
      'Shift added. Note: this volunteer now has more than 3 active shifts.'
    )
  }

  redirectWithNotice(returnTo, 'success', 'Volunteer shift assignment added.')
}

export async function removeVolunteerAssignmentFromAdmin(
  assignmentId: string,
  returnTo: string
) {
  await requireAdmin(returnTo)

  const assignment = await prisma.volunteerAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  })

  if (!assignment) {
    redirectWithNotice(returnTo, 'blocked', 'Volunteer assignment could not be found.')
  }

  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: { status: 'Removed' },
  })

  redirectWithNotice(returnTo, 'success', 'Volunteer assignment removed from active shifts.')
}