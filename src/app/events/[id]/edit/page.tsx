import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import EventImageUrlField from '@/components/admin/EventImageUrlField'
import { dateToEventDateTimeLocalValue, eventDateTimeLocalToUtcDate } from '@/lib/timezone'

function cleanOptionalUrl(value: FormDataEntryValue | null) {
  const raw = String(value || '').trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    // fall through
  }

  throw new Error('Event Image URL must start with http:// or https://.')
}


async function updateEvent(eventId: string, formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect(`/admin/login?redirect=/events/${eventId}/edit`)
  }

  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const location = String(formData.get('location') || '').trim()
  const startsAt = String(formData.get('startsAt') || '').trim()
  const endsAt = String(formData.get('endsAt') || '').trim()
  const capacityRaw = String(formData.get('capacity') || '').trim()
  const status = String(formData.get('status') || 'Draft').trim()
  const flyerImageUrl = cleanOptionalUrl(formData.get('flyerImageUrl'))
  const selfRegistrationEnabled = formData.get('selfRegistrationEnabled') === 'on'

  if (!title || !startsAt) {
    throw new Error('Title and start date/time are required.')
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title,
      description: description || null,
      location: location || null,
      startsAt: eventDateTimeLocalToUtcDate(startsAt),
      endsAt: endsAt ? eventDateTimeLocalToUtcDate(endsAt) : null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      status,
      flyerImageUrl,
      selfRegistrationEnabled,
    },
  })

  redirect(`/events/${eventId}`)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await getCurrentAdmin()
  const { id } = await params

  if (!admin) {
    redirect(`/admin/login?redirect=/events/${id}/edit`)
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      flyerImageUrl: true,
      selfRegistrationEnabled: true,
    },
  })

  if (!event) notFound()

  const updateEventWithId = updateEvent.bind(null, event.id)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href={`/events/${event.id}`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            Back to event
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Edit Event</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Update event details, status, and event image.
          </p>

          <form action={updateEventWithId} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Title *</span>
              <input
                name="title"
                required
                defaultValue={event.title}
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Description</span>
              <textarea
                name="description"
                rows={4}
                defaultValue={event.description || ''}
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Location</span>
              <input
                name="location"
                defaultValue={event.location || ''}
                className={inputClass}
              />
            </label>

            <EventImageUrlField defaultValue={event.flyerImageUrl || ''} />

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Starts at *
                </span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={dateToEventDateTimeLocalValue(event.startsAt)}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Ends at</span>
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={dateToEventDateTimeLocalValue(event.endsAt)}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Capacity</span>
                <input
                  name="capacity"
                  type="number"
                  min="0"
                  defaultValue={event.capacity || ''}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Status</span>
                <select name="status" defaultValue={event.status} className={inputClass}>
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="selfRegistrationEnabled"
                type="checkbox"
                defaultChecked={event.selfRegistrationEnabled}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block text-base font-bold text-white">
                  Allow free public self-registration
                </span>
                <span className="mt-1 block text-sm text-[#8F8F8F]">
                  Turns on the public signup page (no login, no payment) for this event. Leave
                  this OFF for anything ticketed through Stripe/TicketSpice - only turn it on for
                  real free RSVP-style events. Off by default for every event.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Save Changes
              </button>

              <Link
                href={`/events/${event.id}`}
                className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}