import { notFound } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ExternalContactListMemberExportButton } from '@/components/admin/ExternalContactListExportButton'

export default async function ExternalContactListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params

  const list = await prisma.externalContactList.findUnique({
    where: { id },
    include: {
      members: {
        include: { member: true },
        orderBy: { importedAt: 'asc' },
      },
    },
  })
  if (!list) notFound()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/admin-users/external-contact-lists" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">← Back to Lists</Link>
        <div className="mt-6 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-wide text-white">{list.label}</h1>
              <p className="mt-3 text-[#B7B7B7]">{list.members.length} contacts</p>
            </div>
            <ExternalContactListMemberExportButton listId={id} />
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Phone</th>
                  <th className="p-4 font-bold">City / State</th>
                  <th className="p-4 font-bold">Imported At</th>
                  <th className="p-4 font-bold">Source</th>
                </tr>
              </thead>
              <tbody>
                {list.members.map((clm) => {
                  const m = clm.member
                  return (
                    <tr key={clm.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]">
                      <td className="p-4 font-bold text-white">
                        {m.preferredName || m.firstName} {m.lastName}
                      </td>
                      <td className="p-4 text-[#B7B7B7]">{m.email}</td>
                      <td className="p-4 text-[#B7B7B7]">{m.phone || '—'}</td>
                      <td className="p-4 text-[#B7B7B7]">
                        {[m.city, m.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="p-4 text-[#B7B7B7]">
                        {new Date(clm.importedAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-[#B7B7B7]">{clm.sourceLabel || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
