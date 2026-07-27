import Link from 'next/link'
import { RAFFLES } from '@/lib/raffles'

export default function RaffleChooserPage() {
  const raffleEntries = Object.entries(RAFFLES)

  return (
    <main className="min-h-screen bg-black p-6 text-white sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
        >
          ← Home
        </Link>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-2xl sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-[#B11218]">
            Encuerado Community Raffle
          </p>

          <h1 className="mt-3 text-4xl font-black uppercase tracking-wide text-white sm:text-5xl">
            Win a Weekend Pass
          </h1>

          <p className="mt-4 text-lg text-[#B7B7B7]">
            Choose the event you're at to enter that raffle.
          </p>

          <div className="mt-8 grid gap-4">
            {raffleEntries.map(([slug, label]) => (
              <Link
                key={slug}
                href={`/raffle/${slug}`}
                className="rounded-xl border border-[#2A0E10] bg-black p-6 text-center text-xl font-black uppercase tracking-wide text-white transition-colors hover:border-[#B11218] hover:bg-[#151111]"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
