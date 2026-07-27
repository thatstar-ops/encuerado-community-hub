'use client'

export function ExternalContactListMemberExportButton({ listId }: { listId: string }) {
  return (
    <a
      href={`/api/admin/external-contact-lists/${listId}/export`}
      className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
    >
      Export CSV
    </a>
  )
}
