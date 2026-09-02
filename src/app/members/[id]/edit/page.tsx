import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import {
  formatSizes,
  normalizeSize,
  parseSizes,
  passShirtSeats,
  SHIRT_SIZES,
} from '@/lib/shirt-sizes'
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

  // ---- Shirt sizes ----
  // Stored across three different tables. One record can owe more than one
  // shirt (a VIP pass seats 2, a sponsor package includes several), so those
  // are kept as a comma-separated list - see src/lib/shirt-sizes.ts.
  if (formData.has('volunteerShirtSize')) {
    const volunteerProfile = await prisma.volunteerProfile.findUnique({
      where: { memberId },
      select: { id: true },
    })
    if (volunteerProfile) {
      await prisma.volunteerProfile.update({
        where: { id: volunteerProfile.id },
        data: { shirtSize: normalizeSize(formData.get('volunteerShirtSize')) },
      })
    }
  }

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('passSizes__')) continue
    // Scoped by memberId as well as id so a tampered form field cannot reach
    // another attendee's purchase.
    await prisma.ticketPurchase.updateMany({
      where: { id: key.slice('passSizes__'.length), memberId },
      data: { shirtSize: formatSizes(parseSizes(value)) },
    })
  }

  if (formData.has('sponsorSizes')) {
    const fulfillments = await prisma.sponsorFulfillment.findMany({
      where: { memberId },
      select: { id: true },
    })
    for (const fulfillment of fulfillments) {
      await prisma.sponsorFulfillment.update({
        where: { id: fulfillment.id },
        data: { shirtSizes: parseSizes(formData.get('sponsorSizes')) },
      })
    }
  }

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
      ticketPurchases: {
        where: { purchaseType: { in: ['Weekend Pass', 'VIP Pass'] } },
        orderBy: { purchasedAt: 'asc' },
      },
      sponsorFulfillments: true,
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

            <div className="grid gap-4 rounded-xl border border-[#3A1215] bg-[#151111] p-5">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wide text-[#B11218]">
                  Shirt sizes
                </h2>
                <p className="mt-1 text-sm text-[#B7B7B7]">
                  Sizes are held separately for volunteering, passes and sponsorship. Where
                  someone is owed more than one shirt, list every size separated by commas -
                  for example <span className="font-bold text-white">L, XL</span>.
                </p>
              </div>

              {member.volunteerProfile && (
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Volunteer shirt</span>
                  <select
                    name="volunteerShirtSize"
                    defaultValue={member.volunteerProfile.shirtSize || ''}
                    className={inputClass}
                  >
                    <option value="">- not set -</option>
                    {SHIRT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {member.ticketPurchases.map((purchase) => {
                // Comped ($0) passes earn no shirt, so there is nothing to record.
                const seats = passShirtSeats(purchase)
                if (seats === 0) return null
                const known = parseSizes(purchase.shirtSize)
                const missing = seats - known.length
                return (
                  <label key={purchase.id} className="grid gap-2">
                    <span className="text-base font-bold text-white">
                      {purchase.purchaseType} - {seats} shirt{seats === 1 ? '' : 's'}
                      {missing > 0 && (
                        <span className="ml-2 rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-black">
                          {missing} missing
                        </span>
                      )}
                    </span>
                    <input
                      name={`passSizes__${purchase.id}`}
                      defaultValue={known.join(', ')}
                      placeholder={seats > 1 ? 'e.g. L, XL' : 'e.g. L'}
                      className={inputClass}
                    />
                  </label>
                )
              })}

              {member.sponsorFulfillments.map((fulfillment) => {
                const known = parseSizes(fulfillment.shirtSizes)
                const missing = fulfillment.shirtCount - known.length
                return (
                  <label key={fulfillment.id} className="grid gap-2">
                    <span className="text-base font-bold text-white">
                      {fulfillment.sponsorTier} sponsor - {fulfillment.shirtCount} shirt
                      {fulfillment.shirtCount === 1 ? '' : 's'}
                      {missing > 0 && (
                        <span className="ml-2 rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-black">
                          {missing} missing
                        </span>
                      )}
                    </span>
                    <input
                      name="sponsorSizes"
                      defaultValue={known.join(', ')}
                      placeholder="e.g. L, XL"
                      className={inputClass}
                    />
                  </label>
                )
              })}

              {!member.volunteerProfile &&
                member.ticketPurchases.length === 0 &&
                member.sponsorFulfillments.length === 0 && (
                  <p className="text-sm text-[#8F8F8F]">
                    No volunteer profile, weekend/VIP pass or sponsorship on this attendee, so
                    there is no shirt to record a size for.
                  </p>
                )}
            </div>

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
