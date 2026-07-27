import { requireSuperAdmin } from '@/lib/auth'
import Link from 'next/link'
import ExternalContactImportForm from '@/components/admin/ExternalContactImportForm'

export default async function ImportExternalContactsPage() {
  const admin = await requireSuperAdmin()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin/admin-users"
          className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
        >
          ← Back to Admin Users
        </Link>

        <div className="mt-6 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-4xl font-bold">
            Import External Contact List
          </h1>

          <p className="mt-3 text-[#B7B7B7]">
            Enter a list label and upload a CSV. Contacts are imported
            as external contacts only—no attendee or volunteer records
            are created.
          </p>

          <ExternalContactImportForm adminEmail={admin.email || ''} />
        </div>
      </div>
    </main>
  )
}
