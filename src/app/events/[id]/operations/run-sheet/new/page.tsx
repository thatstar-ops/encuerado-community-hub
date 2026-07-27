import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createRunSheetItem } from '@/lib/operations-actions'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewRunSheetItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/admin/operations')

  const { id } = await params
  const event = await prisma.event.findUnique({ where: { id } })
  if (!event) redirect('/admin/operations?actionStatus=blocked&actionMessage=Event+not+found')

  const createItem = createRunSheetItem.bind(null, event.id, `/events/${event.id}/operations`)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href={`/events/${event.id}/operations`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to Event Operations
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-3xl font-bold text-white">Add Run Sheet Item</h1>
          <p className="mt-2 text-[#B7B7B7]">Add a new item to the run sheet.</p>

          <form action={createItem} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="font-bold">Title *</span>
              <input name="title" required className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Time</span>
              <input name="time" type="datetime-local" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Owner</span>
              <input name="owner" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Location</span>
              <input name="location" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Sort Order</span>
              <input name="sortOrder" type="number" defaultValue="0" className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Status</span>
              <select name="status" defaultValue="NOT_STARTED" className={inputClass}>
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Notes</span>
              <textarea name="notes" rows={3} className={inputClass} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              Save Item
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}