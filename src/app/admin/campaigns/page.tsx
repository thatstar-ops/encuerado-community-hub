import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DeleteCampaignForm from '@/components/admin/DeleteCampaignForm'
import ProcessCampaignQueueButton from '@/components/admin/ProcessCampaignQueueButton'
import { DAILY_CAMPAIGN_EMAIL_LIMIT } from '@/lib/campaign-send'

type AudienceConfig = {
  segments?: unknown
  eventIds?: unknown
  externalContactListIds?: unknown
  manualEmails?: unknown
  categoryYears?: unknown
}

const YEAR_AWARE_SEGMENTS = new Set(['attendees', 'volunteers', 'sponsors'])

function formatDateTime(date: Date | null, emptyLabel = '-') {
  if (!date) return emptyLabel

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

async function getNextAvailableCampaignDate() {
  let day = startOfUtcDay(new Date())

  for (let safety = 0; safety < 365; safety++) {
    const nextDay = addUtcDays(day, 1)

    const used = await prisma.emailCampaignRecipientQueue.count({
      where: {
        scheduledFor: {
          gte: day,
          lt: nextDay,
        },
        status: {
          in: ['Scheduled', 'Sending', 'Sent'],
        },
      },
    })

    if (used < DAILY_CAMPAIGN_EMAIL_LIMIT) return day

    day = nextDay
  }

  return null
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function parseAudienceConfig(value: unknown): AudienceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as AudienceConfig
}

function segmentLabel(value: string) {
  const labels: Record<string, string> = {
    all_contacts: 'All Contacts',
    attendees: 'Attendees',
    past_attendees: 'Past Attendees',
    volunteers: 'Volunteers',
    sponsors: 'Sponsors',
    active_2026_volunteers: '2026 Active Volunteers',
    prior_volunteers_no_2026_shift: 'Prior Volunteers / No 2026 Shift',
    weekend_crew: 'Weekend Crew',
    latrine_duty: 'Latrine Duty Crew',
  }

  return labels[value] || value
}

function describeSegment(value: string, categoryYears: Record<string, number[]>) {
  const base = segmentLabel(value)
  if (!YEAR_AWARE_SEGMENTS.has(value)) return base

  const raw = categoryYears[value]
  const years = Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isInteger(n)) : []

  // Legacy 'volunteers' campaigns saved before year-filtering existed had no
  // categoryYears at all, and meant "every volunteer ever" - keep that label
  // rather than implying a filter was applied.
  if (!years.length) {
    return value === 'volunteers' ? 'All Volunteer Profiles' : `${base} (All years)`
  }

  return `${base} (${years.join(', ')})`
}

function recipientTypeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    all_contacts: 'All Contacts',
    past_attendees: 'Past Attendees',
    specific_event: 'Specific Event',
    volunteers: 'Volunteers',
    external_contact_list: 'External Contact List',
    manual_list: 'Manual List',
    combined: 'Combined Audience',
  }

  return labels[value || ''] || value || 'Unknown'
}

function describeAudience(
  campaign: {
    recipientType: string
    recipientEventId: string | null
    manualEmails: string | null
    audienceConfig: unknown
  },
  eventLabels: Map<string, string>,
  listLabels: Map<string, string>
) {
  if (campaign.recipientType !== 'combined') {
    if (campaign.recipientType === 'specific_event' && campaign.recipientEventId) {
      return [`Event: ${eventLabels.get(campaign.recipientEventId) || 'Selected Event'}`]
    }

    if (campaign.recipientType === 'external_contact_list' && campaign.recipientEventId) {
      return [`List: ${listLabels.get(campaign.recipientEventId) || 'Selected List'}`]
    }

    if (campaign.recipientType === 'manual_list') {
      return ['Manual List']
    }

    return [recipientTypeLabel(campaign.recipientType)]
  }

  const config = parseAudienceConfig(campaign.audienceConfig)
  const labels: string[] = []

  const categoryYears: Record<string, number[]> = {}
  if (config.categoryYears && typeof config.categoryYears === 'object' && !Array.isArray(config.categoryYears)) {
    for (const [key, value] of Object.entries(config.categoryYears as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        categoryYears[key] = value.map(Number).filter((n) => Number.isInteger(n))
      }
    }
  }

  for (const segment of stringArray(config.segments)) {
    labels.push(describeSegment(segment, categoryYears))
  }

  for (const eventId of stringArray(config.eventIds)) {
    labels.push(`Event: ${eventLabels.get(eventId) || 'Selected Event'}`)
  }

  for (const listId of stringArray(config.externalContactListIds)) {
    labels.push(`List: ${listLabels.get(listId) || 'Selected List'}`)
  }

  if (String(config.manualEmails || '').trim()) {
    labels.push('Manual Emails')
  }

  return labels.length ? labels : ['Combined Audience']
}

