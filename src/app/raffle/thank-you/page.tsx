import Link from 'next/link'
import { isValidRaffleId, raffleLabel } from '@/lib/raffles'

export default async function RaffleThankYouPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; raffle?: string }>
}) {
  const params = await searchParams
  const alreadyEntered = params?.status === 'already-entered'
  const raffleId = params?.raffle || ''
  const eventName = isValidRaffleId(raffleId) ? raffleLabel(raffleId) : null

  return (
    <main className="min-h-screen bg-black p-6 text-white sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-[#B11218]">
            Encuerado Community Raffle
          </p>

          <h1 className="mt-4 text-4xl font-black uppercase tracking-wide">
            {alreadyEntered
              ? 'You Are Already Entered'
              : 'Your Entry Is In'}
          </h1>

          <p className="mt-4 text-lg text-[#B7B7B7]">
            {alreadyEntered
              ? `We already have one ${eventName ? eventName + ' raffle' : 'raffle'} entry connected to your contact information. One entry per person per raffle keeps the drawing fair.`
              : `Thanks for entering${eventName ? ' the ' + eventName + ' raffle' : ''} and being part of the Encuerado community. We will contact the winner by email or phone.`}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/events"
              className="rounded-lg bg-[#B11218] px-6 py-3 font-bold text-white hover:bg-[#D11A22]"
            >
              Browse Events
            </Link>

            <Link
              href="/"
              className="rounded-lg border border-[#3A1215] px-6 py-3 font-bold text-[#B7B7B7] hover:bg-[#151111]"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
