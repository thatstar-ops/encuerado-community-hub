import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ImportCsvForm from '@/components/admin/ImportCsvForm'

export default async function ImportsPage() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/imports')

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    select: { id: true, title: true },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">Back to Dashboard</Link>
        <div className="mt-6 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-4xl font-bold">Imports</h1>
          <p className="mt-3 text-[#B7B7B7]">Choose an import category and year, preview every CSV row, then confirm before any data is written.</p>
          <ImportCsvForm
            events={events}
            isSuperAdmin={admin.role === 'SUPER_ADMIN'}
            adminEmail={admin.email}
          />
        </div>
      </div>
    </main>
  )
}