function DuplicateCampaignButton({ campaignId }: { campaignId: string }) {
  async function duplicateCampaign() {
    'use server'

    await requireNonCheckInAdmin()

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    })

    if (!campaign) return

    const copy = await prisma.emailCampaign.create({
      data: {
        title: campaign.title ? `${campaign.title} Copy` : 'Campaign Copy',
        subject: campaign.subject,
        previewText: campaign.previewText,
        body: campaign.body,
        content: campaign.content === null ? undefined : campaign.content,
        fromEmail: campaign.fromEmail,
        recipientType: campaign.recipientType,
        recipientEventId: campaign.recipientEventId,
        manualEmails: campaign.manualEmails,
        audienceConfig: campaign.audienceConfig === null ? undefined : campaign.audienceConfig,
        ctaButtonText: campaign.ctaButtonText,
        ctaUrl: campaign.ctaUrl,
        status: 'Draft',
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        sentAt: null,
      },
    })

    redirect(`/admin/campaigns/${copy.id}/edit`)
  }

  return (
    <form action={duplicateCampaign}>
      <button
        type="submit"
        className="rounded border border-[#6E0D12] px-3 py-1 text-xs font-medium text-white hover:border-[#B11218] hover:text-[#B11218]"
      >
        Duplicate
      </button>
    </form>
  )
}

