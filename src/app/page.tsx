import Image from 'next/image'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Graphic */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/images/encuerado-latin-fetish-weekend.webp"
            alt="Encuerado Latin Fetish Weekend"
            width={1920}
            height={807}
            priority
            className="h-auto w-full max-w-4xl"
          />
        </div>

        <div className="flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <div className="max-w-2xl">
            <h1 className="text-5xl font-black uppercase tracking-wide text-white sm:text-6xl">
              Encuerado Community Hub
            </h1>
            <p className="mt-4 text-xl text-[#B7B7B7]">
              Welcome to the Encuerado Community Hub – your central place for events, volunteering, and community connection.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
              <Link
                href="/events"
                className="rounded-lg bg-[#B11218] px-6 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Browse Events
              </Link>
              <Link
                href="/volunteer-shifts"
                className="rounded-lg border border-[#B11218] px-6 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
              >
                Volunteer Signup
              </Link>
            </div>
          </div>
          <div className="flex-shrink-0">
            <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8">
              <div className="text-center">
                <p className="text-4xl font-bold text-[#B11218]">2025</p>
                <p className="mt-2 text-sm text-[#8F8F8F]">Established</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
