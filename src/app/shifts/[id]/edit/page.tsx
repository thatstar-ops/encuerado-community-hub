import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  archiveShift,
  cancelShift,
  permanentlyDeleteShift,
  removeVolunteerAssignment,
  restoreShift,
} from '@/lib/admin-record-actions'
import {
  dateToEventDateTimeLocalValue,
  eventDateTimeLocalToUtcDate,
} from '@/lib/timezone'

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

async function updateShift(shiftId: string, formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/edit`)

  const eventId = String(formData.get('eventId') || '').trim()
  const roleId = String(formData.get('roleId') || '').trim()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const locationInput = String(formData.get('location') || '').trim()
  const startsAt = String(formData.get('startsAt') || '').trim()
  const endsAt = String(formData.get('endsAt') || '').trim()
  const neededCountRaw = String(formData.get('neededCount') || '1').trim()
  const status = String(formData.get('status') || 'Open').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!eventId || !title || !startsAt) {
    throw new Error('Event, title, and start time are required.')
  }

  if (roleId) {
    const role = await prisma.volunteerRole.findUnique({ where: { id: roleId }, select: { id: true } })
    if (!role) throw new Error('Choose a valid role.')
  }

  const [currentShift, selectedEvent] = await Promise.all([
    prisma.volunteerShift.findUnique({
      where: { id: shiftId },
      select: { eventId: true },
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: {
        archivedAt: true,
        cancelledAt: true,
        status: true,
        location: true,
      },
    }),
  ])

  if (!currentShift || !selectedEvent) {
    throw new Error('Shift or event could not be found.')
  }

  const selectedEventInactive =
    selectedEvent.archivedAt ||
    selectedEvent.cancelledAt ||
    selectedEvent.status === 'Cancelled'

  if (selectedEventInactive && currentShift.eventId !== eventId) {
    throw new Error('Choose an active event for this shift.')
  }

  const parsedStartsAt = eventDateTimeLocalToUtcDate(startsAt)
  const parsedEndsAt = endsAt ? eventDateTimeLocalToUtcDate(endsAt) : null

  if (parsedEndsAt && parsedEndsAt <= parsedStartsAt) {
    throw new Error('End time must be after start time.')
  }

  await prisma.volunteerShift.update({
    where: { id: shiftId },
    data: {
      eventId,
      roleId: roleId || null,
      title,
      description: description || null,
      // Defaults to the event's location; an admin can type a different
      // address here to override it for just this shift (e.g. an offsite
      // location or a different building on the venue).
      location: locationInput || selectedEvent.location || null,
      startsAt: parsedStartsAt,
      endsAt: parsedEndsAt,
      neededCount: Number(neededCountRaw) || 1,
      status,
      notes: notes || null,
    },
  })

  redirect('/shifts/calendar')
}

async function assignVolunteer(shiftId: string, formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/edit`)

  const memberId = String(formData.get('memberId') || '').trim()

  if (!memberId) {
    throw new Error('Please choose a member.')
  }

  const [shift, member] = await Promise.all([
    prisma.volunteerShift.findUnique({
      where: { id: shiftId },
      select: {
        archivedAt: true,
        cancelledAt: true,
        status: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: { archivedAt: true },
    }),
  ])

  if (!shift || shift.archivedAt || shift.cancelledAt || shift.status === 'Cancelled') {
    throw new Error('Restore this shift before adding volunteers.')
  }

  if (!member || member.archivedAt) {
    throw new Error('Choose an active member.')
  }

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

  redirect(`/shifts/${shiftId}/edit`)
}

