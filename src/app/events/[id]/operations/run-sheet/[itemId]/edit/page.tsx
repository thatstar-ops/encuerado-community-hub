import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateRunSheetItem } from '@/lib/operations-actions'

function toDateTimeLocalValue(date: Date | null) {
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditRunSheetItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/admin/operations')
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const { id: eventId, itemId } = await params
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) redirect('/admin/operations?actionStatus=blocked&actionMessage=Event+not+found')

  const item = await prisma.eventRunSheetItem.findUnique({ where: { id: itemId } })
  if (!item || item.eventId !== eventId) notFound()

  const updateItem = updateRunSheetItem.bind(null, eventId, itemId, `/events/${eventId}/operations`)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href={`/events/${eventId}/operations`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to Event Operations
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8">
          <h1 className="text-3xl font-bold text-white">Edit Run Sheet Item</h1>
          <p className="mt-2 text-[#B7B7B7]">Update run sheet details.</p>

          <form action={updateItem} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="font-bold">Title *</span>
              <input name="title" required defaultValue={item.title || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Time</span>
              <input name="time" type="datetime-local" defaultValue={toDateTimeLocalValue(item.time)} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Owner</span>
              <input name="owner" defaultValue={item.owner || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Location</span>
              <input name="location" defaultValue={item.location || ''} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Sort Order</span>
              <input name="sortOrder" type="number" defaultValue={item.sortOrder} className={inputClass} />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Status</span>
              <select name="status" defaultValue={item.status} className={inputClass}>
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Notes</span>
              <textarea name="notes" rows={3} defaultValue={item.notes || ''} className={inputClass} />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              Update Item
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}