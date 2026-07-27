import { requireSuperAdmin } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function ExternalContactListsPage() {
  await requireSuperAdmin()

  const lists = await prisma.externalContactList.findMany({
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/admin-users" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">← Back to Admin Users</Link>
        <div className="mt-6 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-4xl font-bold">External Contact Lists</h1>
          <p className="mt-3 text-[#B7B7B7]">Manage imported external contact lists.</p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Label</th>
                  <th className="p-4 font-bold">Contacts</th>
                  <th className="p-4 font-bold">Created</th>
                  <th className="p-4 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((list) => (
                  <tr key={list.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]">
                    <td className="p-4 font-bold text-[#B11218]">{list.label}</td>
                    <td className="p-4 text-[#B7B7B7]">{list._count.members}</td>
                    <td className="p-4 text-[#B7B7B7]">{new Date(list.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <Link href={`/admin/admin-users/external-contact-lists/${list.id}`} className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
                        View Contacts
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lists.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">No external contact lists yet.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
