import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import EventImageUrlField from '@/components/admin/EventImageUrlField'
import { eventDateTimeLocalToUtcDate } from '@/lib/timezone'

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

async function createEvent(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/events/new')
  }

  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const location = String(formData.get('location') || '').trim()
  const startsAt = String(formData.get('startsAt') || '').trim()
  const endsAt = String(formData.get('endsAt') || '').trim()
  const capacityRaw = String(formData.get('capacity') || '').trim()
  const status = String(formData.get('status') || 'Draft').trim()
  const flyerImageUrl = cleanOptionalUrl(formData.get('flyerImageUrl'))

  if (!title || !startsAt) {
    throw new Error('Title and start date/time are required.')
  }

  await prisma.event.create({
    data: {
      title,
      description: description || null,
      location: location || null,
      startsAt: eventDateTimeLocalToUtcDate(startsAt),
      endsAt: endsAt ? eventDateTimeLocalToUtcDate(endsAt) : null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      status,
      flyerImageUrl,
    },
  })

  redirect('/events')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewEventPage() {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/events/new')
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/events"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            Back to events
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Add Event</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Add a new Encuerado event, session, social, or volunteer-related program.
          </p>

          <form action={createEvent} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Title *</span>
              <input name="title" required className={inputClass} />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Description</span>
              <textarea name="description" rows={4} className={inputClass} />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Location</span>
              <input name="location" className={inputClass} />
            </label>

            <EventImageUrlField />

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Starts at *
                </span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Ends at</span>
                <input name="endsAt" type="datetime-local" className={inputClass} />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Capacity</span>
                <input
                  name="capacity"
                  type="number"
                  min="0"
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Status</span>
                <select name="status" defaultValue="Draft" className={inputClass}>
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Event
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}