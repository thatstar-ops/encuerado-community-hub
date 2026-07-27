import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { getAvailableCampaignYears } from '@/lib/recipients'
import CampaignForm from '../../../../components/admin/CampaignForm'

export default async function NewCampaignPage() {
  await requireNonCheckInAdmin()

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    select: { id: true, title: true },
  })

  const externalContactLists = await prisma.externalContactList.findMany({
    select: { id: true, label: true },
    orderBy: { label: 'asc' },
  })

  const availableYears = await getAvailableCampaignYears()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Create New Campaign</h1>
            <p className="mt-2 text-[#B7B7B7]">
              Build an email campaign, preview recipients, send a test, then send when ready.
            </p>
          </div>

          <Link
            href="/admin/campaigns"
            className="rounded-lg border border-[#3A1215] px-4 py-3 font-bold text-white hover:border-[#B11218] hover:text-[#B11218]"
          >
            Back to Campaigns
          </Link>
        </div>

        <CampaignForm
          events={events}
          externalContactLists={externalContactLists}
          availableYears={availableYears}
        />
      </div>
    </main>
  )
}