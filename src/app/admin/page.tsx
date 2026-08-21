import Link from 'next/link'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

export default async function AdminDashboardPage() {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin')

  if (admin.role === 'VOTING') {
    redirect('/admin/contest-voting')
  }


  if (admin.role === 'CHECK_IN') {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">On-Site Check-in</h1>
          <p className="mt-4 text-xl text-[#B7B7B7]">Welcome, {admin.name}.</p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Link
              href="/event-check-in"
              className="rounded-2xl bg-[#B11218] p-8 text-2xl font-bold text-white hover:bg-[#D11A22]"
            >
              Attendee Check-in
            </Link>

            <Link
              href="/shifts/calendar"
              className="rounded-2xl bg-[#B11218] p-8 text-2xl font-bold text-white hover:bg-[#D11A22]"
            >
              Volunteer Shifts / Check-in
            </Link>
          </div>

          <form action="/logout" method="post" className="mt-8">
            <button
              type="submit"
              className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>
      </main>
    )
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentYearStart = new Date(Date.UTC(currentYear, 0, 1))
  const nextYearStart = new Date(Date.UTC(currentYear + 1, 0, 1))
  const activeVolunteerAssignmentStatuses = ['Assigned', 'Confirmed', 'Interested']

  // A member whose ONLY ticket purchase(s) are Carne Asada (a food add-on, not an
  // event/weekend ticket) should not be counted as a genuine current-year attendee,
  // even though the TicketSpice pipeline creates an ATTENDEE participation record for
  // any paid order regardless of product. Keep in sync with members/page.tsx.
  const carneAsadaOnlyCondition: Prisma.MemberWhereInput = {
    ticketPurchases: {
      some: {},
      every: { productName: { contains: 'Carne Asada', mode: 'insensitive' } },
    },
  }

  const [
    attendeeCountCurrentYear,
    totalAttendeeCount,
    volunteerCountCurrentYear,
    totalVolunteerProfiles,
    totalOpenShiftSlots,
    activeOpenShiftAssignments,
    draftCampaignCount,
    sentCampaignCount,
    webhookNeedsProcessingCount,
    webhookFailedCount,
    stripeWebhookNeedsProcessingCount,
    stripeWebhookFailedCount,
    eventCount,
  ] = await Promise.all([
    prisma.member.count({
      where: {
        archivedAt: null,
        participationRecords: {
          some: {
            year: currentYear,
            type: 'ATTENDEE',
          },
        },
        NOT: carneAsadaOnlyCondition,
      },
    }),

    prisma.member.count({
      where: {
        archivedAt: null,
        participationRecords: {
          some: {
            type: 'ATTENDEE',
          },
        },
      },
    }),

    prisma.member.count({
      where: {
        archivedAt: null,
        volunteerAssignments: {
          some: {
            status: { in: activeVolunteerAssignmentStatuses },
            shift: {
              startsAt: {
                gte: currentYearStart,
                lt: nextYearStart,
              },
              archivedAt: null,
              cancelledAt: null,
            },
          },
        },
      },
    }),

    prisma.volunteerProfile.count({
      where: {
        archivedAt: null,
      },
    }),

    prisma.volunteerShift.aggregate({
      where: {
        status: 'Open',
        archivedAt: null,
        cancelledAt: null,
      },
      _sum: {
        neededCount: true,
      },
    }),

    prisma.volunteerAssignment.count({
      where: {
        status: { in: activeVolunteerAssignmentStatuses },
        shift: {
          status: 'Open',
          archivedAt: null,
          cancelledAt: null,
        },
      },
    }),

    prisma.emailCampaign.count({
      where: {
        status: 'Draft',
      },
    }),

    prisma.emailCampaign.count({
      where: {
        status: 'Sent',
      },
    }),

    prisma.ticketSpiceWebhookLog.count({
      where: {
        processedAt: null,
      },
    }),

    prisma.ticketSpiceWebhookLog.count({
      where: {
        OR: [
          { status: 'failed' },
          { status: 'Failed' },
          { error: { not: null } },
        ],
      },
    }),

    prisma.stripeWebhookLog.count({
      where: {
        processedAt: null,
      },
    }),

    prisma.stripeWebhookLog.count({
      where: {
        OR: [
          { status: 'failed' },
          { error: { not: null } },
        ],
      },
    }),

    prisma.event.count({
      where: {
        archivedAt: null,
        cancelledAt: null,
      },
    }),
  ])

  const totalVolunteerSlotsNeeded = totalOpenShiftSlots._sum.neededCount || 0
  const shiftsToFill = Math.max(totalVolunteerSlotsNeeded - activeOpenShiftAssignments, 0)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl font-black uppercase tracking-wide text-white">Dashboard</h1>
            <p className="mt-4 text-xl text-[#B7B7B7]">
              Welcome back, {admin.name}.
            </p>
          </div>

          <form action="/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/members?year=current&type=attendee"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              {currentYear} Attendees
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {attendeeCountCurrentYear}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Total attendees: {totalAttendeeCount}
            </div>
          </Link>

          <Link
            href="/admin/volunteers"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              {currentYear} Volunteers
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {volunteerCountCurrentYear}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Total volunteer profiles: {totalVolunteerProfiles}
            </div>
          </Link>

          <Link
            href="/shifts?needs=1"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              Shifts to Fill
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {shiftsToFill}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              {activeOpenShiftAssignments} of {totalVolunteerSlotsNeeded} open slots assigned
            </div>
          </Link>

          <Link
            href="/admin/campaigns?status=Draft"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              Email Campaigns
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {draftCampaignCount}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Drafts: {draftCampaignCount} / Sent: {sentCampaignCount}
            </div>
          </Link>

          <Link
            href="/admin/stripe-webhooks?filter=unprocessed"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              Stripe Webhooks
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {stripeWebhookNeedsProcessingCount}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Needs processing / Failed: {stripeWebhookFailedCount}
            </div>
          </Link>

          <Link
            href="/admin/ticketspice-webhooks?filter=unprocessed"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              TicketSpice Webhooks
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {webhookNeedsProcessingCount}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Needs processing / Failed: {webhookFailedCount}
            </div>
          </Link>

          <Link
            href="/events"
            className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-xl transition-colors hover:border-[#B11218] hover:bg-[#151111]"
          >
            <div className="text-xl font-black uppercase tracking-wide text-[#B11218]">
              Events
            </div>
            <div className="mt-3 text-5xl font-extrabold text-white">
              {eventCount}
            </div>
            <div className="mt-3 text-base font-medium text-[#B7B7B7]">
              Active event records
            </div>
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Link
            href="/event-check-in"
            className="rounded-xl border border-[#B11218] bg-[#B11218] p-5 font-bold text-white hover:bg-[#D11A22]"
          >
            Event Check-in
          </Link>
<Link
            href="/admin/operations"
            className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 font-bold text-[#B11218] hover:border-[#B11218] hover:bg-[#151111]"
          >
            Event Operations
          </Link>

          <Link
            href="/shifts/calendar"
            className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 font-bold text-[#B11218] hover:border-[#B11218] hover:bg-[#151111]"
          >
            Shift Calendar
          </Link>

          <Link
            href="/admin/campaigns/new"
            className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-5 font-bold text-[#B11218] hover:border-[#B11218] hover:bg-[#151111]"
          >
            New Campaign
          </Link>
        </div>
      </div>
    </main>
  )
}