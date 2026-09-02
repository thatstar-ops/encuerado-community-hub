import Link from 'next/link'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { getCurrentAdmin } from '@/lib/auth'
import { createOperationsContact } from '@/lib/operations-actions'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string }>
}) {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin/operations/contacts/new')
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const params = await searchParams
  const isCrew = params.crew === 'true'

  const createContact = createOperationsContact.bind(null, '/admin/operations')

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/admin/operations"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to Operations
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-3xl font-bold text-white">
            {isCrew ? 'Add to Weekend Crew List' : 'Add Vendor / Contact'}
          </h1>
          <p className="mt-2 text-[#B7B7B7]">
            {isCrew
              ? 'Add a person who can be assigned to event crews.'
              : 'Create a new global contact.'}
          </p>

          <form action={createContact} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="font-bold">Name *</span>
              <input name="name" required className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Company</span>
              <input name="company" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Role</span>
              <input name="role" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Phone</span>
              <input name="phone" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Email</span>
              <input name="email" type="email" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Website URL</span>
              <input name="websiteUrl" type="url" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Category</span>
              <input name="category" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Notes</span>
              <textarea name="notes" rows={3} className={inputClass} />
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="isCrew"
                type="checkbox"
                value="true"
                defaultChecked={isCrew}
                className="mt-1 h-5 w-5"
              />
              <span className="text-base font-bold text-white">
                Add to Weekend Crew List
              </span>
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              {isCrew ? 'Add to Weekend Crew List' : 'Save Contact'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}