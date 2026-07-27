import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth'
import { findPossibleDuplicateGroups } from '@/lib/duplicate-members'
import ActionNotice from '@/components/admin/ActionNotice'
import MemberMergeForm from '@/components/admin/MemberMergeForm'

export default async function MergeMembersPage({
  searchParams,
}: {
  searchParams?: Promise<{ actionStatus?: string; actionMessage?: string }>
}) {
  await requireSuperAdmin()

  const params = searchParams ? await searchParams : {}
  const duplicateGroups = await findPossibleDuplicateGroups()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link href="/admin/admin-users" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Admin Users
          </Link>
        </div>

        <ActionNotice message={params.actionMessage} status={params.actionStatus} />

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Merge Duplicate Members</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Super-admin only. Pick two records that are the same person, choose which one
            survives, and everything else - registrations, tickets, sponsor records,
            volunteer history, participation records, email history - moves onto it. The
            other record is archived, not deleted.
          </p>

          <div className="mt-8">
            <MemberMergeForm duplicateGroups={duplicateGroups} />
          </div>
        </div>
      </div>
    </main>
  )
}
