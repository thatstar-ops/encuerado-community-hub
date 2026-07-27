import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { createManualEntry } from '@/lib/manual-attendee-actions'
import ActionNotice from '@/components/admin/ActionNotice'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewSponsorOrAttendeePage({
  searchParams,
}: {
  searchParams?: Promise<{ actionStatus?: string; actionMessage?: string }>
}) {
  const admin = await requireSuperAdmin()
  void admin

  const params = searchParams ? await searchParams : {}

  const events = await prisma.event.findMany({
    where: {
      archivedAt: null,
      cancelledAt: null,
      status: { not: 'Cancelled' },
    },
    orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }],
    select: { id: true, title: true },
  })

  const currentYear = new Date().getFullYear()

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link href="/admin/admin-users" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
            ← Admin Users
          </Link>
        </div>

        <ActionNotice message={params.actionMessage} status={params.actionStatus} />

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Add Sponsor / Attendee (Manual)
          </h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Super-admin only. Creates or updates a member and grants them the same access a
            real TicketSpice order or sponsorship would — including event registrations that
            show up at check-in. Use this for sponsors who paid outside TicketSpice, comps, or
            any other manual entry.
          </p>

          <form action={createManualEntry} className="mt-8 grid gap-6">
            <fieldset className="grid gap-5 rounded-xl border border-[#2A0E10] p-5">
              <legend className="px-2 text-sm font-bold uppercase tracking-wide text-[#B11218]">
                Person
              </legend>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">First name *</span>
                  <input name="firstName" required className={inputClass} />
                </label>
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Last name *</span>
                  <input name="lastName" required className={inputClass} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Preferred name</span>
                <input name="preferredName" className={inputClass} />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Email *</span>
                <input name="email" type="email" required className={inputClass} />
              </label>

              <div className="grid gap-5 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Phone</span>
                  <input name="phone" className={inputClass} />
                </label>
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">City</span>
                  <input name="city" className={inputClass} />
                </label>
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">State</span>
                  <input name="state" className={inputClass} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Year *</span>
                <input
                  name="year"
                  type="number"
                  required
                  defaultValue={currentYear}
                  className={inputClass}
                />
              </label>
            </fieldset>

            <fieldset className="grid gap-5 rounded-xl border border-[#2A0E10] p-5">
              <legend className="px-2 text-sm font-bold uppercase tracking-wide text-[#B11218]">
                What are they getting?
              </legend>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Entry type *</span>
                <select name="entryType" required className={inputClass} defaultValue="sponsor">
                  <option value="sponsor">Sponsor (amount-based tier)</option>
                  <option value="weekend_pass">Weekend Pass (all weekend events)</option>
                  <option value="vip_pass">VIP Pass (all weekend events, priority check-in)</option>
                  <option value="individual_event">Individual event ticket</option>
                </select>
              </label>

              <div className="rounded-lg border border-[#3A1215] bg-[#151111] p-4 text-sm text-[#B7B7B7]">
                <p className="font-bold text-white">Sponsor tiers (by amount):</p>
                <ul className="mt-2 grid gap-1">
                  <li>$300–$499 → COMPADRE: 1 weekend package, 1 shirt, 1 pin</li>
                  <li>$500–$999 → PADRINO: 2 weekend packages, 2 shirts, 2 pins, half-page ad</li>
                  <li>$1000+ → EL MERO MERO: 2 VIP packages, 2 shirts, 2 pins, gift, full-page ad</li>
                  <li>Under $300 → flagged for manual tier review</li>
                </ul>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Sponsor amount (dollars) — only for Sponsor entry type
                </span>
                <input name="amountDollars" type="number" min="0" step="1" className={inputClass} />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    Sponsor display name — how they're publicly credited (blank = use their name)
                  </span>
                  <input name="displayName" className={inputClass} />
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
                  <input name="isAnonymous" type="checkbox" className="h-5 w-5" />
                  <span className="text-base font-bold text-white">Keep this sponsor anonymous</span>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Quantity — only for Weekend Pass / VIP Pass / Individual Event
                </span>
                <input name="quantity" type="number" min="1" step="1" defaultValue={1} className={inputClass} />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Event — only for Individual Event
                </span>
                <select name="eventId" className={inputClass} defaultValue="">
                  <option value="">Select an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
