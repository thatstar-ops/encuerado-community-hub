import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  archiveMember,
  permanentlyDeleteMember,
  restoreMember,
} from '@/lib/admin-record-actions'

async function updateMember(memberId: string, formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/members/${memberId}/edit`)

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const preferredName = String(formData.get('preferredName') || '').trim()
  const email = String(formData.get('email') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  const city = String(formData.get('city') || '').trim()
  const state = String(formData.get('state') || '').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!firstName || !lastName || !email) {
    throw new Error('First name, last name, and email are required.')
  }

  await prisma.member.update({
    where: { id: memberId },
    data: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      email,
      phone: phone || null,
      city: city || null,
      state: state || null,
      notes: notes || null,
    },
  })

  redirect('/members')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/members/${id}/edit`)

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      volunteerProfile: true,
      _count: {
        select: {
          registrations: true,
          volunteerAssignments: true,
          participationRecords: true,
          emailLogs: true,
        },
      },
    },
  })

  if (!member) {
    notFound()
  }

  const updateMemberWithId = updateMember.bind(null, member.id)
  const returnTo = `/members/${member.id}/edit`
  const archiveMemberWithId = archiveMember.bind(null, member.id, returnTo)
  const restoreMemberWithId = restoreMember.bind(null, member.id, returnTo)
  const permanentlyDeleteMemberWithId = permanentlyDeleteMember.bind(
    null,
    member.id,
    returnTo
  )

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <ActionNotice
          message={queryParams.actionMessage}
          status={queryParams.actionStatus}
        />

        <div className="mb-6">
          <Link
            href="/members"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to members
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Edit Member</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Update this Encuerado community member’s information.
          </p>

          <form action={updateMemberWithId} className="mt-8 grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">First name *</span>
                <input
                  name="firstName"
                  required
                  defaultValue={member.firstName}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Last name *</span>
                <input
                  name="lastName"
                  required
                  defaultValue={member.lastName}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Preferred name</span>
              <input
                name="preferredName"
                defaultValue={member.preferredName || ''}
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Email *</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={member.email}
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Phone</span>
              <input
                name="phone"
                defaultValue={member.phone || ''}
                className={inputClass}
              />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">City</span>
                <input
                  name="city"
                  defaultValue={member.city || ''}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">State</span>
                <input
                  name="state"
                  defaultValue={member.state || ''}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Notes</span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={member.notes || ''}
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Changes
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h2 className="text-3xl font-bold text-white">Attendee Controls</h2>
          <p className="mt-3 text-[#B7B7B7]">
            Archive this attendee to hide them from active lists while preserving history.
          </p>

          <div className="mt-5 grid gap-4">
            {member.archivedAt ? (
              <details className="rounded-xl border border-[#B11218] bg-[#151111] p-4">
                <summary className="cursor-pointer font-bold text-[#B11218]">
                  Restore Attendee
                </summary>
                <p className="mt-3 text-sm text-[#B7B7B7]">
                  This returns the attendee to active lists.
                </p>
                <form action={restoreMemberWithId} className="mt-4">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
                  >
                    Restore Attendee
                  </button>
                </form>
              </details>
            ) : (
              <details className="rounded-xl border border-[#3A1215] bg-[#151111] p-4">
                <summary className="cursor-pointer font-bold text-[#B11218]">
                  Archive Attendee
                </summary>
                <p className="mt-3 text-sm text-[#B7B7B7]">
                  This removes the attendee from normal attendee lists but keeps registrations and participation history.
                </p>
                <form action={archiveMemberWithId} className="mt-4">
                  <button
                    type="submit"
                    className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
                  >
                    Archive Attendee
                  </button>
                </form>
              </details>
            )}

            <details className="rounded-xl border border-[#B11218] bg-[#151111] p-4">
              <summary className="cursor-pointer font-bold text-[#FFB3B6]">
                Permanently Delete Attendee
              </summary>
              <p className="mt-3 text-sm text-[#B7B7B7]">
                Only works when there are no registrations, volunteer assignments, participation records, email logs, or volunteer profile. Type DELETE to confirm.
              </p>
              <form action={permanentlyDeleteMemberWithId} className="mt-4 grid gap-3">
                <input
                  name="confirmPhrase"
                  placeholder="Type DELETE"
                  className="rounded-lg border border-[#3A1215] bg-black p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                >
                  Permanently Delete Attendee
                </button>
              </form>
            </details>

            <div className="text-sm text-[#8F8F8F]">
              Related records: {member._count.registrations} registrations,{' '}
              {member._count.volunteerAssignments} volunteer assignments,{' '}
              {member._count.participationRecords} participation records,{' '}
              {member._count.emailLogs} email logs
              {member.volunteerProfile ? ', volunteer profile' : ''}.
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
