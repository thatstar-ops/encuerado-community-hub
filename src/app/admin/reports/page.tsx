import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

function formatDate(date: Date | null) {
  if (!date) return 'To be announced'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const futureReportAreas = [
  {
    title: 'Attendee exports later',
    description:
      'Saved export presets for attendee segments, event history, opt-outs, and follow-up lists.',
  },
  {
    title: 'Event summary reports later',
    description:
      'Post-event summaries with registration totals, check-in rate, volunteer coverage, and notes.',
  },
  {
    title: 'Volunteer reports later',
    description:
      'More detailed summaries for shift coverage, volunteer attendance, and follow-up needs.',
  },
]

export default async function AdminReportsPage() {
  const admin = await getCurrentAdmin()

  if (!admin) {
    redirect('/admin/login?redirect=/admin/reports')
  }
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const [
    registrationCount,
    checkedInRegistrationCount,
    volunteerShiftCount,
    assignedVolunteerSlotCount,
    checkedInVolunteerSlotCount,
    events,
  ] = await Promise.all([
    prisma.eventRegistration.count(),
    prisma.eventRegistration.count({
      where: {
        checkedIn: true,
      },
    }),
    prisma.volunteerShift.count(),
    prisma.volunteerAssignment.count(),
    prisma.volunteerAssignment.count({
      where: {
        checkedIn: true,
      },
    }),
    prisma.event.findMany({
      include: {
        registrations: true,
        volunteerShifts: {
          include: {
            assignments: true,
          },
        },
      },
      orderBy: {
        startsAt: 'desc',
      },
      take: 8,
    }),
  ])

  const reportStats = [
    {
      label: 'Event registrations',
      value: registrationCount,
      detail: `${checkedInRegistrationCount} checked in`,
    },
    {
      label: 'Check-in counts',
      value: checkedInRegistrationCount,
      detail: `${Math.max(registrationCount - checkedInRegistrationCount, 0)} not checked in`,
    },
    {
      label: 'Volunteer coverage',
      value: assignedVolunteerSlotCount,
      detail: `${volunteerShiftCount} shifts tracked`,
    },
    {
      label: 'Volunteer check-ins',
      value: checkedInVolunteerSlotCount,
      detail: 'Shift attendance framework',
    },
  ]

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/admin"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            Dashboard
          </Link>
          <Link
            href="/reports"
            className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
          >
            CSV Exports
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#B11218]">
            Reports
          </p>
          <h1 className="mt-3 text-5xl font-black uppercase tracking-wide text-white">
            Admin Reports Framework
          </h1>
          <p className="mt-4 max-w-4xl text-xl leading-9 text-[#B7B7B7]">
            A simple reporting surface for registrations, check-in counts,
            volunteer coverage, attendee exports, and future event summaries.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {reportStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl"
            >
              <div className="text-sm font-bold text-[#8F8F8F]">
                {stat.label}
              </div>
              <div className="mt-3 text-4xl font-black uppercase tracking-wide text-white">
                {stat.value}
              </div>
              <div className="mt-2 text-sm text-[#B7B7B7]">{stat.detail}</div>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold text-white">
                Event reporting snapshot
              </h2>
              <p className="mt-3 text-[#B7B7B7]">
                Current data from registrations, check-in, volunteer shifts, and
                assignments.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {events.map((event) => {
              const registeredCount = event.registrations.length
              const checkedInCount = event.registrations.filter(
                (registration) => registration.checkedIn
              ).length
              const neededVolunteers = event.volunteerShifts.reduce(
                (total, shift) => total + shift.neededCount,
                0
              )
              const assignedVolunteers = event.volunteerShifts.reduce(
                (total, shift) => total + shift.assignments.length,
                0
              )

              return (
                <article
                  key={event.id}
                  className="rounded-xl border border-[#2A0E10] bg-black p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-[#B11218]">
                        {event.title}
                      </h3>
                      <p className="mt-2 text-[#B7B7B7]">
                        {formatDate(event.startsAt)} - {event.status}
                      </p>
                    </div>
                    <Link
                      href={`/events/${event.id}`}
                      className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                    >
                      View Event
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Registrations
                      </div>
                      <div className="mt-2 text-2xl font-bold text-white">
                        {registeredCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Checked in
                      </div>
                      <div className="mt-2 text-2xl font-bold text-white">
                        {checkedInCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
                      <div className="text-sm font-semibold text-[#8F8F8F]">
                        Volunteer coverage
                      </div>
                      <div className="mt-2 text-2xl font-bold text-white">
                        {assignedVolunteers}/{neededVolunteers}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}

            {events.length === 0 && (
              <div className="rounded-xl border border-[#2A0E10] bg-black p-5 text-[#B7B7B7]">
                No events are available for reporting yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          {futureReportAreas.map((area) => (
            <div
              key={area.title}
              className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl"
            >
              <h2 className="text-xl font-black uppercase tracking-wide text-[#B11218]">
                {area.title}
              </h2>
              <p className="mt-3 leading-7 text-[#B7B7B7]">
                {area.description}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
