import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  deleteRunSheetItem,
  deleteStaffTask,
  deleteCrewMember,
} from '@/lib/operations-actions'

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

function getNoticeParams(searchParams: {
  actionStatus?: string
  actionMessage?: string
}) {
  const status = searchParams.actionStatus || null
  const message = searchParams.actionMessage || null
  return { status, message }
}

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function EventOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ actionStatus?: string; actionMessage?: string }>
}) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/admin/operations')
  // CHECK_IN accounts are door staff: bounce them back to their own
  // landing screen rather than the full admin tooling.
  if (admin.role === 'CHECK_IN') redirect('/admin')

  const { id } = await params
  const search = await searchParams
  const { status: noticeStatus, message: noticeMessage } = getNoticeParams(search)

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      archivedAt: true,
      cancelledAt: true,
    },
  })
  if (!event) notFound()

  const runSheetItems = await prisma.eventRunSheetItem.findMany({
    where: { eventId: id },
    orderBy: [{ sortOrder: 'asc' }, { time: 'asc' }],
  })

  const staffTasks = await prisma.eventStaffTask.findMany({
    where: { eventId: id },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
  })

  const crewMembers = await prisma.eventCrewMember.findMany({
    where: { eventId: id },
    orderBy: [{ sortOrder: 'asc' }, { position: 'asc' }],
  })

  const isArchived = !!event.archivedAt
  const isCancelled = !!event.cancelledAt
  const returnTo = `/events/${id}/operations`

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-wide text-white">
              {event.title}
              {isArchived && (
                <span className="ml-3 text-sm font-medium text-red-400">Archived</span>
              )}
              {isCancelled && (
                <span className="ml-3 text-sm font-medium text-red-400">Cancelled</span>
              )}
            </h1>
            <p className="mt-2 text-lg text-[#B7B7B7]">Event Operations</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/events/${id}`}
              className="rounded-lg border border-[#3A1215] px-4 py-2 text-sm font-medium text-[#B7B7B7] hover:bg-[#151111]"
            >
              Back to Event
            </Link>
            <Link
              href="/admin/operations"
              className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Global Operations
            </Link>
          </div>
        </div>

        {noticeStatus && noticeMessage && (
          <div
            className={`mt-4 rounded-lg p-4 ${
              noticeStatus === 'success'
                ? 'border border-green-500 bg-green-900 text-green-100'
                : 'border border-red-500 bg-red-900 text-red-100'
            }`}
          >
            {noticeMessage}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {/* Event Day Rundown */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Event Day Rundown</h2>
              <Link
                href={`/events/${id}/operations/run-sheet/new`}
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Item
              </Link>
            </div>
            {runSheetItems.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No rundown items yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {runSheetItems.map((item) => {
                  const deleteItem = deleteRunSheetItem.bind(
                    null,
                    id,
                    item.id,
                    returnTo
                  )
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#2A0E10] bg-[#151111] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/events/${id}/operations/run-sheet/${item.id}/edit`}
                            className="text-lg font-bold text-[#B11218] hover:underline"
                          >
                            {item.title}
                          </Link>
                          {item.time && (
                            <span className="ml-2 text-sm text-[#8F8F8F]">
                              {formatDate(item.time)}
                            </span>
                          )}
                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            {item.owner && <span>Owner: {item.owner} · </span>}
                            {item.location && <span>{item.location}</span>}
                          </div>
                          <div className="mt-1 text-xs font-medium">
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                item.status === 'DONE'
                                  ? 'bg-green-800 text-green-200'
                                  : item.status === 'IN_PROGRESS'
                                  ? 'bg-yellow-800 text-[#D11A22]'
                                  : 'bg-[#2A0E10] text-[#B7B7B7]'
                              }`}
                            >
                              {item.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {item.notes && (
                            <div className="mt-2 text-sm text-[#8F8F8F]">{item.notes}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/events/${id}/operations/run-sheet/${item.id}/edit`}
                            className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                          >
                            Edit
                          </Link>
                          <form action={deleteItem}>
                            <input type="hidden" name="confirmPhrase" value="DELETE" />
                            <button
                              type="submit"
                              className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Staff Tasks */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Staff Tasks</h2>
              <Link
                href={`/events/${id}/operations/staff-tasks/new`}
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Task
              </Link>
            </div>
            {staffTasks.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No staff tasks yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {staffTasks.map((task) => {
                  const deleteTask = deleteStaffTask.bind(
                    null,
                    id,
                    task.id,
                    returnTo
                  )
                  return (
                    <div
                      key={task.id}
                      className="rounded-xl border border-[#2A0E10] bg-[#151111] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/events/${id}/operations/staff-tasks/${task.id}/edit`}
                            className="text-lg font-bold text-[#B11218] hover:underline"
                          >
                            {task.title}
                          </Link>
                          {task.assignedTo && (
                            <span className="ml-2 text-sm text-[#8F8F8F]">
                              → {task.assignedTo}
                            </span>
                          )}
                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            {task.dueAt && <span>Due: {formatDate(task.dueAt)}</span>}
                            <span className="ml-3 text-xs font-medium">
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  task.priority === 'URGENT'
                                    ? 'bg-red-800 text-red-200'
                                    : task.priority === 'HIGH'
                                    ? 'bg-orange-800 text-orange-200'
                                    : task.priority === 'MEDIUM'
                                    ? 'bg-yellow-800 text-[#D11A22]'
                                    : 'bg-[#2A0E10] text-[#B7B7B7]'
                                }`}
                              >
                                {task.priority}
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-medium">
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                task.status === 'DONE'
                                  ? 'bg-green-800 text-green-200'
                                  : task.status === 'IN_PROGRESS'
                                  ? 'bg-yellow-800 text-[#D11A22]'
                                  : task.status === 'BLOCKED'
                                  ? 'bg-red-800 text-red-200'
                                  : 'bg-[#2A0E10] text-[#B7B7B7]'
                              }`}
                            >
                              {task.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {task.notes && (
                            <div className="mt-2 text-sm text-[#8F8F8F]">{task.notes}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/events/${id}/operations/staff-tasks/${task.id}/edit`}
                            className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                          >
                            Edit
                          </Link>
                          <form action={deleteTask}>
                            <input type="hidden" name="confirmPhrase" value="DELETE" />
                            <button
                              type="submit"
                              className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Crew Roster */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Crew Roster</h2>
              <Link
                href={`/events/${id}/operations/crew/new`}
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Crew Member
              </Link>
            </div>
            {crewMembers.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No crew members added yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#2A0E10]">
                    <tr>
                      <th className="py-2 font-bold text-[#B7B7B7]">Position</th>
                      <th className="py-2 font-bold text-[#B7B7B7]">Name</th>
                      <th className="py-2 font-bold text-[#B7B7B7]">Phone</th>
                      <th className="py-2 font-bold text-[#B7B7B7]">Email</th>
                      <th className="py-2 font-bold text-[#B7B7B7]">Notes</th>
                      <th className="py-2 font-bold text-[#B7B7B7]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crewMembers.map((member) => {
                      const deleteCrew = deleteCrewMember.bind(
                        null,
                        id,
                        member.id,
                        returnTo
                      )
                      const phoneLink = phoneHref(member.phone)
                      return (
                        <tr key={member.id} className="border-b border-[#2A0E10]">
                          <td className="py-2 text-white">{member.position}</td>
                          <td className="py-2 text-white">{member.name}</td>
                          <td className="py-2 text-white">
                            {phoneLink ? (
                              <a href={phoneLink} className="text-[#B11218] hover:underline">
                                {member.phone}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 text-white">{member.email || '—'}</td>
                          <td className="py-2 text-white">{member.notes || '—'}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/events/${id}/operations/crew/${member.id}/edit`}
                                className="text-xs text-[#B11218] hover:underline"
                              >
                                Edit
                              </Link>
                              <form action={deleteCrew}>
                                <input type="hidden" name="confirmPhrase" value="DELETE" />
                                <button
                                  type="submit"
                                  className="text-xs text-[#FFB3B6] hover:underline"
                                >
                                  Remove
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}