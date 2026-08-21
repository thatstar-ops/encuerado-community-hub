import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  archiveVolunteerRole,
  createVolunteerRole,
  reactivateVolunteerRole,
  updateVolunteerRole,
} from '@/lib/volunteer-role-actions'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function VolunteerRolesPage({
  searchParams,
}: {
  searchParams?: Promise<{ actionMessage?: string; actionStatus?: string }>
}) {
  await requireNonCheckInAdmin()

  const queryParams = searchParams ? await searchParams : {}

  const roles = await prisma.volunteerRole.findMany({
    include: {
      _count: { select: { shifts: true } },
    },
    orderBy: [{ archivedAt: 'asc' }, { title: 'asc' }],
  })

  const activeRoles = roles.filter((role) => !role.archivedAt)
  const archivedRoles = roles.filter((role) => role.archivedAt)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <ActionNotice message={queryParams.actionMessage} status={queryParams.actionStatus} />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/shifts/calendar"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to shift calendar
          </Link>

          <Link
            href="/admin/volunteer-shift-reminders"
            className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
          >
            Edit shift reminder email →
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Volunteer Roles
          </h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Define a job description once, then assign it to any shift. Editing a role here
            updates every shift that uses it, and its description is automatically included in
            the shift reminder email.
          </p>

          <details className="mt-6 rounded-xl border border-[#3A1215] bg-[#151111] p-5">
            <summary className="cursor-pointer text-lg font-bold text-[#B11218]">
              + Add a new role
            </summary>
            <form action={createVolunteerRole} className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-white">Role title *</span>
                <input
                  name="title"
                  required
                  placeholder="Check-in Desk, Bar Back, Setup Crew..."
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-white">Job description *</span>
                <textarea
                  name="description"
                  rows={4}
                  required
                  placeholder="What this volunteer will do, where to go, what to bring..."
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Create Role
              </button>
            </form>
          </details>
        </div>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white">Active Roles ({activeRoles.length})</h2>

          {activeRoles.length === 0 ? (
            <p className="mt-4 text-[#B7B7B7]">No roles yet. Create one above.</p>
          ) : (
            <div className="mt-5 grid gap-4">
              {activeRoles.map((role) => (
                <details key={role.id} className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                    <span className="text-lg font-bold text-white">{role.title}</span>
                    <span className="text-sm text-[#8F8F8F]">
                      Used by {role._count.shifts} shift{role._count.shifts === 1 ? '' : 's'}
                    </span>
                  </summary>

                  <p className="mt-3 whitespace-pre-line text-[#B7B7B7]">{role.description}</p>

                  <form action={updateVolunteerRole} className="mt-5 grid gap-4 border-t border-[#2A0E10] pt-5">
                    <input type="hidden" name="id" value={role.id} />
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-white">Role title</span>
                      <input name="title" required defaultValue={role.title} className={inputClass} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-white">Job description</span>
                      <textarea
                        name="description"
                        rows={4}
                        required
                        defaultValue={role.description}
                        className={inputClass}
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>

                  <form action={archiveVolunteerRole} className="mt-3">
                    <input type="hidden" name="id" value={role.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                    >
                      Archive Role
                    </button>
                  </form>
                </details>
              ))}
            </div>
          )}
        </div>

        {archivedRoles.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white">
              Archived Roles ({archivedRoles.length})
            </h2>
            <p className="mt-2 text-sm text-[#8F8F8F]">
              Hidden from the "pick a role" list on shifts. Shifts already using an archived role
              keep showing its title and description.
            </p>

            <div className="mt-5 grid gap-4">
              {archivedRoles.map((role) => (
                <div key={role.id} className="rounded-xl border border-[#3A1215] bg-[#151111] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-lg font-bold text-white">{role.title}</span>
                    <span className="text-sm text-[#8F8F8F]">
                      Used by {role._count.shifts} shift{role._count.shifts === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-[#B7B7B7]">{role.description}</p>
                  <form action={reactivateVolunteerRole} className="mt-4">
                    <input type="hidden" name="id" value={role.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-green-400 px-4 py-2 text-sm font-bold text-green-300 hover:bg-green-400 hover:text-white"
                    >
                      Reactivate Role
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
