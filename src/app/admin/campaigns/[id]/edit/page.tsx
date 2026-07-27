import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { getAvailableCampaignYears } from '@/lib/recipients'
import { notFound } from 'next/navigation'
import CampaignForm from '../../../../../components/admin/CampaignForm'

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireNonCheckInAdmin()
  const { id } = await params

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
  })

  if (!campaign) notFound()

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
            <h1 className="text-3xl font-bold">Edit Campaign</h1>
            <p className="mt-2 text-[#B7B7B7]">
              Review content, audience, and recipient preview before sending.
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
          initialData={campaign}
        />
      </div>
    </main>
  )
}