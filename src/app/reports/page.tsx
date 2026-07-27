import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

function formatDate(date: Date | null) {
  if (!date) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function ReportsPage() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/reports')

  const events = await prisma.event.findMany({
    include: {
      registrations: {
        include: {
          member: true,
        },
      },
    },
    orderBy: {
      startsAt: 'desc',
    },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">Reports / Export</h1>

          <p className="mt-4 text-xl text-[#B7B7B7]">
            Download attendee registration and check-in reports by event.
          </p>

          <div className="mt-8 grid gap-5">
            {events.map((event) => {
              const registeredCount = event.registrations.length
              const checkedInCount = event.registrations.filter(
                (registration) => registration.checkedIn
              ).length
              const notCheckedInCount = registeredCount - checkedInCount

              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-[#2A0E10] bg-[#151111] p-6 shadow-xl"
                >
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                      <h2 className="text-3xl font-bold text-[#B11218]">
                        {event.title}
                      </h2>

                      <div className="mt-3 grid gap-2 text-[#B7B7B7]">
                        <div>
                          <span className="font-bold text-white">Starts:</span>{' '}
                          {formatDate(event.startsAt)}
                        </div>

                        <div>
                          <span className="font-bold text-white">Location:</span>{' '}
                          {event.location || '—'}
                        </div>

                        <div>
                          <span className="font-bold text-white">Status:</span>{' '}
                          {event.status}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/reports/events/${event.id}/registrations`}
                        className="rounded-xl bg-[#B11218] px-6 py-4 text-base font-bold text-white hover:bg-[#D11A22]"
                      >
                        Download CSV
                      </Link>

                      <Link
                        href={`/events/${event.id}`}
                        className="rounded-xl border border-[#B11218] px-6 py-4 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                      >
                        View Event
                      </Link>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Registered
                      </div>
                      <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                        {registeredCount}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Checked In
                      </div>
                      <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                        {checkedInCount}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-5">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Not Checked In
                      </div>
                      <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">
                        {notCheckedInCount}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {events.length === 0 && (
              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-[#B7B7B7]">
                No events yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}