export default async function CampaignsPage() {
  await requireNonCheckInAdmin()

  const [campaigns, events, externalContactLists, nextAvailableCampaignDate] =
    await Promise.all([
      prisma.emailCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          queues: {
            select: {
              id: true,
              status: true,
              scheduledFor: true,
              sentAt: true,
              createdAt: true,
            },
            orderBy: [
              { scheduledFor: 'asc' },
              { createdAt: 'asc' },
            ],
          },
        },
      }),
      prisma.event.findMany({
        select: {
          id: true,
          title: true,
        },
      }),
      prisma.externalContactList.findMany({
        select: {
          id: true,
          label: true,
        },
      }),
      getNextAvailableCampaignDate(),
    ])

  const eventLabels = new Map(events.map((event) => [event.id, event.title]))
  const listLabels = new Map(externalContactLists.map((list) => [list.id, list.label]))

  const now = new Date()
  const allQueues = campaigns.flatMap((campaign) => campaign.queues)
  const dueScheduledCount = allQueues.filter(
    (queue) => queue.status === 'Scheduled' && queue.scheduledFor <= now
  ).length
  const scheduledQueueCount = allQueues.filter((queue) => queue.status === 'Scheduled').length
  const sendingQueueCount = allQueues.filter((queue) => queue.status === 'Sending').length
  const sentQueueCount = allQueues.filter((queue) => queue.status === 'Sent').length
  const failedQueueCount = allQueues.filter((queue) => queue.status === 'Failed').length

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Email Campaigns</h1>
            <p className="mt-2 text-sm text-[#B7B7B7]">
              Daily campaign capacity: {DAILY_CAMPAIGN_EMAIL_LIMIT} emails. Next available campaign date:{' '}
              <span className="font-bold text-white">
                {formatDateTime(nextAvailableCampaignDate, 'No date available')}
              </span>
            </p>
          </div>

          <Link
            href="/admin/campaigns/new"
            className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
          >
            Create New Campaign
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">Due Now</p>
            <p className="mt-2 text-3xl font-bold text-white">{dueScheduledCount}</p>
          </div>

          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">Scheduled</p>
            <p className="mt-2 text-3xl font-bold text-white">{scheduledQueueCount}</p>
          </div>

          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">Sending</p>
            <p className="mt-2 text-3xl font-bold text-white">{sendingQueueCount}</p>
          </div>

          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">Sent</p>
            <p className="mt-2 text-3xl font-bold text-white">{sentQueueCount}</p>
          </div>

          <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">Failed</p>
            <p className="mt-2 text-3xl font-bold text-white">{failedQueueCount}</p>
          </div>
        </div>

        <div className="mb-6">
          <ProcessCampaignQueueButton
            dueCount={dueScheduledCount}
            dailyLimit={DAILY_CAMPAIGN_EMAIL_LIMIT}
          />
        </div>

        <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
          {campaigns.length === 0 ? (
            <p className="text-[#B7B7B7]">No campaigns yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#151111] text-white">
                  <tr>
                    <th className="p-4 font-bold">Title</th>
                    <th className="p-4 font-bold">Subject</th>
                    <th className="p-4 font-bold">Audience</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold">Schedule</th>
                    <th className="p-4 font-bold">Progress</th>
                    <th className="p-4 font-bold">Created</th>
                    <th className="p-4 font-bold">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {campaigns.map((campaign) => {
                    const audienceLabels = describeAudience(
                      campaign,
                      eventLabels,
                      listLabels
                    )

                    const scheduledCount = campaign.queues.filter(
                      (queue) => queue.status === 'Scheduled'
                    ).length

                    const sendingCount = campaign.queues.filter(
                      (queue) => queue.status === 'Sending'
                    ).length

                    const sentQueueCountForCampaign = campaign.queues.filter(
                      (queue) => queue.status === 'Sent'
                    ).length

                    const skippedQueueCount = campaign.queues.filter(
                      (queue) => queue.status === 'Skipped'
                    ).length

                    const failedQueueCountForCampaign = campaign.queues.filter(
                      (queue) => queue.status === 'Failed'
                    ).length

                    const remainingCount = scheduledCount + sendingCount

                    const nextBatchDate =
                      campaign.queues.find((queue) => queue.status === 'Scheduled')
                        ?.scheduledFor || null

                    const queueTotal = campaign.queues.length
                    const completedCount = sentQueueCountForCampaign + skippedQueueCount

                    const deleteLocked =
                      campaign.status === 'Sent' ||
                      campaign.status === 'Sending' ||
                      campaign.status === 'Scheduled' ||
                      Boolean(campaign.sentAt) ||
                      queueTotal > 0

                    return (
                      <tr key={campaign.id} className="border-t border-[#2A0E10] align-top">
                        <td className="p-4 font-bold text-[#B11218]">
                          {campaign.title || 'Untitled'}
                        </td>

                        <td className="p-4 text-[#B7B7B7]">
                          {campaign.subject}
                        </td>

                        <td className="p-4">
                          <div className="grid gap-1">
                            <span className="font-bold text-white">
                              {recipientTypeLabel(campaign.recipientType)}
                            </span>

                            <div className="flex max-w-md flex-wrap gap-2">
                              {audienceLabels.map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full bg-[#2A0E10] px-2 py-1 text-xs font-bold text-white"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                              campaign.status === 'Sent'
                                ? 'bg-green-600 text-white'
                                : campaign.status === 'Sending'
                                  ? 'bg-[#B11218] text-white'
                                  : campaign.status === 'Scheduled'
                                    ? 'bg-[#6E0D12] text-white'
                                    : campaign.status === 'Failed'
                                      ? 'bg-[#B11218] text-white'
                                      : 'bg-[#3A1215] text-white'
                            }`}
                          >
                            {campaign.status}
                          </span>
                        </td>

                        <td className="p-4 text-[#B7B7B7]">
                          <div className="grid gap-1">
                            <div>
                              <span className="font-bold text-white">Scheduled:</span>{' '}
                              {scheduledCount}
                            </div>
                            <div>
                              <span className="font-bold text-white">Next batch:</span>{' '}
                              {formatDateTime(nextBatchDate, 'None')}
                            </div>
                            <div>
                              <span className="font-bold text-white">Remaining:</span>{' '}
                              {remainingCount}
                            </div>
                          </div>
                        </td>

                        <td className="p-4 text-[#B7B7B7]">
                          <div className="grid gap-1">
                            <div>
                              <span className="font-bold text-white">Done:</span>{' '}
                              {completedCount}/{queueTotal || campaign.recipientCount || '?'}
                            </div>
                            <div>
                              <span className="font-bold text-white">Failed:</span>{' '}
                              {failedQueueCountForCampaign || campaign.failedCount || 0}
                            </div>
                            <div>
                              <span className="font-bold text-white">Sent date:</span>{' '}
                              {formatDateTime(campaign.sentAt, 'Not complete')}
                            </div>
                          </div>
                        </td>

                        <td className="p-4 text-[#B7B7B7]">
                          {formatDateTime(campaign.createdAt)}
                        </td>

                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/campaigns/${campaign.id}/edit`}
                              className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                            >
                              Edit
                            </Link>

                            <DuplicateCampaignButton campaignId={campaign.id} />

                            <DeleteCampaignForm
                              campaignId={campaign.id}
                              campaignTitle={campaign.title || campaign.subject || 'Untitled campaign'}
                              disabled={deleteLocked}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}