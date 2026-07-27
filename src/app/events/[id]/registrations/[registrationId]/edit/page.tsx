import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import { removeRegistration } from '@/lib/admin-record-actions'

async function updateRegistration(
  eventId: string,
  registrationId: string,
  formData: FormData
) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${eventId}/registrations/${registrationId}/edit`)

  const selectedStatus = String(formData.get('status') || 'Registered').trim()
  const checkedIn = formData.get('checkedIn') === 'on'
  const notes = String(formData.get('notes') || '').trim()

  const finalStatus = checkedIn ? 'Attended' : selectedStatus

  const registration = await prisma.eventRegistration.update({
    where: {
      id: registrationId,
    },
    data: {
      status: finalStatus,
      checkedIn,
      notes: notes || null,
    },
  })

  redirect(`/events/${registration.eventId}`)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function EditEventRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; registrationId: string }>
  searchParams?: Promise<{
    actionMessage?: string
    actionStatus?: string
  }>
}) {
  const { id, registrationId } = await params
  const queryParams = searchParams ? await searchParams : {}
  const admin = await getCurrentAdmin()
  if (!admin) redirect(`/admin/login?redirect=/events/${id}/registrations/${registrationId}/edit`)

  const registration = await prisma.eventRegistration.findUnique({
    where: {
      id: registrationId,
    },
    include: {
      member: true,
      event: true,
    },
  })

  if (!registration || registration.eventId !== id) {
    notFound()
  }

  const updateRegistrationWithId = updateRegistration.bind(
    null,
    id,
    registration.id
  )
  const returnTo = `/events/${id}/registrations/${registration.id}/edit`
  const removeRegistrationWithId = removeRegistration.bind(
    null,
    id,
    registration.id,
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
            href={`/events/${registration.eventId}`}
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to event
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Edit Attendee Registration
          </h1>

          <p className="mt-3 text-lg text-[#B7B7B7]">
            {registration.member.preferredName || registration.member.firstName}{' '}
            {registration.member.lastName} for{' '}
            <span className="font-bold text-[#B11218]">
              {registration.event.title}
            </span>
          </p>

          <form action={updateRegistrationWithId} className="mt-8 grid gap-5">
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Status</span>
              <select
                name="status"
                defaultValue={registration.status}
                className={inputClass}
              >
                <option value="Registered">Registered</option>
                <option value="Attended">Attended</option>
                <option value="Cancelled">Cancelled</option>
                <option value="No Show">No Show</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="checkedIn"
                type="checkbox"
                defaultChecked={registration.checkedIn}
                className="h-5 w-5"
              />
              <span className="text-base font-bold text-white">Checked in</span>
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Internal Notes</span>
              <textarea
                name="notes"
                rows={5}
                defaultValue={registration.notes || ''}
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Registration
            </button>
          </form>

          <details className="mt-6 rounded-xl border border-[#B11218] bg-[#151111] p-4">
            <summary className="cursor-pointer font-bold text-[#FFB3B6]">
              Remove Registration
            </summary>
            <p className="mt-3 text-sm text-[#B7B7B7]">
              This removes this attendee from this event only. It does not delete the attendee profile.
              {registration.checkedIn
                ? ' This registration is checked in, so removing it will also remove that check-in record.'
                : ''}
            </p>
            <form action={removeRegistrationWithId} className="mt-4 grid gap-3">
              <input
                name="confirmPhrase"
                placeholder="Type REMOVE"
                className="rounded-lg border border-[#3A1215] bg-black p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
              >
                Remove Registration
              </button>
            </form>
          </details>
        </div>
      </div>
    </main>
  )
}
