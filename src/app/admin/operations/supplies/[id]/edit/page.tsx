import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateOperationsSupply } from '@/lib/operations-actions'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditSupplyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin/operations')

  const { id } = await params
  const supply = await prisma.operationsSupply.findUnique({ where: { id } })
  if (!supply) notFound()

  // ✅ Bind returnTo to '/admin/operations'
  const updateSupply = updateOperationsSupply.bind(null, supply.id, '/admin/operations')

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
          <h1 className="text-3xl font-bold text-white">Edit Supply</h1>
          <p className="mt-2 text-[#B7B7B7]">Update supply details.</p>

          <form action={updateSupply} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="font-bold">Name *</span>
              <input name="name" required defaultValue={supply.name || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Quantity</span>
              <input name="quantity" defaultValue={supply.quantity || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Owner</span>
              <input name="owner" defaultValue={supply.owner || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Category</span>
              <input name="category" defaultValue={supply.category || ''} className={inputClass} />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input name="packed" type="checkbox" defaultChecked={supply.packed} className="h-5 w-5" />
              <span className="font-bold text-white">Packed</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input name="delivered" type="checkbox" defaultChecked={supply.delivered} className="h-5 w-5" />
              <span className="font-bold text-white">Delivered</span>
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Notes</span>
              <textarea name="notes" rows={3} defaultValue={supply.notes || ''} className={inputClass} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              Update Supply
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}