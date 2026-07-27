'use client'

export default function ConfirmDeleteCampaignButton({
  campaignTitle,
}: {
  campaignTitle: string
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        const ok = window.confirm(
          `Delete campaign "${campaignTitle}"? This cannot be undone.`
        )

        if (!ok) {
          event.preventDefault()
        }
      }}
      className="rounded border border-red-500 px-3 py-1 text-xs font-medium text-red-200 hover:bg-[#B11218] hover:text-white"
    >
      Delete
    </button>
  )
}