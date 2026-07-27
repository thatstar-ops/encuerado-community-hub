import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import ConfirmDeleteCampaignButton from './ConfirmDeleteCampaignButton'

export default function DeleteCampaignForm({
  campaignId,
  campaignTitle,
  disabled,
}: {
  campaignId: string
  campaignTitle: string
  disabled: boolean
}) {
  async function deleteCampaign() {
    'use server'

    await requireNonCheckInAdmin()

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        status: true,
        sentAt: true,
      },
    })

    if (!campaign) {
      redirect('/admin/campaigns')
    }

    if (campaign.status === 'Sent' || campaign.status === 'Sending' || campaign.sentAt) {
      redirect('/admin/campaigns')
    }

    await prisma.emailCampaign.delete({
      where: { id: campaignId },
    })

    redirect('/admin/campaigns')
  }

  if (disabled) {
    return (
      <span className="rounded border border-[#2A0E10] px-3 py-1 text-xs font-medium text-[#777777]">
        Delete Locked
      </span>
    )
  }

  return (
    <form action={deleteCampaign}>
      <ConfirmDeleteCampaignButton campaignTitle={campaignTitle} />
    </form>
  )
}