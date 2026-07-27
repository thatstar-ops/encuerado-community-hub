import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { sendRegistrationConfirmation } from '@/lib/transactional-email'

async function createRegistration(eventId: string, formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}/registrations/new`)

  const memberId = String(formData.get('memberId') || '').trim()
  const selectedStatus = String(formData.get('status') || 'Registered').trim()
  const checkedIn = formData.get('checkedIn') === 'on'
  const notes = String(formData.get('notes') || '').trim()

  if (!memberId) {
    throw new Error('Attendee is required.')
  }

  // Fetch event details for the confirmation email
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      startsAt: true,
      location: true,
      archivedAt: true,
      cancelledAt: true,
      status: true,
    },
  })
  if (!event) throw new Error('Event not found')

  if (event.archivedAt || event.cancelledAt || event.status === 'Cancelled') {
    throw new Error('This event is archived or cancelled.')
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { archivedAt: true },
  })

  if (!member || member.archivedAt) {
    throw new Error('Choose an active attendee.')
  }

  const finalStatus = checkedIn ? 'Attended' : selectedStatus

  await prisma.eventRegistration.create({
    data: {
      eventId,
      memberId,
      status: finalStatus,
      checkedIn,
      notes: notes || null,
    },
  })

  // Send confirmation email (transactional, no opt‑out check)
  await sendRegistrationConfirmation(
    memberId,
    event.title,
    event.startsAt.toLocaleString(),
    event.location || undefined
  )

  redirect(`/events/${eventId}`)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewEventRegistrationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${id}/registrations/new`)

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: true,
    },
  })

  if (!event) notFound()

  const eventIsInactive = Boolean(
    event.archivedAt || event.cancelledAt || event.status === 'Cancelled'
  )

  const alreadyRegisteredMemberIds = event.registrations.map(
    (registration) => registration.memberId
  )

  const availableMembers = await prisma.member.findMany({
    where: {
      archivedAt: null,
      id: {
        notIn: alreadyRegisteredMemberIds,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const createRegistrationWithEventId = createRegistration.bind(null, event.id)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href={`/events/${event.id}`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to event
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Register Attendee</h1>

          <p className="mt-3 text-lg text-[#B7B7B7]">
            Add an attendee registration for:{' '}
            <span className="font-bold text-[#B11218]">{event.title}</span>
          </p>

          {eventIsInactive ? (
            <div className="mt-8 rounded-xl border border-[#B11218] bg-[#151111] p-6">
              <h2 className="text-2xl font-bold text-white">
                Registration Closed
              </h2>
              <p className="mt-2 text-[#B7B7B7]">
                This event is archived or cancelled. Restore it before adding registrations.
              </p>
            </div>
          ) : availableMembers.length === 0 ? (
            <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
              <h2 className="text-2xl font-bold text-white">
                No available attendees
              </h2>
              <p className="mt-2 text-[#B7B7B7]">
                Every current attendee is already registered for this event.
              </p>
            </div>
          ) : (
            <form action={createRegistrationWithEventId} className="mt-8 grid gap-5">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Attendee *</span>
                <select name="memberId" required className={inputClass}>
                  <option value="">Select an attendee</option>
                  {availableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.preferredName || member.firstName} {member.lastName} — {member.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Status</span>
                <select name="status" defaultValue="Registered" className={inputClass}>
                  <option value="Registered">Registered</option>
                  <option value="Attended">Attended</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="No Show">No Show</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
                <input name="checkedIn" type="checkbox" className="h-5 w-5" />
                <span className="text-base font-bold text-white">Checked in</span>
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Internal Notes</span>
                <textarea name="notes" rows={4} className={inputClass} />
              </label>

              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Save Attendee Registration
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
