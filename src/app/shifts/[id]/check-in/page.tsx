import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'

async function saveVolunteerStatus(shiftId: string, assignmentId: string, formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/check-in`)
  const selectedStatus = String(formData.get('status') || 'Assigned').trim()
  const checkedIn = formData.get('checkedIn') === 'on'
  const shirtGiven = formData.get('shirtGiven') === 'on'
  const finalStatus = checkedIn ? 'Attended' : selectedStatus
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: { status: finalStatus, checkedIn, shirtGiven },
  })
  redirect(`/shifts/${shiftId}/check-in`)
}

async function quickCheckInVolunteer(shiftId: string, assignmentId: string) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${shiftId}/check-in`)
  await prisma.volunteerAssignment.update({
    where: { id: assignmentId },
    data: { status: 'Attended', checkedIn: true },
  })
  redirect(`/shifts/${shiftId}/check-in`)
}

const inputClass = 'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function ShiftCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ actionMessage?: string; actionStatus?: string }>
}) {
  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/shifts/${id}/check-in`)

  const shift = await prisma.volunteerShift.findUnique({
    where: { id },
    include: {
      event: true,
      assignments: {
        include: { member: { include: { volunteerProfile: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!shift) notFound()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <ActionNotice message={queryParams.actionMessage} status={queryParams.actionStatus} />
        <div className="mb-6">
          <Link href="/shifts/calendar" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Back to calendar
          </Link>
        </div>
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteer Check‑in: {shift.title}</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">{shift.event.title} · {shift.location || 'No location'}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Assigned</div>
              <div className="mt-2 text-3xl font-bold text-white">{shift.assignments.length}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Checked In</div>
              <div className="mt-2 text-3xl font-bold text-white">{shift.assignments.filter((a) => a.checkedIn).length}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Shirt Given</div>
              <div className="mt-2 text-3xl font-bold text-white">{shift.assignments.filter((a) => a.shirtGiven).length}</div>
            </div>
          </div>
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-white">Assigned Volunteers</h2>
            {shift.assignments.length === 0 ? (
              <p className="mt-4 rounded-xl border border-[#2A0E10] bg-[#151111] p-5 text-[#B7B7B7]">No volunteers assigned yet.</p>
            ) : (
              <div className="mt-5 grid gap-4">
                {shift.assignments.map((assignment) => {
                  const saveWithIds = saveVolunteerStatus.bind(null, shift.id, assignment.id)
                  const quickCheckIn = quickCheckInVolunteer.bind(null, shift.id, assignment.id)
                  const shirtSize = assignment.member.volunteerProfile?.shirtSize || '—'
                  return (
                    <div key={assignment.id} className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-bold text-[#B11218]">
                            {assignment.member.preferredName || assignment.member.firstName} {assignment.member.lastName}
                          </div>
                          <div className="mt-2 text-sm font-bold text-white">
                            Status: {assignment.status} · Checked In: {assignment.checkedIn ? 'Yes' : 'No'}
                          </div>
                          <div className="mt-1 text-sm text-[#B7B7B7]">Shirt Size: {shirtSize}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <form action={quickCheckIn}>
                            <button type="submit" className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]">
                              Mark Checked In
                            </button>
                          </form>
                        </div>
                      </div>
                      <form action={saveWithIds} className="mt-5 grid gap-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold text-white">Status</span>
                            <select name="status" defaultValue={assignment.status} className={inputClass}>
                              <option value="Assigned">Assigned</option>
                              <option value="Attended">Attended</option>
                              <option value="Cancelled">Cancelled</option>
                              <option value="No Show">No Show</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4">
                            <input name="checkedIn" type="checkbox" defaultChecked={assignment.checkedIn} className="h-5 w-5" />
                            <span className="text-sm font-bold text-white">Checked in</span>
                          </label>
                          <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#0B0B0B] p-4">
                            <input name="shirtGiven" type="checkbox" defaultChecked={assignment.shirtGiven || false} className="h-5 w-5" />
                            <span className="text-sm font-bold text-white">Shirt Given</span>
                          </label>
                        </div>
                        <button type="submit" className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white">
                          Save Volunteer Status
                        </button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
