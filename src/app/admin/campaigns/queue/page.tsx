import Link from 'next/link'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DAILY_CAMPAIGN_EMAIL_LIMIT } from '@/lib/campaign-send'
import ProcessCampaignQueueButton from '@/components/admin/ProcessCampaignQueueButton'
import ResetCampaignQueueButton from '@/components/admin/ResetCampaignQueueButton'

function formatDateTime(date: Date | null, emptyLabel = '-') {
  if (!date) return emptyLabel

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function statusBadgeClass(status: string) {
  if (status === 'Sent') return 'bg-green-600 text-white'
  if (status === 'Sending') return 'bg-[#B11218] text-white'
  if (status === 'Scheduled') return 'bg-[#6E0D12] text-white'
  if (status === 'Failed') return 'bg-red-800 text-white'
  if (status === 'Skipped') return 'bg-yellow-700 text-white'
  return 'bg-[#3A1215] text-white'
}

export default async function CampaignQueuePage() {
  await requireNonCheckInAdmin()

  const now = new Date()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [
    total,
    dueNow,
    scheduledFuture,
    scheduledTotal,
    sending,
    sent,
    failed,
    skipped,
    sentToday,
    recentQueueItems,
    failedItems,
  ] = await Promise.all([
    prisma.emailCampaignRecipientQueue.count(),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Scheduled',
        scheduledFor: {
          lte: now,
        },
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Scheduled',
        scheduledFor: {
          gt: now,
        },
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Scheduled',
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Sending',
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Sent',
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Failed',
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Skipped',
      },
    }),
    prisma.emailCampaignRecipientQueue.count({
      where: {
        status: 'Sent',
        sentAt: {
          gte: startOfToday,
        },
      },
    }),
    prisma.emailCampaignRecipientQueue.findMany({
      orderBy: [
        { scheduledFor: 'asc' },
        { batchNumber: 'asc' },
        { createdAt: 'asc' },
      ],
      take: 100,
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            subject: true,
            status: true,
          },
        },
        member: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.emailCampaignRecipientQueue.findMany({
      where: {
        status: 'Failed',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 25,
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            subject: true,
          },
        },
      },
    }),
  ])

  const cards = [
    { label: 'Total Queue', value: total },
    { label: 'Due Now', value: dueNow },
    { label: 'Scheduled Future', value: scheduledFuture },
    { label: 'Scheduled Total', value: scheduledTotal },
    { label: 'Sending', value: sending },
    { label: 'Sent', value: sent },
    { label: 'Failed', value: failed },
    { label: 'Skipped', value: skipped },
    { label: 'Sent Today', value: sentToday },
    { label: 'Daily Limit', value: DAILY_CAMPAIGN_EMAIL_LIMIT },
  ]

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold">Email Queue Diagnostics</h1>
            <p className="mt-2 text-sm text-[#B7B7B7]">
              Monitor scheduled, sent, failed, and due campaign email queue items.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/campaigns"
              className="rounded border border-[#6E0D12] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]"
            >
              Back to Campaigns
            </Link>

            <Link
              href="/admin"
              className="rounded border border-[#6E0D12] px-4 py-2 text-sm font-bold text-white hover:border-[#B11218] hover:text-[#B11218]"
            >
              Admin Home
            </Link>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#B7B7B7]">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <ProcessCampaignQueueButton
            dueCount={dueNow}
            dailyLimit={DAILY_CAMPAIGN_EMAIL_LIMIT}
          />

          <ResetCampaignQueueButton
            failedCount={failed}
            onlyApiKeyInvalid
          />
        </div>

        <div className="mb-6 rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
          <h2 className="text-2xl font-bold">Recent Failed Items</h2>
          <p className="mt-1 text-sm text-[#B7B7B7]">
            Most recent failures and error messages.
          </p>

          {failedItems.length === 0 ? (
            <p className="mt-4 text-sm text-[#B7B7B7]">No failed queue items.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#151111] text-white">
                  <tr>
                    <th className="p-3 font-bold">Campaign</th>
                    <th className="p-3 font-bold">Email</th>
                    <th className="p-3 font-bold">Scheduled</th>
                    <th className="p-3 font-bold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {failedItems.map((item) => (
                    <tr key={item.id} className="border-t border-[#2A0E10] align-top">
                      <td className="p-3">
                        <Link
                          href={`/admin/campaigns/${item.campaignId}/edit`}
                          className="font-bold text-[#B11218] hover:text-[#D11A22]"
                        >
                          {item.campaign.title || item.campaign.subject}
                        </Link>
                      </td>
                      <td className="p-3 text-[#B7B7B7]">{item.email}</td>
                      <td className="p-3 text-[#B7B7B7]">{formatDateTime(item.scheduledFor)}</td>
                      <td className="max-w-md p-3 text-[#ffb4b4]">{item.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
          <h2 className="text-2xl font-bold">Queue Items</h2>
          <p className="mt-1 text-sm text-[#B7B7B7]">
            Showing up to 100 queue records ordered by scheduled time.
          </p>

          {recentQueueItems.length === 0 ? (
            <p className="mt-4 text-sm text-[#B7B7B7]">No queue items yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#151111] text-white">
                  <tr>
                    <th className="p-3 font-bold">Campaign</th>
                    <th className="p-3 font-bold">Email</th>
                    <th className="p-3 font-bold">Name</th>
                    <th className="p-3 font-bold">Status</th>
                    <th className="p-3 font-bold">Batch</th>
                    <th className="p-3 font-bold">Scheduled</th>
                    <th className="p-3 font-bold">Sent</th>
                    <th className="p-3 font-bold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQueueItems.map((item) => (
                    <tr key={item.id} className="border-t border-[#2A0E10] align-top">
                      <td className="p-3">
                        <Link
                          href={`/admin/campaigns/${item.campaignId}/edit`}
                          className="font-bold text-[#B11218] hover:text-[#D11A22]"
                        >
                          {item.campaign.title || item.campaign.subject}
                        </Link>
                      </td>
                      <td className="p-3 text-[#B7B7B7]">{item.email}</td>
                      <td className="p-3 text-[#B7B7B7]">
                        {[item.member.firstName, item.member.lastName].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-[#B7B7B7]">{item.batchNumber}</td>
                      <td className="p-3 text-[#B7B7B7]">{formatDateTime(item.scheduledFor)}</td>
                      <td className="p-3 text-[#B7B7B7]">{formatDateTime(item.sentAt, '-')}</td>
                      <td className="max-w-md p-3 text-[#ffb4b4]">{item.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}