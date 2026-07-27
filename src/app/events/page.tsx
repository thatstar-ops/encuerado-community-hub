import Image from 'next/image'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin, requireNonCheckInAdmin } from '@/lib/auth'
import { moveEventUp, moveEventDown } from '@/lib/event-reorder-actions'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

function formatDate(date: Date | null) {
  if (!date) return '�'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function EventsListPage() {
  const admin = await getCurrentAdmin()

  const where: any = {
    archivedAt: null,
    cancelledAt: null,
  }
  if (admin) {
    where.status = { not: 'Cancelled' }
  } else {
    where.status = 'Published'
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: [
      { displayOrder: 'asc' },
      { startsAt: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      location: true,
      status: true,
      archivedAt: true,
      cancelledAt: true,
      flyerImageUrl: true,
      _count: {
        select: { registrations: true },
      },
    },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Upcoming Events</h1>
          {admin && (
            <Link
              href="/events/new"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              + New Event
            </Link>
          )}
        </div>

        <div className="mt-8 grid gap-4">
          {events.length === 0 ? (
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-[#B7B7B7]">
              No public events available at the moment.
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 hover:border-[#B11218]"
              >
                <div className="flex flex-wrap items-start gap-4">
                  {admin && (
                    <div className="flex flex-col gap-1">
                      <form action={moveEventUp.bind(null, event.id)}>
                        <button
                          type="submit"
                          className="rounded bg-[#2A0E10] px-2 py-1 text-xs text-white hover:bg-[#3A1215]"
                          title="Move up"
                        >
                          ?
                        </button>
                      </form>
                      <form action={moveEventDown.bind(null, event.id)}>
                        <button
                          type="submit"
                          className="rounded bg-[#2A0E10] px-2 py-1 text-xs text-white hover:bg-[#3A1215]"
                          title="Move down"
                        >
                          ?
                        </button>
                      </form>
                    </div>
                  )}
                  {event.flyerImageUrl && (
                    <div className="relative h-24 w-24 flex-shrink-0">
                      <Image
                        src={event.flyerImageUrl}
                        alt={`${event.title} flyer`}
                        fill
                        sizes="96px"
                        className="rounded-lg object-cover"
                      />
                    </div>
                  )}
                  <Link href={`/events/${event.id}`} className="flex-1">
                    <h2 className="text-2xl font-bold text-[#B11218]">
                      {event.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#B7B7B7]">
                      {formatDate(event.startsAt)}
                      {event.endsAt && ` � ${formatDate(event.endsAt)}`}
                    </p>
                    {event.location && (
                      <p className="text-sm text-[#8F8F8F]">{event.location}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-[#B11218] px-3 py-1 font-bold text-white">
                        {event.status}
                      </span>
                      {event.archivedAt && (
                        <span className="rounded-full bg-[#2A0E10] px-3 py-1 font-bold text-white">
                          Archived
                        </span>
                      )}
                      {event.cancelledAt && (
                        <span className="rounded-full bg-red-500 px-3 py-1 font-bold text-white">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#B7B7B7]">
                      {event._count.registrations} registrations
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