async function saveVolunteerStatus(
  shiftId: string,
  assignmentId: string,
  formData: FormData
) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/edit`)

  const selectedStatus = String(formData.get('status') || 'Assigned').trim()
  const checkedIn = formData.get('checkedIn') === 'on'
  const shirtGiven = formData.get('shirtGiven') === 'on'
  const notes = String(formData.get('notes') || '').trim()

  const finalStatus = checkedIn ? 'Attended' : selectedStatus

  await prisma.volunteerAssignment.update({
    where: {
      id: assignmentId,
    },
    data: {
      status: finalStatus,
      checkedIn,
      shirtGiven,
      notes: notes || null,
    },
  })

  redirect(`/shifts/${shiftId}/edit`)
}

async function quickCheckInVolunteer(shiftId: string, assignmentId: string) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/edit`)

  await prisma.volunteerAssignment.update({
    where: {
      id: assignmentId,
    },
    data: {
      status: 'Attended',
      checkedIn: true,
    },
  })

  redirect(`/shifts/${shiftId}/edit`)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect(`/admin/login?redirect=/shifts/${id}/edit`)
  }

  const shift = await prisma.volunteerShift.findUnique({
    where: { id },
    include: {
      event: true,
      role: true,
      assignments: {
        include: {
          member: {
            include: {
              volunteerProfile: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  })

  if (!shift) {
    notFound()
  }

  const events = await prisma.event.findMany({
    where: {
      OR: [
        { id: shift.eventId },
        {
          archivedAt: null,
          cancelledAt: null,
          NOT: {
            status: 'Cancelled',
          },
        },
      ],
    },
    orderBy: {
      startsAt: 'asc',
    },
  })

  const assignedMemberIds = shift.assignments.map(
    (assignment) => assignment.memberId
  )

  const roles = await prisma.volunteerRole.findMany({
    where: {
      OR: [{ archivedAt: null }, { id: shift.roleId || '' }],
    },
    orderBy: { title: 'asc' },
  })

  const availableMembers = await prisma.member.findMany({
    where: {
      archivedAt: null,
      id: {
        notIn: assignedMemberIds,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const assignedCount = shift.assignments.length
  const checkedInCount = shift.assignments.filter(
    (assignment) => assignment.checkedIn
  ).length
  const shirtGivenCount = shift.assignments.filter(
    (assignment) => assignment.shirtGiven
  ).length
  const spotsLeft = Math.max(shift.neededCount - assignedCount, 0)

  const updateShiftWithId = updateShift.bind(null, shift.id)
  const assignVolunteerWithShiftId = assignVolunteer.bind(null, shift.id)
  const shiftIsInactive = Boolean(
    shift.archivedAt || shift.cancelledAt || shift.status === 'Cancelled'
  )
  const returnTo = `/shifts/${shift.id}/edit`
  const archiveShiftWithId = archiveShift.bind(null, shift.id, returnTo)
  const cancelShiftWithId = cancelShift.bind(null, shift.id, returnTo)
  const restoreShiftWithId = restoreShift.bind(null, shift.id, returnTo)
  const permanentlyDeleteShiftWithId = permanentlyDeleteShift.bind(
    null,
    shift.id,
    returnTo
  )

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <ActionNotice
          message={queryParams.actionMessage}
          status={queryParams.actionStatus}
        />

        <div className="mb-6">
          <Link
            href="/shifts/calendar"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to calendar
          </Link>
        </div>

        <div className="grid gap-6">
          <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
            <h1 className="text-4xl font-black uppercase tracking-wide text-white">Edit Volunteer Shift</h1>
            <p className="mt-3 text-lg text-[#B7B7B7]">
              Update shift details, coverage needs, and status.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                <div className="text-sm font-semibold text-[#8F8F8F]">
                  Assigned
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {assignedCount}
                </div>
              </div>

              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                <div className="text-sm font-semibold text-[#8F8F8F]">
                  Checked In
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {checkedInCount}
                </div>
              </div>

              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                <div className="text-sm font-semibold text-[#8F8F8F]">
                  Shirt Given
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {shirtGivenCount}
                </div>
              </div>

              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                <div className="text-sm font-semibold text-[#8F8F8F]">
                  Spots Left
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {spotsLeft}
                </div>
              </div>
            </div>

            <form action={updateShiftWithId} className="mt-8 grid gap-5">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Event *</span>
                <select
                  name="eventId"
                  required
                  defaultValue={shift.eventId}
                  className={inputClass}
                >
                  <option value="">Select an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Shift title *</span>
                <input
                  name="title"
                  required
                  defaultValue={shift.title}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Location / Address</span>
                <input
                  name="location"
                  defaultValue={shift.location || ''}
                  placeholder="Leave blank to use the event's location"
                  className={inputClass}
                />
                <span className="text-sm text-[#8F8F8F]">
                  Defaults to the selected event&apos;s location. Type an address here to override
                  it for just this shift (e.g. a different building or an offsite location).
                  Clear this field and save to go back to using the event's location.
                </span>
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Role (job description)</span>
                <select name="roleId" defaultValue={shift.roleId || ''} className={inputClass}>
                  <option value="">No role — use the description field below only</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                      {role.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-[#8F8F8F]">
                  Linking a role includes its job description in the shift reminder email.{' '}
                  <Link href="/admin/volunteer-roles" className="text-[#B11218] hover:underline">
                    Manage roles →
                  </Link>
                </span>
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={shift.description || ''}
                  className={inputClass}
                />
                <span className="text-sm text-[#8F8F8F]">
                  Shift-specific notes only (not included in reminder emails). Use a Role above
                  for the reusable job description.
                </span>
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Starts at *</span>
                  <input
                    name="startsAt"
                    type="datetime-local"
                    required
                    defaultValue={dateToEventDateTimeLocalValue(shift.startsAt)}
                    className={inputClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Ends at</span>
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={dateToEventDateTimeLocalValue(shift.endsAt)}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    Volunteers needed
                  </span>
                  <input
                    name="neededCount"
                    type="number"
                    min="1"
                    defaultValue={shift.neededCount}
                    className={inputClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Status</span>
                  <select
                    name="status"
                    defaultValue={shift.status}
                    className={inputClass}
                  >
                    <option value="Open">Open</option>
                    <option value="Full">Full</option>
                    <option value="Closed">Closed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Internal notes</span>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={shift.notes || ''}
                  className={inputClass}
                />
              </label>

              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Save Shift Details
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
            <h2 className="text-3xl font-bold text-white">Shift Controls</h2>
            <p className="mt-3 text-[#B7B7B7]">
              Archive or cancel this shift to remove it from active planning and signup views while keeping assignments.
            </p>

            <div className="mt-5 grid gap-4">
              {shiftIsInactive ? (
                <details className="rounded-xl border border-[#B11218] bg-[#151111] p-4">
                  <summary className="cursor-pointer font-bold text-[#B11218]">
                    Restore Shift
                  </summary>
                  <p className="mt-3 text-sm text-[#B7B7B7]">
                    This returns the shift to active lists. Cancelled shifts are restored as Open.
                  </p>
                  <form action={restoreShiftWithId} className="mt-4">
                    <button
                      type="submit"
                      className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                    >
                      Restore Shift
                    </button>
                  </form>
                </details>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <details className="rounded-xl border border-[#3A1215] bg-[#151111] p-4">
                    <summary className="cursor-pointer font-bold text-[#B11218]">
                      Archive Shift
                    </summary>
                    <p className="mt-3 text-sm text-[#B7B7B7]">
                      This hides the shift from active lists and public signup while keeping assignments.
                    </p>
                    <form action={archiveShiftWithId} className="mt-4">
                      <button
                        type="submit"
                        className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                      >
                        Archive Shift
                      </button>
                    </form>
                  </details>

                  <details className="rounded-xl border border-[#3A1215] bg-[#151111] p-4">
                    <summary className="cursor-pointer font-bold text-[#B11218]">
                      Cancel Shift
                    </summary>
                    <p className="mt-3 text-sm text-[#B7B7B7]">
                      This marks the shift cancelled and keeps every assignment.
                    </p>
                    <form action={cancelShiftWithId} className="mt-4">
                      <button
                        type="submit"
                        className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                      >
                        Cancel Shift
                      </button>
                    </form>
                  </details>
                </div>
              )}

              <details className="rounded-xl border border-[#B11218] bg-[#151111] p-4">
                <summary className="cursor-pointer font-bold text-[#FFB3B6]">
                  Permanently Delete Shift
                </summary>
                <p className="mt-3 text-sm text-[#B7B7B7]">
                  Only works when this shift has no assignments. Type DELETE to confirm.
                </p>
                <form action={permanentlyDeleteShiftWithId} className="mt-4 grid gap-3">
                  <input
                    name="confirmPhrase"
                    placeholder="Type DELETE"
                    className="rounded-lg border border-[#3A1215] bg-black p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                  >
                    Permanently Delete Shift
                  </button>
                </form>
              </details>

              <div className="text-sm text-[#8F8F8F]">
                Related records: {shift.assignments.length} volunteer assignments.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
            <h2 className="text-3xl font-bold text-white">
              Assigned Volunteers / Check-in
            </h2>

            {shift.assignments.length === 0 ? (
              <p className="mt-4 rounded-xl border border-[#2A0E10] bg-[#151111] p-5 text-[#B7B7B7]">
                No volunteers assigned yet.
              </p>
            ) : (
              <div className="mt-5 grid gap-4">
                {shift.assignments.map((assignment) => {
                  const saveVolunteerStatusWithIds = saveVolunteerStatus.bind(
                    null,
                    shift.id,
                    assignment.id
                  )

                  const quickCheckInVolunteerWithIds =
                    quickCheckInVolunteer.bind(null, shift.id, assignment.id)

                  const removeVolunteerAssignmentWithIds =
                    removeVolunteerAssignment.bind(
                      null,
                      shift.id,
                      assignment.id,
                      returnTo
                    )

                  const shirtSize = assignment.member.volunteerProfile?.shirtSize || '—'
                  const phoneLink = phoneHref(assignment.member.phone)

                  return (
                    <div
                      key={assignment.id}
                      className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <Link
                            href={`/members/${assignment.member.id}`}
                            className="text-lg font-bold text-[#B11218] hover:text-[#D11A22] hover:underline"
                          >
                            {assignment.member.preferredName ||
                              assignment.member.firstName}{' '}
                            {assignment.member.lastName}
                          </Link>

                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            {assignment.member.email}
                            {phoneLink ? (
                              <span>
                                {' · '}
                                <a href={phoneLink} className="text-[#B11218] hover:underline">
                                  {assignment.member.phone}
                                </a>
                              </span>
                            ) : (
                              ''
                            )}
                          </div>

                          <div className="mt-2 text-sm font-bold text-white">
                            Current: {assignment.status} · Checked In:{' '}
                            {assignment.checkedIn ? 'Yes' : 'No'}
                          </div>

                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            Shirt Size: {shirtSize}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <form action={quickCheckInVolunteerWithIds}>
                            <button
                              type="submit"
                              className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                            >
                              Mark Checked In
                            </button>
                          </form>

                          <details className="rounded-lg border border-[#B11218] px-4 py-2">
                            <summary className="cursor-pointer text-sm font-bold text-[#FFB3B6]">
                              Remove from Shift
                            </summary>
                            <p className="mt-2 max-w-xs text-xs text-[#B7B7B7]">
                              This removes this person from this shift only. It does not delete the member or volunteer profile.
                              {assignment.checkedIn
                                ? ' This assignment is checked in, so removing it will also remove that check-in record.'
                                : ''}
                            </p>
                            <form
                              action={removeVolunteerAssignmentWithIds}
                              className="mt-3 grid gap-2"
                            >
                              <input
                                name="confirmPhrase"
                                placeholder="Type REMOVE"
                                className="rounded border border-[#3A1215] bg-black p-2 text-sm text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded border border-[#B11218] px-3 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                              >
                                Remove from Shift
                              </button>
                            </form>
                          </details>
                        </div>
                      </div>

                      <form
                        action={saveVolunteerStatusWithIds}
                        className="mt-5 grid gap-4"
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold text-white">
                              Status
                            </span>
                            <select
                              name="status"
                              defaultValue={assignment.status}
                              className={inputClass}
                            >
                              <option value="Assigned">Assigned</option>
                              <option value="Attended">Attended</option>
                              <option value="Cancelled">Cancelled</option>
                              <option value="No Show">No Show</option>
                            </select>
                          </label>

                          <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4">
                            <input
                              name="checkedIn"
                              type="checkbox"
                              defaultChecked={assignment.checkedIn}
                              className="h-5 w-5"
                            />
                            <span className="text-sm font-bold text-white">
                              Checked in
                            </span>
                          </label>

                          <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4">
                            <input
                              name="shirtGiven"
                              type="checkbox"
                              defaultChecked={assignment.shirtGiven || false}
                              className="h-5 w-5"
                            />
                            <span className="text-sm font-bold text-white">
                              Shirt Given
                            </span>
                          </label>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold text-white">
                            Assignment notes
                          </span>
                          <textarea
                            name="notes"
                            rows={2}
                            defaultValue={assignment.notes || ''}
                            className={inputClass}
                          />
                        </label>

                        <button
                          type="submit"
                          className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                        >
                          Save Volunteer Status
                        </button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
            <h2 className="text-3xl font-bold text-white">
              Assign Volunteer Manually
            </h2>

            <p className="mt-3 text-[#B7B7B7]">
              Use this when someone already exists in the member list.
            </p>

            <div className="mt-5 rounded-xl border border-[#B11218] bg-[#151111] p-5">
              <h3 className="text-xl font-bold text-white">
                New volunteer not in the system?
              </h3>

              <p className="mt-2 text-[#B7B7B7]">
                Use New Volunteer Signup. The current shift will be pre-selected.
              </p>

              <div className="mt-5">
                <Link
                  href={`/volunteer-shifts?shiftId=${shift.id}`}
                  className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  New Volunteer Signup
                </Link>
              </div>
            </div>

            {availableMembers.length === 0 ? (
              <p className="mt-5 rounded-xl border border-[#2A0E10] bg-[#151111] p-5 text-[#B7B7B7]">
                All current members are already assigned to this shift.
              </p>
            ) : (
              <form action={assignVolunteerWithShiftId} className="mt-6 grid gap-5">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    Choose existing member
                  </span>
                  <select name="memberId" required className={inputClass}>
                    <option value="">Select a member</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.preferredName || member.firstName}{' '}
                        {member.lastName} — {member.email}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  Assign Existing Member
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
