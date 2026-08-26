import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import {
  formatSizes,
  normalizeSize,
  parseSizes,
  seatsForPurchase,
  SHIRT_SIZES,
} from '@/lib/shirt-sizes'

// A volunteer earns a shirt at this many active shifts.
const MIN_SHIFTS = 3
const ACTIVE_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

async function saveSizes(formData: FormData) {
  'use server'

  await requireNonCheckInAdmin()

  let saved = 0

  for (const [key, rawValue] of formData.entries()) {
    const value = String(rawValue || '').trim()
    if (!value) continue

    if (key.startsWith('vol__')) {
      const size = normalizeSize(value)
      if (!size) continue
      await prisma.volunteerProfile.update({
        where: { id: key.slice('vol__'.length) },
        data: { shirtSize: size },
      })
      saved++
    } else if (key.startsWith('pass__')) {
      const sizes = parseSizes(value)
      if (!sizes.length) continue
      await prisma.ticketPurchase.update({
        where: { id: key.slice('pass__'.length) },
        data: { shirtSize: formatSizes(sizes) },
      })
      saved++
    } else if (key.startsWith('spon__')) {
      const sizes = parseSizes(value)
      if (!sizes.length) continue
      await prisma.sponsorFulfillment.update({
        where: { id: key.slice('spon__'.length) },
        data: { shirtSizes: sizes },
      })
      saved++
    }
  }

  redirect(`/admin/shirt-sizes?saved=${saved}`)
}

type Gap = {
  key: string
  who: string
  email: string
  memberId: string
  group: string
  detail: string
  current: string
  slots: number
}

export default async function ShirtSizeGapsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>
}) {
  await requireNonCheckInAdmin()
  const params = searchParams ? await searchParams : {}
  const savedCount = Number(params.saved)

  const gaps: Gap[] = []

  // ---- volunteers who earned a shirt but have no size ----
  const profiles = await prisma.volunteerProfile.findMany({
    select: {
      id: true,
      shirtSize: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          volunteerAssignments: { select: { status: true } },
        },
      },
    },
  })

  for (const profile of profiles) {
    const shifts = profile.member.volunteerAssignments.filter((a) =>
      ACTIVE_ASSIGNMENT_STATUSES.includes(a.status)
    ).length
    if (shifts < MIN_SHIFTS) continue
    if (normalizeSize(profile.shirtSize)) continue

    gaps.push({
      key: `vol__${profile.id}`,
      who: `${profile.member.firstName} ${profile.member.lastName}`,
      email: profile.member.email,
      memberId: profile.member.id,
      group: 'Volunteer',
      detail: `${shifts} shifts, no size on file`,
      current: '',
      slots: 1,
    })
  }

  // ---- passes owing more shirts than sizes given ----
  const passes = await prisma.ticketPurchase.findMany({
    where: { purchaseType: { in: ['Weekend Pass', 'VIP Pass'] } },
    select: {
      id: true,
      shirtSize: true,
      purchaseType: true,
      passCount: true,
      member: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  for (const pass of passes) {
    const seats = seatsForPurchase(pass.passCount)
    const known = parseSizes(pass.shirtSize)
    if (known.length >= seats) continue

    gaps.push({
      key: `pass__${pass.id}`,
      who: `${pass.member.firstName} ${pass.member.lastName}`,
      email: pass.member.email,
      memberId: pass.member.id,
      group: pass.purchaseType || 'Pass',
      detail: `${seats} people, ${known.length} size(s) given, ${seats - known.length} missing`,
      current: known.join(', '),
      slots: seats,
    })
  }

  // ---- sponsors owing more shirts than sizes given ----
  const sponsors = await prisma.sponsorFulfillment.findMany({
    select: {
      id: true,
      sponsorTier: true,
      shirtCount: true,
      shirtSizes: true,
      member: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  for (const sponsor of sponsors) {
    const known = parseSizes(sponsor.shirtSizes)
    if (known.length >= sponsor.shirtCount) continue

    gaps.push({
      key: `spon__${sponsor.id}`,
      who: `${sponsor.member.firstName} ${sponsor.member.lastName}`,
      email: sponsor.member.email,
      memberId: sponsor.member.id,
      group: `${sponsor.sponsorTier || 'Sponsor'} sponsor`,
      detail: `owed ${sponsor.shirtCount}, ${known.length} size(s) given, ${sponsor.shirtCount - known.length} missing`,
      current: known.join(', '),
      slots: sponsor.shirtCount,
    })
  }

  gaps.sort((a, b) => a.who.localeCompare(b.who))
  const shirtsMissing = gaps.reduce((sum, gap) => sum + (gap.slots - parseSizes(gap.current).length), 0)

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
          &larr; Dashboard
        </Link>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Missing Shirt Sizes
          </h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Everyone still owed a shirt with no size recorded. Type the size and save - several
            at a time is fine. Where someone is owed more than one shirt, list every size
            separated by commas, for example <span className="font-bold text-white">L, XL</span>.
          </p>

          {Number.isFinite(savedCount) && savedCount > 0 && (
            <div className="mt-5 rounded-xl border border-green-500 bg-[#151111] p-4 font-bold text-green-400">
              Saved {savedCount} record{savedCount === 1 ? '' : 's'}.
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">People to chase</div>
              <div className="mt-2 text-4xl font-black text-white">{gaps.length}</div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-black p-5">
              <div className="text-sm font-semibold text-[#8F8F8F]">Shirts without a size</div>
              <div className="mt-2 text-4xl font-black text-white">{shirtsMissing}</div>
            </div>
          </div>

          {gaps.length === 0 ? (
            <div className="mt-8 rounded-xl border border-green-500 bg-[#151111] p-6 text-lg font-bold text-green-400">
              Every shirt has a size. Nothing to chase.
            </div>
          ) : (
            <form action={saveSizes} className="mt-8 grid gap-4">
              <p className="text-sm text-[#8F8F8F]">
                Valid sizes: {SHIRT_SIZES.join(', ')}. Anything unrecognised is ignored rather
                than saved, so a typo cannot overwrite a good value with rubbish.
              </p>

              {gaps.map((gap) => (
                <div
                  key={gap.key}
                  className="grid gap-3 rounded-xl border border-[#2A0E10] bg-[#151111] p-5 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <Link
                      href={`/members/${gap.memberId}/edit`}
                      className="text-xl font-bold text-[#B11218] hover:text-[#D11A22] hover:underline"
                    >
                      {gap.who}
                    </Link>
                    <div className="mt-1 text-sm text-[#B7B7B7]">{gap.email}</div>
                    <div className="mt-1 text-sm text-[#8F8F8F]">
                      <span className="font-bold text-white">{gap.group}</span> - {gap.detail}
                    </div>
                  </div>
                  <input
                    name={gap.key}
                    defaultValue={gap.current}
                    placeholder={gap.slots > 1 ? `e.g. L, XL (${gap.slots} sizes)` : 'e.g. L'}
                    className={`${inputClass} md:w-64`}
                  />
                </div>
              ))}

              <button
                type="submit"
                className="justify-self-start rounded-lg bg-[#B11218] px-6 py-4 text-lg font-black uppercase tracking-wide text-white hover:bg-[#D11A22]"
              >
                Save Sizes
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
