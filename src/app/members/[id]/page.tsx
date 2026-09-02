import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { passShirtSeats } from '@/lib/shirt-sizes'
import ParticipationHistory from '@/components/ParticipationHistory'
import ActionNotice from '@/components/admin/ActionNotice'
import {

  archiveMember,
  archiveVolunteerProfile,
  permanentlyDeleteMember,
  restoreMember,
  restoreVolunteerProfile,
} from '@/lib/admin-record-actions'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/members/${id}`)

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      ticketPurchases: {
        orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
      },
      registrations: {
        include: { event: true },
        orderBy: { createdAt: 'desc' },
      },
      volunteerProfile: true,
      participationRecords: {
        orderBy: [{ year: 'desc' }, { type: 'asc' }],
      },
      volunteerAssignments: {
        include: { shift: { include: { event: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!member) notFound()

  // TicketSpice info
  const ticketSpiceSource = await prisma.participationRecord.findFirst({
    where: { memberId: member.id, source: 'TicketSpice' },
    select: { id: true },
  })
  const hasTicketSpice = ticketSpiceSource !== null
  const paidRegs = hasTicketSpice
    ? member.registrations.filter((r) => r.status === 'Paid')
    : []

  const attendedCount = member.registrations.filter((r) => r.checkedIn).length
  const returnTo = `/members/${member.id}`
  const archiveMemberWithId = archiveMember.bind(null, member.id, returnTo)
  const restoreMemberWithId = restoreMember.bind(null, member.id, returnTo)
  const permanentlyDeleteMemberWithId = permanentlyDeleteMember.bind(null, member.id, returnTo)
  const archiveVolunteerProfileWithId = member.volunteerProfile
    ? archiveVolunteerProfile.bind(null, member.volunteerProfile.id, returnTo)
    : null
  const restoreVolunteerProfileWithId = member.volunteerProfile
    ? restoreVolunteerProfile.bind(null, member.volunteerProfile.id, returnTo)
    : null

  const phoneLink = phoneHref(member.phone)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <ActionNotice message={queryParams.actionMessage} status={queryParams.actionStatus} />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/members" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Back to attendees
          </Link>
          {admin && (
            <Link href={`/members/${member.id}/edit`} className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]">
              Edit Attendee
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2A0E10] pb-6">
            <div>
              <h1 className="text-5xl font-black uppercase tracking-wide text-white">
                {member.preferredName || member.firstName} {member.lastName}
              </h1>
              <p className="mt-3 text-xl text-[#B7B7B7]">
                Attendee profile, event history, and volunteer activity.
              </p>
              {member.archivedAt && (
                <div className="mt-4 inline-block rounded-full bg-[#2A0E10] px-4 py-2 text-sm font-bold text-white">
                  Archived Attendee
                </div>
              )}
            </div>
            <div className="rounded-xl border border-[#3A1215] bg-[#151111] px-5 py-4 text-center">
              <div className="text-sm font-semibold text-[#B7B7B7]">First Year</div>
              <div className="text-3xl font-bold text-white">{member.firstYearAttended}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Email</div>
              <div className="mt-2 text-lg font-bold text-[#B11218]">{member.email}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Phone</div>
              <div className="mt-2 text-lg font-bold text-white">
                {phoneLink ? <a href={phoneLink} className="text-[#B11218] hover:underline">{member.phone}</a> : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Location</div>
              <div className="mt-2 text-lg font-bold text-white">
                {[member.city, member.state].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Event Registrations</div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">{member.registrations.length}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Events Attended</div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">{attendedCount}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Volunteer Assignments</div>
              <div className="mt-2 text-4xl font-black uppercase tracking-wide text-white">{member.volunteerAssignments.length}</div>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <h2 className="text-2xl font-bold text-white">Attendee Controls</h2>
            <p className="mt-2 text-[#B7B7B7]">
              Archive to remove this attendee from active lists while keeping registrations, participation, and volunteer history.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {member.archivedAt ? (
                <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4">
                  <summary className="cursor-pointer font-bold text-[#B11218]">Restore Attendee</summary>
                  <p className="mt-3 text-sm text-[#B7B7B7]">This returns the attendee to active lists.</p>
                  <form action={restoreMemberWithId} className="mt-4">
                    <button type="submit" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Restore Attendee</button>
                  </form>
                </details>
              ) : (
                <details className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-4">
                  <summary className="cursor-pointer font-bold text-[#B11218]">Archive Attendee</summary>
                  <p className="mt-3 text-sm text-[#B7B7B7]">This hides the attendee from normal attendee lists but keeps all history.</p>
                  <form action={archiveMemberWithId} className="mt-4">
                    <button type="submit" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Archive Attendee</button>
                  </form>
                </details>
              )}
              {member.volunteerProfile && (
                member.volunteerProfile.archivedAt ? (
                  <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4">
                    <summary className="cursor-pointer font-bold text-[#B11218]">Restore Volunteer</summary>
                    <p className="mt-3 text-sm text-[#B7B7B7]">This restores the volunteer profile without changing attendee history.</p>
                    <form action={restoreVolunteerProfileWithId || undefined} className="mt-4">
                      <button type="submit" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">Restore Volunteer</button>
                    </form>
                  </details>
                ) : (
                  <details className="rounded-xl border border-[#3A1215] bg-[#0B0B0B] p-4">
                    <summary className="cursor-pointer font-bold text-[#B11218]">Archive Volunteer</summary>
                    <p className="mt-3 text-sm text-[#B7B7B7]">This hides the volunteer profile from active volunteer lists. The attendee and past assignments remain.</p>
                    <form action={archiveVolunteerProfileWithId || undefined} className="mt-4">
                      <button type="submit" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">Archive Volunteer</button>
                    </form>
                  </details>
                )
              )}
              <details className="rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4 md:col-span-2">
                <summary className="cursor-pointer font-bold text-[#FFB3B6]">Permanently Delete Attendee</summary>
                <p className="mt-3 text-sm text-[#B7B7B7]">
                  Only works when the attendee has no registrations, volunteer assignments, participation history, email history, or volunteer profile. Type DELETE to confirm.
                </p>
                <form action={permanentlyDeleteMemberWithId} className="mt-4 grid gap-3">
                  <input name="confirmPhrase" placeholder="Type DELETE" className="rounded-lg border border-[#3A1215] bg-black p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none" />
                  <button type="submit" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white">Permanently Delete Attendee</button>
                </form>
              </details>
            </div>
            <div className="mt-4 text-sm text-[#8F8F8F]">
              Related records: {member.registrations.length} registrations, {member.volunteerAssignments.length} volunteer assignments, {member.participationRecords.length} participation records.
            </div>
          </div>

          {(member.ticketPurchases.length > 0 || hasTicketSpice) && (
            <div className="mt-6 rounded-xl border border-[#B11218] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#B11218]">Ticket / Pass Info</div>
              {member.ticketPurchases.length > 0 ? (
                <>
                  {member.ticketPurchases.map((tp) => (
                    <div key={tp.id} className="mt-2 text-lg text-white">
                      {tp.productName}
                      {tp.purchaseType && <span className="ml-2 text-sm text-[#B7B7B7]">({tp.purchaseType})</span>}
                      {tp.accessLevel && <span className="ml-2 text-sm text-[#B7B7B7]"> - {tp.accessLevel}</span>}
                      {tp.orderNumber && <span className="ml-2 text-sm text-[#8F8F8F]">Order: {tp.orderNumber}</span>}
                      {tp.shirtSize && passShirtSeats(tp) > 0 && (
                        <span className="ml-2 text-sm text-[#B7B7B7]">Shirt: {tp.shirtSize}</span>
                      )}
                      {tp.shirtSize && passShirtSeats(tp) === 0 && (
                        <span className="ml-2 text-sm text-[#8F8F8F]">No shirt (comped pass)</span>
                      )}
                      {tp.pinIncluded && <span className="ml-2 text-sm text-[#B7B7B7]">Pin: Yes{tp.pinQuantity > 1 ? ` (${tp.pinQuantity})` : ''}</span>}
                      {tp.sponsorNeedsReview && <span className="ml-2 text-sm text-[#B11218]">Sponsor Review</span>}
                      {tp.paymentStatus && <span className="ml-2 text-sm text-[#8F8F8F]">Payment: {tp.paymentStatus}</span>}
                    </div>
                  ))}
                  {member.ticketPurchases.some(tp => tp.orderNumber) && (
                    <div className="mt-2 text-sm text-[#8F8F8F]">
                      Order(s): {[...new Set(member.ticketPurchases.map(tp => tp.orderNumber).filter(Boolean))].join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-2 text-lg text-white">Source: TicketSpice</div>
                  {member.registrations.filter(r => r.status === 'Paid').length > 0 && (
                    <div className="mt-2 text-sm text-[#B7B7B7]">
                      Paid registrations: {member.registrations.filter(r => r.status === 'Paid').map(r => r.event.title).join(', ')}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-[#8F8F8F]">
                    Specific pass/ticket labels require a future update.
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <div className="text-sm font-semibold text-[#8F8F8F]">Address</div>
            <div className="mt-2 text-lg text-white">
              {member.addressLine1 || '—'}<br />
              {[member.city, member.state, member.postalCode].filter(Boolean).join(', ') || ''}<br />
              {member.country || ''}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
            <div className="text-sm font-semibold text-[#8F8F8F]">Notes</div>
            <div className="mt-2 whitespace-pre-wrap text-lg text-white">{member.notes || '—'}</div>
          </div>

          <ParticipationHistory records={member.participationRecords} />

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <div className="border-b border-[#2A0E10] bg-[#151111] p-4">
              <h2 className="text-2xl font-bold text-white">Event History</h2>
              <p className="mt-1 text-[#B7B7B7]">Events this attendee is registered for.</p>
            </div>
            <table className="w-full min-w-[900px] text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Event</th>
                  <th className="p-4 font-bold">Event Date</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Checked In</th>
                  <th className="p-4 font-bold">Notes</th>
                  <th className="p-4 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {member.registrations.map((registration) => (
                  <tr key={registration.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]">
                    <td className="p-4 font-semibold">
                      <Link href={`/events/${registration.event.id}`} className="text-[#B11218] hover:text-[#D11A22] hover:underline">
                        {registration.event.title}
                      </Link>
                    </td>
                    <td className="p-4 text-white">{formatDate(registration.event.startsAt)}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white">
                        {registration.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={registration.checkedIn ? 'rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white' : 'rounded-full bg-[#2A0E10] px-3 py-1 text-sm font-bold text-white'}>
                        {registration.checkedIn ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="p-4 text-white">{registration.notes || '—'}</td>
                    <td className="p-4">
                      <Link href={`/events/${registration.event.id}/registrations/${registration.id}/edit`} className="rounded border border-[#B11218] px-3 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {member.registrations.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">No event registrations yet.</div>
            )}
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <div className="border-b border-[#2A0E10] bg-[#151111] p-4">
              <h2 className="text-2xl font-bold text-white">Volunteer Activity</h2>
              <p className="mt-1 text-[#B7B7B7]">Volunteer profile and assigned shifts.</p>
            </div>
            <div className="grid gap-4 bg-[#0B0B0B] p-5">
              <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                <div className="text-sm font-semibold text-[#8F8F8F]">Volunteer Profile</div>
                <div className="mt-2 text-lg font-bold text-white">
                  {member.volunteerProfile ? member.volunteerProfile.status : 'No volunteer profile'}
                </div>
              </div>
              {member.volunteerAssignments.map((assignment) => (
                <Link key={assignment.id} href={`/shifts/${assignment.shift.id}/edit`} className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5 hover:border-[#B11218]">
                  <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">{assignment.shift.title}</div>
                  <div className="mt-2 text-[#B7B7B7]">{assignment.shift.event.title} · {formatDate(assignment.shift.startsAt)}</div>
                  <div className="mt-2 text-[#B7B7B7]">Status: {assignment.status} · Checked In: {assignment.checkedIn ? 'Yes' : 'No'}</div>
                </Link>
              ))}
              {member.volunteerAssignments.length === 0 && (
                <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5 text-[#B7B7B7]">No volunteer assignments yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
