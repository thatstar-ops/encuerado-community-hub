import Link from 'next/link'

export default function VolunteerSignupThankYouPage() {
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Thank You</h1>
          <p className="mt-4 text-lg text-[#B7B7B7]">
            Your volunteer signup has been received. An Encuerado admin will review
            your information and follow up.
          </p>

          <div className="mt-8">
            <Link
              href="/"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}