import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCrewMember } from '@/lib/operations-actions'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'
const readOnlyClass =
  'rounded-lg border border-[#3A1215] bg-[#2A0E10] p-3 text-[#B7B7B7] cursor-not-allowed'

export default async function EditCrewMemberPage({
  params,
}: {
  params: Promise<{ id: string; crewId: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/admin/operations')

  const { id: eventId, crewId } = await params

  if (!crewId) {
    redirect('/admin/operations?actionStatus=blocked&actionMessage=Crew+ID+missing')
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) redirect('/admin/operations?actionStatus=blocked&actionMessage=Event+not+found')

  const crew = await prisma.eventCrewMember.findUnique({
    where: { id: crewId },
  })
  if (!crew || crew.eventId !== eventId) notFound()

  const returnTo = `/events/${eventId}/operations`
  const updateCrew = updateCrewMember.bind(null, eventId, crewId, returnTo)

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
          <h1 className="text-3xl font-bold text-white">Edit Crew Member</h1>
          <p className="mt-2 text-[#B7B7B7]">Update this person’s assignment details.</p>

          <form action={updateCrew} className="mt-8 grid gap-5">
            <div className="grid gap-2">
              <span className="font-bold text-white">Name</span>
              <input value={crew.name} disabled className={readOnlyClass} />
            </div>
            <div className="grid gap-2">
              <span className="font-bold text-white">Phone</span>
              <input value={crew.phone || '—'} disabled className={readOnlyClass} />
            </div>
            <div className="grid gap-2">
              <span className="font-bold text-white">Email</span>
              <input value={crew.email || '—'} disabled className={readOnlyClass} />
            </div>

            <label className="grid gap-2">
              <span className="font-bold text-white">Position *</span>
              <input name="position" required defaultValue={crew.position} className={inputClass} />
            </label>

            <label className="grid gap-2">
              <span className="font-bold text-white">Notes</span>
              <textarea name="notes" rows={3} defaultValue={crew.notes || ''} className={inputClass} />
            </label>

            <label className="grid gap-2">
              <span className="font-bold text-white">Sort Order</span>
              <input name="sortOrder" type="number" defaultValue={crew.sortOrder} className={inputClass} />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              Update Crew Member
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}