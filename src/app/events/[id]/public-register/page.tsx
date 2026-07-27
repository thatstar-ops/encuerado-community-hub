import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

function formatDate(date: Date | null) {
  if (!date) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date)
}

async function publicRegisterForEvent(eventId: string, formData: FormData) {
  'use server'

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const preferredName = String(formData.get('preferredName') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const phone = String(formData.get('phone') || '').trim()
  const city = String(formData.get('city') || '').trim()
  const state = String(formData.get('state') || '').trim()
  const consent = formData.get('consent') === 'on'

  if (!firstName || !lastName || !email) {
    throw new Error('First name, last name, and email are required.')
  }

  if (!consent) {
    throw new Error('Consent is required to register.')
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      registrations: true,
    },
  })

  if (!event) {
    throw new Error('Event not found.')
  }

  if (event.archivedAt || event.cancelledAt || event.status === 'Cancelled') {
    throw new Error('This event is not open for registration.')
  }

  if (event.capacity && event.registrations.length >= event.capacity) {
    throw new Error('This event is full.')
  }

  const member = await prisma.member.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      phone: phone || null,
      city: city || null,
      state: state || null,
      archivedAt: null,
    },
    create: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      email,
      phone: phone || null,
      city: city || null,
      state: state || null,
      country: 'USA',
      firstYearAttended: 2025,
      notes: 'Registered through public event registration page.',
    },
  })

  await prisma.eventRegistration.upsert({
    where: {
      memberId_eventId: {
        memberId: member.id,
        eventId,
      },
    },
    update: {
      status: 'Registered',
    },
    create: {
      memberId: member.id,
      eventId,
      status: 'Registered',
      checkedIn: false,
      notes: 'Public self-registration.',
    },
  })

  redirect(`/events/${eventId}/public-register/thank-you`)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function PublicEventRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: true,
    },
  })

  if (!event) {
    notFound()
  }

  const registeredCount = event.registrations.length
  const remainingCapacity = event.capacity
    ? Math.max(event.capacity - registeredCount, 0)
    : null

  const isFull = event.capacity ? registeredCount >= event.capacity : false
  const isUnavailable = Boolean(
    event.archivedAt || event.cancelledAt || event.status === 'Cancelled'
  )

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="border-b border-[#2A0E10] pb-6">
            <h1 className="text-4xl font-black uppercase tracking-wide text-white">
              Event Registration
            </h1>

            <p className="mt-3 text-2xl font-bold text-[#B11218]">
              {event.title}
            </p>

            <p className="mt-3 text-lg text-[#B7B7B7]">
              {event.description || 'Register for this Encuerado event.'}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Starts</div>
              <div className="mt-2 font-bold text-white">
                {formatDate(event.startsAt)}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Location</div>
              <div className="mt-2 font-bold text-white">
                {event.location || '—'}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Registered
              </div>
              <div className="mt-2 font-bold text-white">
                {registeredCount}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">
                Spots Left
              </div>
              <div className="mt-2 font-bold text-white">
                {remainingCapacity === null ? 'Open' : remainingCapacity}
              </div>
            </div>
          </div>

          {isUnavailable ? (
            <div className="mt-8 rounded-xl border border-[#B11218] bg-[#151111] p-6">
              <h2 className="text-2xl font-bold text-white">
                Registration Closed
              </h2>
              <p className="mt-2 text-[#B7B7B7]">
                This event is archived or cancelled and is not accepting registrations.
              </p>
            </div>
          ) : isFull ? (
            <div className="mt-8 rounded-xl border border-[#B11218] bg-[#151111] p-6">
              <h2 className="text-2xl font-bold text-white">Event Full</h2>
              <p className="mt-2 text-[#B7B7B7]">
                This event has reached capacity.
              </p>
            </div>
          ) : (
            <form
              action={publicRegisterForEvent.bind(null, event.id)}
              className="mt-8 grid gap-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    First name *
                  </span>
                  <input name="firstName" required className={inputClass} />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    Last name *
                  </span>
                  <input name="lastName" required className={inputClass} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Preferred name
                </span>
                <input name="preferredName" className={inputClass} />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Email *</span>
                  <input name="email" type="email" required className={inputClass} />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Phone</span>
                  <input name="phone" className={inputClass} />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">City</span>
                  <input name="city" className={inputClass} />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">State</span>
                  <input name="state" className={inputClass} />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
                <input
                  name="consent"
                  type="checkbox"
                  required
                  className="mt-1 h-5 w-5"
                />
                <span className="text-base font-bold text-white">
                  I agree to register for this event and be contacted by Encuerado
                  about this registration.
                </span>
              </label>

              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Register for Event
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
