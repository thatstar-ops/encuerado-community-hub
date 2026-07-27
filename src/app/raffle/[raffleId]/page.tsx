import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isValidRaffleId, raffleLabel, raffleListLabel } from '@/lib/raffles'

const RAFFLE_OPT_IN_LIST_LABEL = 'Raffle Email Opt-In 2026'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function appendNote(existing: string | null, note: string) {
  const current = String(existing || '').trim()
  if (!current) return note
  if (current.includes(note)) return current
  return current + '\n' + note
}

async function getOrCreateList(
  tx: Prisma.TransactionClient,
  label: string,
  description: string
) {
  const existing = await tx.externalContactList.findFirst({
    where: { label },
  })

  if (existing) return existing

  return tx.externalContactList.create({
    data: {
      label,
      description,
    },
  })
}

async function enterRaffle(raffleId: string, formData: FormData) {
  'use server'

  if (!isValidRaffleId(raffleId)) {
    throw new Error('Unknown raffle.')
  }

  const eventName = raffleLabel(raffleId)

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const phone = String(formData.get('phone') || '').trim()
  const marketingConsent = formData.get('marketingConsent') === 'on'
  const rulesConsent = formData.get('rulesConsent') === 'on'
  const website = String(formData.get('website') || '').trim()

  if (website) {
    redirect(`/raffle/thank-you?raffle=${raffleId}`)
  }

  if (!firstName || !lastName || !email || !phone) {
    throw new Error('First name, last name, email, and phone are required.')
  }

  if (!validEmail(email)) {
    throw new Error('Enter a valid email address.')
  }

  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length < 10) {
    throw new Error('Enter a valid phone number.')
  }

  if (!rulesConsent) {
    throw new Error('You must agree to the raffle rules to enter.')
  }

  const result = await prisma.$transaction(async (tx) => {
    const raffleList = await getOrCreateList(
      tx,
      raffleListLabel(raffleId),
      `Public raffle entrants collected at ${eventName} in 2026.`
    )

    const optInList = marketingConsent
      ? await getOrCreateList(
          tx,
          RAFFLE_OPT_IN_LIST_LABEL,
          'Raffle entrants who separately agreed to receive Encuerado promotional emails.'
        )
      : null

    let member = await tx.member.findUnique({
      where: { email },
    })

    if (!member) {
      const phoneMatches = (
        await tx.member.findMany({
          where: { phone: { not: null } },
        })
      ).filter(
        (candidate) => normalizePhone(candidate.phone || '') === normalizedPhone
      )

      if (phoneMatches.length === 1) {
        member = phoneMatches[0]
      }
    }

    const entryNote =
      'Entered ' +
      raffleListLabel(raffleId) +
      '. Marketing email consent: ' +
      (marketingConsent ? 'Yes' : 'No') +
      '.'

    if (member) {
      member = await tx.member.update({
        where: { id: member.id },
        data: {
          firstName: member.firstName || firstName,
          lastName: member.lastName || lastName,
          phone: member.phone || phone,
          archivedAt: null,
          notes: appendNote(member.notes, entryNote),
          ...(marketingConsent ? { promotionalEmailOptOut: false } : {}),
        },
      })
    } else {
      member = await tx.member.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          country: 'USA',
          firstYearAttended: 2026,
          promotionalEmailOptOut: !marketingConsent,
          notes: entryNote,
        },
      })
    }

    const existingEntry = await tx.externalContactListMember.findUnique({
      where: {
        externalContactListId_memberId: {
          externalContactListId: raffleList.id,
          memberId: member.id,
        },
      },
      select: { id: true },
    })

    if (existingEntry) {
      return { alreadyEntered: true }
    }

    await tx.externalContactListMember.create({
      data: {
        externalContactListId: raffleList.id,
        memberId: member.id,
        sourceLabel: 'Raffle - ' + eventName,
      },
    })

    if (optInList) {
      await tx.externalContactListMember.upsert({
        where: {
          externalContactListId_memberId: {
            externalContactListId: optInList.id,
            memberId: member.id,
          },
        },
        create: {
          externalContactListId: optInList.id,
          memberId: member.id,
          sourceLabel: 'Raffle email opt-in - ' + eventName,
        },
        update: {
          sourceLabel: 'Raffle email opt-in - ' + eventName,
        },
      })
    }

    return { alreadyEntered: false }
  })

  redirect(
    result.alreadyEntered
      ? `/raffle/thank-you?raffle=${raffleId}&status=already-entered`
      : `/raffle/thank-you?raffle=${raffleId}`
  )
}

export default async function RafflePage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params

  if (!isValidRaffleId(raffleId)) {
    notFound()
  }

  const eventName = raffleLabel(raffleId)
  const enterThisRaffle = enterRaffle.bind(null, raffleId)

  return (
    <main className="min-h-screen bg-black p-6 text-white sm:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
        >
          ← Home
        </Link>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-2xl sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-[#B11218]">
            {eventName} - Encuerado Community Raffle
          </p>

          <h1 className="mt-3 text-4xl font-black uppercase tracking-wide text-white sm:text-5xl">
            Win a Weekend Pass
          </h1>

          <p className="mt-4 text-lg text-[#B7B7B7]">
            Enter for a chance to win one Encuerado Weekend Pass.
          </p>

          <div className="mt-6 rounded-xl border border-[#B11218]/50 bg-[#B11218]/10 p-4 text-sm text-[#F3D7D8]">
            No purchase is necessary. One entry per person per raffle. The
            winner will be selected after entries close and contacted using
            the email or phone number provided. The winner must meet all
            event eligibility requirements.
          </div>

          <form action={enterThisRaffle} className="mt-8 grid gap-5">
            <div
              className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
              aria-hidden="true"
            >
              <label>
                Website
                <input
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-bold">First name *</span>
                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-bold">Last name *</span>
                <input
                  name="lastName"
                  required
                  autoComplete="family-name"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-bold">Email *</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-bold">Mobile number *</span>
                <input
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="marketingConsent"
                type="checkbox"
                className="mt-1 h-5 w-5"
              />
              <span>
                <strong className="text-white">
                  Send me Encuerado updates.
                </strong>
                <span className="mt-1 block text-sm text-[#B7B7B7]">
                  I agree to receive event announcements, community news,
                  and promotional emails from Encuerado. I can unsubscribe
                  at any time. This is optional and does not affect my
                  chance of winning.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="rulesConsent"
                type="checkbox"
                required
                className="mt-1 h-5 w-5"
              />
              <span className="text-sm text-[#B7B7B7]">
                I confirm the information is accurate and agree to the
                raffle rules above. I understand that submitting multiple
                entries does not increase my chance of winning. By entering,
                you agree to our{' '}
                <Link href="/privacy" className="font-bold text-[#B11218] hover:text-[#D11A22]">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-4 text-lg font-black uppercase tracking-wide text-white hover:bg-[#D11A22]"
            >
              Enter the Raffle
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
