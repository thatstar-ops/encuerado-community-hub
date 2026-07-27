import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin, requireNonCheckInAdmin } from '@/lib/auth'
import { getRegistrationPassCount, getRegistrationPassLabel } from '@/lib/registration-pass-count'
import ActionNotice from '@/components/admin/ActionNotice'
import SuggestedShifts from '@/components/admin/SuggestedShifts'
import {
  archiveEvent,
  cancelEvent,
  permanentlyDeleteEvent,
  restoreEvent,
  publishEvent,
  moveEventToDraft,
} from '@/lib/admin-record-actions'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

function formatDate(date: Date | null) {
  if (!date) return 'ï¿½'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function eventDateKey(date: Date | null) {
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function safeHttpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

async function quickCheckInRegistration(eventId: string, registrationId: string) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}`)

  await prisma.eventRegistration.update({
    where: {
      id: registrationId,
    },
    data: {
      checkedIn: true,
      status: 'Attended',
    },
  })

  redirect(`/events/${eventId}`)
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    q?: string
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const admin = await getCurrentAdmin()
  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}
  const query = String(queryParams.q || '').trim().toLowerCase()

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: {
        include: {
          member: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      _count: {
        select: {
          volunteerShifts: true,
        },
      },
    },
  })

  if (!event) notFound()

  // Fetch existing shifts for duplicate detection
  const existingShifts = await prisma.volunteerShift.findMany({
    where: { eventId: event.id },
    select: { title: true, startsAt: true, endsAt: true },
  })

  const eventIsInactive = Boolean(
    event.archivedAt || event.cancelledAt || event.status === 'Cancelled'
  )

  const checkedInCount = event.registrations.filter(
    (registration) => registration.checkedIn
  ).length

  const notCheckedInCount = event.registrations.length - checkedInCount

  const filteredRegistrations = query
    ? event.registrations.filter((registration) => {
        const member = registration.member

        const searchable = [
          member.firstName,
          member.lastName,
          member.preferredName || '',
          member.email,
          member.phone || '',
          member.city || '',
          member.state || '',
          registration.status,
          registration.notes || '',
        ]
          .join(' ')
          .toLowerCase()

        return searchable.includes(query)
      })
    : event.registrations

  const sourceHref = safeHttpUrl(event.sourceUrl)
  const endsOnDifferentDay = event.endsAt
    ? eventDateKey(event.startsAt) !== eventDateKey(event.endsAt)
    : false
  const returnTo = `/events/${event.id}`
  const archiveEventWithId = archiveEvent.bind(null, event.id, returnTo)
  const cancelEventWithId = cancelEvent.bind(null, event.id, returnTo)
  const restoreEventWithId = restoreEvent.bind(null, event.id, returnTo)
  const permanentlyDeleteEventWithId = permanentlyDeleteEvent.bind(
    null,
    event.id,
    returnTo
  )
  const publishEventWithId = publishEvent.bind(null, event.id, returnTo)
  const moveEventToDraftWithId = moveEventToDraft.bind(null, event.id, returnTo)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <ActionNotice
          message={queryParams.actionMessage}
          status={queryParams.actionStatus}
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/events"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ? Back to events
          </Link>

          <div className="flex flex-wrap items-center gap-3">

            {admin ? (
              <>
                <Link
                  href={`/events/${event.id}/check-in`}
                  className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  Check-in Mode
                </Link>

                <Link
                  href={`/events/${event.id}/registrations/new`}
                  className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Register Attendee
                </Link>

                <Link
                  href={`/events/${event.id}/edit`}
                  className="rounded border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Edit Event
                </Link>

                {/* NEW: Event Operations button */}
                <Link
                  href={`/events/${event.id}/operations`}
                  className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  Event Operations
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          {event.flyerImageUrl && (
            <div className="mb-8 overflow-hidden rounded-xl border border-[#2A0E10] bg-black">
              <img
                src={event.flyerImageUrl}
                alt={`${event.title} flyer`}
                loading="lazy"
                className="max-h-[720px] w-full object-contain"
              />
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2A0E10] pb-6">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-wide text-white">{event.title}</h1>

              <p className="mt-3 text-lg text-[#B7B7B7]">
                {event.description || 'Event details and registration.'}
              </p>

              {sourceHref && (
                <a
                  href={sourceHref}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-4 inline-block font-bold text-[#B11218] hover:text-[#D11A22] hover:underline"
                >
                  Original Encuerado Schedule
                </a>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#B11218] px-4 py-2 text-sm font-bold text-white">
                {event.status}
              </span>
              {event.archivedAt && (
                <span className="rounded-full bg-[#2A0E10] px-4 py-2 text-sm font-bold text-white">
                  Archived
                </span>
              )}
              {(event.cancelledAt || event.status === 'Cancelled') && (
                <span className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white">
                  Cancelled
                </span>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Starts</div>
              <div className="mt-2 text-xl font-bold text-white">
                {formatDate(event.startsAt)}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Ends{endsOnDifferentDay ? ' (next day)' : ''}</div>
              <div className="mt-2 text-xl font-bold text-white">
                {formatDate(event.endsAt)}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Location</div>
              <div className="mt-2 text-xl font-bold text-white">
                {event.location || 'ï¿½'}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Capacity</div>
              <div className="mt-2 text-xl font-bold text-white">
                {event.capacity || 'ï¿½'}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <div className="text-sm font-semibold text-[#8F8F8F]">
              Description
            </div>

            <div className="mt-2 whitespace-pre-wrap text-lg text-white">
              {event.description || 'ï¿½'}
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-4">
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Registered
              </div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                {event.registrations.length}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Checked In
              </div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                {checkedInCount}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Not Checked In
              </div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                {notCheckedInCount}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Remaining Capacity
              </div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                {event.capacity
                  ? Math.max(event.capacity - event.registrations.length, 0)
                  : 'ï¿½'}
              </div>
            </div>
          </div>

          {admin && (
            <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <h2 className="text-2xl font-bold text-white">Event Controls</h2>
              <p className="mt-2 text-[#B7B7B7]">
                Archive or cancel to hide this event from active lists while keeping registrations and history.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {eventIsInactive ? (
                  <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4">
                    <summary className="cursor-pointer font-bold text-[#B11218]">
                      Restore Event
                    </summary>
                    <p className="mt-3 text-sm text-[#B7B7B7]">
                      This returns the event to active admin lists. Cancelled events are restored as Draft.
                    </p>
                    <form action={restoreEventWithId} className="mt-4">
                      <button
                        type="submit"
                        className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                      >
                        Restore Event
                      </button>
                    </form>
                  </details>
                ) : (
                  <>
                    <details className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-4">
                      <summary className="cursor-pointer font-bold text-[#B11218]">
                        Archive Event
                      </summary>
                      <p className="mt-3 text-sm text-[#B7B7B7]">
                        This hides the event from active public and admin lists but keeps registrations and history.
                      </p>
                      <form action={archiveEventWithId} className="mt-4">
                        <button
                          type="submit"
                          className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                        >
                          Archive Event
                        </button>
                      </form>
                    </details>

                    <details className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-4">
                      <summary className="cursor-pointer font-bold text-[#B11218]">
                        Cancel Event
                      </summary>
                      <p className="mt-3 text-sm text-[#B7B7B7]">
                        This marks the event cancelled and keeps every registration for history and reporting.
                      </p>
                      <form action={cancelEventWithId} className="mt-4">
                        <button
                          type="submit"
                          className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                        >
                          Cancel Event
                        </button>
                      </form>
                    </details>

                    {/* Publish / Move to Draft */}
                    {event.status === 'Draft' ? (
                      <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4">
                        <summary className="cursor-pointer font-bold text-[#B11218]">
                          Publish Event
                        </summary>
                        <p className="mt-3 text-sm text-[#B7B7B7]">
                          Make this event visible on the public events list.
                        </p>
                        <form action={publishEventWithId} className="mt-4">
                          <button
                            type="submit"
                            className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                          >
                            Publish Event
                          </button>
                        </form>
                      </details>
                    ) : event.status === 'Published' ? (
                      <details className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-4">
                        <summary className="cursor-pointer font-bold text-[#B11218]">
                          Move Back to Draft
                        </summary>
                        <p className="mt-3 text-sm text-[#B7B7B7]">
                          Hide this event from public event listings while keeping registrations and history.
                        </p>
                        <form action={moveEventToDraftWithId} className="mt-4">
                          <button
                            type="submit"
                            className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                          >
                            Move Back to Draft
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </>
                )}

                <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4 md:col-span-2">
                  <summary className="cursor-pointer font-bold text-[#FFB3B6]">
                    Permanently Delete Event
                  </summary>
                  <p className="mt-3 text-sm text-[#B7B7B7]">
                    Only works for records with no registrations, no volunteer shifts, and no imported source data. This cannot be undone.
                  </p>
                  <form action={permanentlyDeleteEventWithId} className="mt-4 grid gap-3">
                    <input
                      name="confirmPhrase"
                      placeholder="Type DELETE"
                      className="rounded-lg border border-[#3A1215] bg-black p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                    >
                      Permanently Delete Event
                    </button>
                  </form>
                </details>
              </div>

              <div className="mt-4 text-sm text-[#8F8F8F]">
                Related records: {event.registrations.length} registrations,{' '}
                {event._count.volunteerShifts} volunteer shifts.
              </div>
            </div>
          )}

          {/* Suggested Volunteer Shifts (admin only) */}
          {admin && (
            event.startsAt && event.endsAt ? (
              <SuggestedShifts
                eventId={event.id}
                eventStart={event.startsAt}
                eventEnd={event.endsAt}
                existingShifts={existingShifts.map((s) => ({
                  title: s.title,
                  startsAt: s.startsAt,
                  endsAt: s.endsAt,
                }))}
              />
            ) : (
              <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-5 text-[#B7B7B7]">
                Suggested volunteer shifts require the event to have a start and end date/time.
              </div>
            )
          )}

          {admin && (
            <>
          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <h2 className="text-2xl font-bold text-white">Attendee Search</h2>

            <p className="mt-2 text-[#B7B7B7]">
              Search attendees by name, email, phone, city, status, or notes.
            </p>

            <form method="GET" action={`/events/${event.id}`} className="mt-5">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                <input
                  name="q"
                  defaultValue={queryParams.q || ''}
                  placeholder="Search attendee..."
                  className="rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4 text-lg text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />

                <button
                  type="submit"
                  className="rounded-lg bg-[#B11218] px-6 py-4 text-base font-bold text-white hover:bg-[#D11A22]"
                >
                  Search
                </button>

                <Link
                  href={`/events/${event.id}`}
                  className="rounded-lg border border-[#B11218] px-6 py-4 text-center text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                >
                  Clear
                </Link>
              </div>
            </form>

            <div className="mt-4 text-sm font-bold text-[#B7B7B7]">
              Showing {filteredRegistrations.length} of{' '}
              {event.registrations.length} registrations
            </div>
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <div className="border-b border-[#2A0E10] bg-[#151111] p-4">
              <h2 className="text-2xl font-bold text-white">
                Registered Attendees
              </h2>

              <p className="mt-1 text-[#B7B7B7]">
                Simple attendee list with status, check-in, and notes.
              </p>
            </div>

            <table className="w-full min-w-[1000px] text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Attendee</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Phone</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Checked In</th>
                  <th className="p-4 font-bold">Notes</th>
                  {admin && <th className="p-4 font-bold">Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredRegistrations.map((registration) => {
                  const quickCheckInWithIds = quickCheckInRegistration.bind(
                    null,
                    event.id,
                    registration.id
                  )

                  return (
                    <tr
                      key={registration.id}
                      className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]"
                    >
                      <td className="p-4 font-semibold">
                        <Link
                          href={`/members/${registration.member.id}`}
                          className="text-[#B11218] hover:text-[#D11A22] hover:underline"
                        >
                          {registration.member.preferredName ||
                            registration.member.firstName}{' '}
                          {registration.member.lastName}
                        </Link>
                      </td>

                      <td className="p-4 text-[#D11A22]">
                        {registration.member.email}
                      </td>

                      <td className="p-4 text-white">
                        {registration.member.phone || 'ï¿½'}
                      </td>

                      <td className="p-4">
                        <span className="rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white">
                          {registration.status}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={
                            registration.checkedIn
                              ? 'rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white'
                              : 'rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white'
                          }
                        >
                          {registration.checkedIn ? 'Yes' : 'No'}
                        </span>
                      </td>

                      <td className="p-4 text-white">
                        {registration.notes || 'ï¿½'}
                      </td>

                      {admin && (
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {!registration.checkedIn && (
                              <form action={quickCheckInWithIds}>
                                <button
                                  type="submit"
                                  className="rounded bg-[#B11218] px-3 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                                >
                                  Quick Check-in
                                </button>
                              </form>
                            )}

                            <Link
                              href={`/events/${event.id}/registrations/${registration.id}/edit`}
                              className="rounded border border-[#B11218] px-3 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filteredRegistrations.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
                No matching attendees found.
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
