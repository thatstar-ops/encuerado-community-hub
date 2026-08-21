import Link from 'next/link'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { getVolunteerBibleFilterOptions } from '@/lib/volunteer-bible-export'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function VolunteerBiblePage() {
  await requireNonCheckInAdmin()

  const { years, events } = await getVolunteerBibleFilterOptions()
  const defaultYear = years[0] || new Date().getFullYear()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link href="/admin" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Back to admin
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Print Volunteer Bible
          </h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Generates a printable Word document with every active shift, grouped by day, plus a
            role directory and an alphabetical volunteer roster (with phone numbers) at the back.
            Cancelled/archived shifts and volunteers are left out automatically.
          </p>

          <form action="/api/admin/volunteer-bible/export" method="get" className="mt-8 grid gap-6">
            <div className="grid gap-3 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <label className="flex items-center gap-3">
                <input type="radio" name="mode" value="year" defaultChecked className="h-5 w-5" />
                <span className="text-base font-bold text-white">By year — all events</span>
              </label>
              <select name="year" defaultValue={defaultYear} className={inputClass}>
                {years.length === 0 && <option value={defaultYear}>{defaultYear}</option>}
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <label className="flex items-center gap-3">
                <input type="radio" name="mode" value="event" className="h-5 w-5" />
                <span className="text-base font-bold text-white">By specific event</span>
              </label>
              <select name="eventId" defaultValue="" className={inputClass}>
                <option value="">Select an event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Download Volunteer Bible (.docx)
            </button>

            <p className="text-sm text-[#8F8F8F]">
              After opening in Word: select all (Ctrl/Cmd+A) and press F9 to fill in the table of
              contents page numbers before printing.
            </p>
          </form>
        </div>
      </div>
    </main>
  )
}
