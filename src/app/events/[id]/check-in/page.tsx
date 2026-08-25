import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getRegistrationPassCount, getRegistrationPassLabel } from '@/lib/registration-pass-count'
import { getCurrentAdmin } from '@/lib/auth'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

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

function formatDate(date: Date | null) {
  if (!date) return ''
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

async function checkInRegistration(eventId: string, registrationId: string) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}/check-in`)
  await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: { checkedIn: true, status: 'Attended' },
  })
  redirect(`/events/${eventId}/check-in`)
}

async function undoCheckInRegistration(eventId: string, registrationId: string) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}/check-in`)
  await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: { checkedIn: false, status: 'Registered' },
  })
  redirect(`/events/${eventId}/check-in`)
}

async function markSponsorItemGiven(eventId: string, fulfillmentId: string, field: string) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}/check-in`)

  const allowedFields = [
    'wristbandsGivenAt',
    'shirtsGivenAt',
    'pinsGivenAt',
    'giftGivenAt',
  ]

  if (!allowedFields.includes(field)) {
    throw new Error('Invalid sponsor fulfillment field.')
  }

  await prisma.sponsorFulfillment.update({
    where: { id: fulfillmentId },
    data: { [field]: new Date() },
  })

  redirect(`/events/${eventId}/check-in`)
}

export default async function EventCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ q?: string }>
}) {
  const { id } = await params
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${id}/check-in`)
  const queryParams = searchParams ? await searchParams : {}
  const query = String(queryParams.q || '').trim().toLowerCase()

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: {
        include: {
          member: {
            include: {
              participationRecords: true,
              ticketPurchases: true,
              sponsorFulfillments: true,
              registrations: {
                select: {
                  checkedIn: true,
                  event: {
                    select: {
                      startsAt: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ member: { firstName: 'asc' } }, { member: { lastName: 'asc' } }],
      },
    },
  })
  if (!event) notFound()

  const isCheckIn = admin.role === 'CHECK_IN'

  function ticketPurchaseSummary(ticketPurchases: any[], sponsorFulfillment?: any) {
    if ((!ticketPurchases || ticketPurchases.length === 0) && !sponsorFulfillment) return null

    const purchases = ticketPurchases || []
    const types = purchases.map((tp: any) => tp.purchaseType)

    let label = 'TicketSpice'

    if (sponsorFulfillment?.sponsorTier) {
      label = sponsorFulfillment.sponsorTier + ' Sponsor'
    } else if (types.includes('VIP Pass')) {
      label = 'VIP Pass'
    } else if (types.includes('Weekend Pass')) {
      label = 'Weekend Pass'
    } else if (purchases.some((tp: any) => tp.sponsorNeedsReview)) {
      label = 'Sponsor - Needs Tier Review'
    } else if (types.includes('Individual Ticket')) {
      label = 'Individual Ticket'
    }

    const shirtSize = purchases.find((tp: any) => tp.shirtSize)?.shirtSize || null
    const hasPin = purchases.some((tp: any) => tp.pinIncluded)

    return { label, shirtSize, hasPin }
  }
  function getEventYear(date: Date | null) {
    if (!date) return null
    return date.getFullYear()
  }

  function hasCheckedInThisEventYear(member: any, eventYear: number | null) {
    if (!eventYear || !member?.registrations) return false

    return member.registrations.some((r: any) => {
      return Boolean(
        r.checkedIn &&
        r.event?.startsAt &&
        getEventYear(r.event.startsAt) === eventYear
      )
    })
  }

  function formatSponsorShirtSizes(value: any) {
    if (!value) return 'Unknown'
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'Unknown'
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.length ? parsed.join(', ') : 'Unknown'
      } catch {
        return value
      }
    }
    return 'Unknown'
  }

  function sponsorItemsFulfilled(fulfillment: any) {
    if (!fulfillment) return false

    const wristbandsDone = fulfillment.wristbandCount > 0 ? Boolean(fulfillment.wristbandsGivenAt) : true
    const shirtsDone = fulfillment.shirtCount > 0 ? Boolean(fulfillment.shirtsGivenAt) : true
    const pinsDone = fulfillment.pinCount > 0 ? Boolean(fulfillment.pinsGivenAt) : true
    const giftDone = fulfillment.giftIncluded ? Boolean(fulfillment.giftGivenAt) : true

    return wristbandsDone && shirtsDone && pinsDone && giftDone
  }

  const registeredPassCount = event.registrations.reduce(
    (sum, registration) => sum + getRegistrationPassCount(registration.notes),
    0
  )
  const checkedInCount = event.registrations
    .filter((registration) => registration.checkedIn)
    .reduce((sum, registration) => sum + getRegistrationPassCount(registration.notes), 0)
  const notCheckedInCount = registeredPassCount - checkedInCount

  const filteredRegistrations = query
    ? event.registrations.filter((reg) => {
        const member = reg.member
        const searchable = [
          member.firstName,
          member.lastName,
          member.preferredName || '',
          isCheckIn ? '' : member.email,
          isCheckIn ? '' : member.phone || '',
          reg.status,
          isCheckIn ? '' : reg.notes || '',
        ]
          .join(' ')
          .toLowerCase()
        return searchable.includes(query)
      })
    : event.registrations

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href={isCheckIn ? '/event-check-in' : `/events/${event.id}`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            {isCheckIn ? 'Back to Event Check-in' : 'Back to Event'}
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin" className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
              Dashboard
            </Link>
            {!isCheckIn && (
              <Link href={`/events/${event.id}/registrations/new`} className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]">
                Register Attendee
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#B11218] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">Check-in Mode</div>
              <h1 className="mt-3 text-5xl font-black uppercase tracking-wide text-white">{event.title}</h1>
              <p className="mt-3 text-xl text-[#B7B7B7]">Fast event-day attendee check-in.</p>
              <div className="mt-2 grid gap-1 text-lg text-[#8F8F8F]">
                <div><span className="font-bold text-white">Starts:</span> {formatDate(event.startsAt)}</div>
                {event.endsAt && (
                  <div>
                    <span className="font-bold text-white">
                      Ends{eventDateKey(event.startsAt) !== eventDateKey(event.endsAt) ? ' (next day)' : ''}:
                    </span>{' '}
                    {formatDate(event.endsAt)}
                  </div>
                )}
                <div><span className="font-bold text-white">Location:</span> {event.location || ''}</div>
              </div>
            </div>
            <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center">
              <div className="text-sm font-semibold text-[#B7B7B7]">Tickets</div>
              <div className="text-4xl font-black uppercase tracking-wide text-white">{registeredPassCount}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-[#2A0E10] bg-black p-6">
              <div className="text-sm font-semibold text-[#8F8F8F]">Checked In</div>
              <div className="mt-2 text-5xl font-black uppercase tracking-wide text-white">{checkedInCount}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-black p-6">
              <div className="text-sm font-semibold text-[#8F8F8F]">Not Checked In</div>
              <div className="mt-2 text-5xl font-black uppercase tracking-wide text-white">{notCheckedInCount}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-black p-6">
              <div className="text-sm font-semibold text-[#8F8F8F]">Completion</div>
              <div className="mt-2 text-5xl font-black uppercase tracking-wide text-white">
                {event.registrations.length > 0 ? `${Math.round((checkedInCount / registeredPassCount) * 100)}%` : '0%'}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
            <h2 className="text-3xl font-bold text-white">Search Attendee</h2>
            <p className="mt-2 text-[#B7B7B7]">
              {isCheckIn ? 'Search by name or check-in status.' : 'Search by name, email, phone, city, status, or notes.'}
            </p>
            <form method="GET" action={`/events/${event.id}/check-in`} className="mt-5">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                <input
                  name="q"
                  defaultValue={queryParams.q || ''}
                  autoFocus
                  placeholder={isCheckIn ? 'Type attendee name...' : 'Type attendee name, email, or phone...'}
                  className="rounded-xl border border-[#3A1215] bg-black p-5 text-2xl text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />
                <button type="submit" className="rounded-xl bg-[#B11218] px-8 py-5 text-xl font-bold text-white hover:bg-[#D11A22]">
                  Search
                </button>
                <Link href={`/events/${event.id}/check-in`} className="rounded-xl border border-[#B11218] px-8 py-5 text-center text-xl font-black uppercase tracking-wide text-[#B11218] hover:bg-[#B11218] hover:text-white">
                  Clear
                </Link>
              </div>
            </form>
            <div className="mt-4 text-sm font-bold text-[#B7B7B7]">
              Showing {filteredRegistrations.length} of {event.registrations.length} attendees
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            {filteredRegistrations.map((registration) => {
              const attendeeName = `${registration.member.preferredName || registration.member.firstName} ${registration.member.lastName}`
              const passCount = getRegistrationPassCount(registration.notes)
              const passLabel = getRegistrationPassLabel(registration.notes)
              const checkInWithIds = checkInRegistration.bind(null, event.id, registration.id)
              const undoWithIds = undoCheckInRegistration.bind(null, event.id, registration.id)
              const currentEventYear = getEventYear(event.startsAt)
              const sponsorFulfillment = registration.member.sponsorFulfillments?.find((item: any) => item.eventYear === currentEventYear) || null
              const sponsorFulfilled = sponsorFulfillment ? sponsorItemsFulfilled(sponsorFulfillment) : false
              const markWristbandsGiven = sponsorFulfillment ? markSponsorItemGiven.bind(null, event.id, sponsorFulfillment.id, 'wristbandsGivenAt') : null
              const markShirtsGiven = sponsorFulfillment ? markSponsorItemGiven.bind(null, event.id, sponsorFulfillment.id, 'shirtsGivenAt') : null
              const markPinsGiven = sponsorFulfillment ? markSponsorItemGiven.bind(null, event.id, sponsorFulfillment.id, 'pinsGivenAt') : null
              const markGiftGiven = sponsorFulfillment ? markSponsorItemGiven.bind(null, event.id, sponsorFulfillment.id, 'giftGivenAt') : null

              return (
                <div
                  key={registration.id}
                  className={
                    registration.checkedIn
                      ? 'rounded-2xl border border-[#B11218] bg-[#B11218] p-6 text-white shadow-xl'
                      : 'rounded-2xl border border-[#2A0E10] bg-[#151111] p-6 text-white shadow-xl'
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-3xl font-bold">{attendeeName}</h3>
                        <span className={passCount > 1 ? "rounded-full bg-yellow-400 px-4 py-2 text-base font-black text-black" : "rounded-full bg-[#2A0E10] px-4 py-2 text-base font-bold text-white"}>
                          {passLabel}
                        </span>
                      </div>
                      {!isCheckIn && (
                        <div className="mt-2 text-lg">
                          {registration.member.email}
                          {registration.member.phone ? ` · ${registration.member.phone}` : ''}
                        </div>
                      )}
                      <div className="mt-2 text-base font-semibold">
                        Status: {registration.status}
                        {(() => {
                          const eventYear = getEventYear(event.startsAt)
                          const hasClaimedFulfillment = hasCheckedInThisEventYear(registration.member, eventYear)
                          const summary = ticketPurchaseSummary(registration.member.ticketPurchases, sponsorFulfillment)

                          if (summary) {
                            return (
                              <span className="ml-2 rounded-full bg-[#B11218] px-2 py-1 text-xs font-bold text-white">
                                {summary.label}
                                {!hasClaimedFulfillment && summary.shirtSize ? ` Shirt:${summary.shirtSize}` : ''}
                                {!hasClaimedFulfillment && summary.hasPin ? ' Pin: Yes' : ''}
                              </span>
                            )
                          }

                          if (registration.member.participationRecords.some(r => r.source === 'TicketSpice')) {
                            return <span className="ml-2 rounded-full bg-[#B11218] px-2 py-1 text-xs font-bold text-white">TicketSpice</span>
                          }

                          return null
                        })()}
                      </div>
                      {sponsorFulfillment && (
                        <div className="mt-4 rounded-xl border border-[#B11218] bg-black p-4 text-white">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">
                                {sponsorFulfillment.sponsorTier} Sponsor
                              </div>
                              <div className="mt-2 text-sm text-[#B7B7B7]">
                                Access: {sponsorFulfillment.accessLevel || 'Weekend Package'}
                              </div>
                            </div>
                            {sponsorFulfilled && (
                              <div className="rounded-full bg-green-400 px-3 py-1 text-xs font-bold text-white">
                                Sponsor items fulfilled
                              </div>
                            )}
                          </div>

                          {!sponsorFulfilled && (
                            <div className="mt-3 grid gap-2 text-sm text-white">
                              {sponsorFulfillment.wristbandCount > 0 && (
                                <div>
                                  {sponsorFulfillment.wristbandsGivenAt ? '[x]' : '[ ]'} {sponsorFulfillment.wristbandCount} {sponsorFulfillment.accessLevel?.toLowerCase().includes('vip') ? 'VIP' : 'Weekend'} wristband/pass{sponsorFulfillment.wristbandCount > 1 ? 'es' : ''}
                                </div>
                              )}
                              {sponsorFulfillment.shirtCount > 0 && (
                                <div>
                                  {sponsorFulfillment.shirtsGivenAt ? '[x]' : '[ ]'} {sponsorFulfillment.shirtCount} T-shirt{sponsorFulfillment.shirtCount > 1 ? 's' : ''}: {sponsorFulfillment.notes?.toLowerCase().includes('no t shirt') ? 'Confirm preference - TicketSpice says No T shirt' : formatSponsorShirtSizes(sponsorFulfillment.shirtSizes)}
                                </div>
                              )}
                              {sponsorFulfillment.pinCount > 0 && (
                                <div>
                                  {sponsorFulfillment.pinsGivenAt ? '[x]' : '[ ]'} {sponsorFulfillment.pinCount} commemorative event pin{sponsorFulfillment.pinCount > 1 ? 's' : ''}
                                </div>
                              )}
                              {sponsorFulfillment.giftIncluded && (
                                <div>
                                  {sponsorFulfillment.giftGivenAt ? '[x]' : '[ ]'} {sponsorFulfillment.giftDescription || 'Exclusive sponsor gift'}
                                  {sponsorFulfillment.hoodieSize ? ` ${sponsorFulfillment.hoodieSize}` : ''}
                                </div>
                              )}
                            </div>
                          )}

                          {!sponsorFulfilled && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {sponsorFulfillment.wristbandCount > 0 && !sponsorFulfillment.wristbandsGivenAt && markWristbandsGiven && (
                                <form action={markWristbandsGiven}>
                                  <button type="submit" className="rounded-lg bg-[#B11218] px-3 py-2 text-xs font-bold text-white hover:bg-[#D11A22]">
                                    Mark wristband/pass given
                                  </button>
                                </form>
                              )}
                              {sponsorFulfillment.shirtCount > 0 && !sponsorFulfillment.shirtsGivenAt && markShirtsGiven && (
                                <form action={markShirtsGiven}>
                                  <button type="submit" className="rounded-lg bg-[#B11218] px-3 py-2 text-xs font-bold text-white hover:bg-[#D11A22]">
                                    Mark shirt given
                                  </button>
                                </form>
                              )}
                              {sponsorFulfillment.pinCount > 0 && !sponsorFulfillment.pinsGivenAt && markPinsGiven && (
                                <form action={markPinsGiven}>
                                  <button type="submit" className="rounded-lg bg-[#B11218] px-3 py-2 text-xs font-bold text-white hover:bg-[#D11A22]">
                                    Mark pin given
                                  </button>
                                </form>
                              )}
                              {sponsorFulfillment.giftIncluded && !sponsorFulfillment.giftGivenAt && markGiftGiven && (
                                <form action={markGiftGiven}>
                                  <button type="submit" className="rounded-lg bg-[#B11218] px-3 py-2 text-xs font-bold text-white hover:bg-[#D11A22]">
                                    Mark gift/hoodie given
                                  </button>
                                </form>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {sponsorFulfillment.isAnonymous && (
                              <span className="rounded-full bg-[#2A0E10] px-2 py-1 text-white">Anonymous sponsor</span>
                            )}
                            {sponsorFulfillment.closingCeremonyRecognition && (
                              <span className="rounded-full bg-[#2A0E10] px-2 py-1 text-white">Ceremony recognition</span>
                            )}
                            {sponsorFulfillment.commemorativePhoto && (
                              <span className="rounded-full bg-[#2A0E10] px-2 py-1 text-white">Photo follow-up</span>
                            )}
                            {sponsorFulfillment.magazineAdSize && (
                              <span className="rounded-full bg-[#2A0E10] px-2 py-1 text-white">{sponsorFulfillment.magazineAdSize} magazine ad</span>
                            )}
                          </div>
                        </div>
                      )}
                      {!isCheckIn && registration.notes && <div className="mt-2 text-sm">Notes: {registration.notes}</div>}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {registration.checkedIn ? (
                        <>
                          <div className="rounded-xl bg-black px-6 py-4 text-xl font-black uppercase tracking-wide text-[#B11218]">Checked In</div>
                          <form action={undoWithIds}>
                            <button type="submit" className="rounded-xl border border-slate-950 px-6 py-4 text-xl font-bold text-white hover:bg-black hover:text-[#B11218]">
                              Undo
                            </button>
                          </form>
                        </>
                      ) : (
                        <form action={checkInWithIds}>
                          <button type="submit" className="rounded-xl bg-[#B11218] px-10 py-6 text-2xl font-bold text-white hover:bg-[#D11A22]">
                            Check In
                          </button>
                        </form>
                      )}
                      {!isCheckIn && (
                        <Link
                          href={`/events/${event.id}/registrations/${registration.id}/edit`}
                          className={
                            registration.checkedIn
                              ? 'rounded-xl border border-slate-950 px-6 py-4 text-xl font-bold text-white hover:bg-black hover:text-[#B11218]'
                              : 'rounded-xl border border-[#B11218] px-6 py-4 text-xl font-black uppercase tracking-wide text-[#B11218] hover:bg-[#B11218] hover:text-white'
                          }
                        >
                          Edit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredRegistrations.length === 0 && <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-6 text-[#B7B7B7]">No matching attendees found.</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
