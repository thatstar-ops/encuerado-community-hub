import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'

export default async function VolunteersPage() {
  const admin = await requireNonCheckInAdmin()

  const volunteers = await prisma.volunteerProfile.findMany({
    include: { member: true },
    orderBy: [{ member: { firstName: 'asc' } }, { member: { lastName: 'asc' } }],
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Dashboard
          </Link>
        </div>
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">Volunteers</h1>
          <p className="mt-4 text-xl text-[#B7B7B7]">Review volunteer profiles.</p>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">Phone</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Shirt Size</th>
                  <th className="p-4 font-bold">Roles</th>
                </tr>
              </thead>
              <tbody>
                {volunteers.map((vp) => (
                  <tr key={vp.id} className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]">
                    <td className="p-4">
                      <Link
                        href={`/members/${vp.member.id}`}
                        className="font-bold text-[#B11218] hover:text-[#D11A22] hover:underline"
                      >
                        {vp.member.preferredName || vp.member.firstName} {vp.member.lastName}
                      </Link>
                    </td>
                    <td className="p-4 text-[#B7B7B7]">{vp.member.email}</td>
                    <td className="p-4 text-[#B7B7B7]">{vp.member.phone || '—'}</td>
                    <td className="p-4 text-[#B7B7B7]">{vp.status}</td>
                    <td className="p-4 text-[#B7B7B7]">{vp.shirtSize || '—'}</td>
                    <td className="p-4 text-[#8F8F8F]">{vp.preferredRoles || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {volunteers.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">No volunteers yet.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
