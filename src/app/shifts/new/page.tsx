import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { addHours, eventDateTimeLocalToUtcDate } from '@/lib/timezone'

async function createShift(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/shifts/new')
  }

  const eventId = String(formData.get('eventId') || '').trim()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const startsAt = String(formData.get('startsAt') || '').trim()
  const endsAt = String(formData.get('endsAt') || '').trim()
  const neededCountRaw = String(formData.get('neededCount') || '1').trim()
  const status = String(formData.get('status') || 'Open').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!eventId || !title || !startsAt) {
    throw new Error('Event, title, and start time are required.')
  }

  // Fetch event to validate it's active and get its location
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      archivedAt: true,
      cancelledAt: true,
      status: true,
      location: true,
    },
  })

  if (!event || event.archivedAt || event.cancelledAt || event.status === 'Cancelled') {
    throw new Error('Choose an active event for this shift.')
  }

  const parsedStartsAt = eventDateTimeLocalToUtcDate(startsAt)
  const parsedEndsAt = endsAt ? eventDateTimeLocalToUtcDate(endsAt) : addHours(parsedStartsAt, 3)

  if (parsedEndsAt <= parsedStartsAt) {
    throw new Error('End time must be after start time.')
  }

  await prisma.volunteerShift.create({
    data: {
      eventId,
      title,
      description: description || null,
      // Use event location instead of separate input
      location: event.location || null,
      startsAt: parsedStartsAt,
      endsAt: parsedEndsAt,
      neededCount: Number(neededCountRaw) || 1,
      status,
      notes: notes || null,
    },
  })

  redirect('/shifts/calendar')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewShiftPage({
  searchParams,
}: {
  searchParams?: Promise<{
    startsAt?: string
    endsAt?: string
  }>
}) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/shifts/new')
  }

  const params = searchParams ? await searchParams : {}
  const defaultStartsAt = params.startsAt || ''
  const defaultEndsAt = params.endsAt || ''

  const events = await prisma.event.findMany({
    where: {
      archivedAt: null,
      cancelledAt: null,
      NOT: {
        status: 'Cancelled',
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/shifts/calendar"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to calendar
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Add Volunteer Shift</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Create a volunteer shift connected to an Encuerado event.
          </p>

          <form action={createShift} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Event *</span>
              <select name="eventId" required className={inputClass}>
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
                placeholder="Check-in table, setup, hospitality..."
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Description</span>
              <textarea name="description" rows={3} className={inputClass} />
            </label>

            {/* Location input removed – location is now inherited from event */}

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Starts at *</span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={defaultStartsAt}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Ends at</span>
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={defaultEndsAt}
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
                  defaultValue="1"
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Status</span>
                <select name="status" defaultValue="Open" className={inputClass}>
                  <option value="Open">Open</option>
                  <option value="Full">Full</option>
                  <option value="Closed">Closed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Internal notes</span>
              <textarea name="notes" rows={3} className={inputClass} />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Shift
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
