import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'

async function createMember(formData: FormData) {
  'use server'

  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/members/new')

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

  await prisma.member.create({
    data: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      email,
      phone: phone || null,
      city: city || null,
      state: state || null,
      country: 'USA',
      firstYearAttended: 2025,
      notes: notes || null,
    },
  })

  redirect('/members')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function NewMemberPage() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login?redirect=/members/new')

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/members"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to members
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Add Member</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Add a new Encuerado community member.
          </p>

          <form action={createMember} className="mt-8 grid gap-5">
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

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Phone</span>
              <input name="phone" className={inputClass} />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
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
              <span className="text-base font-bold text-white">Notes</span>
              <textarea name="notes" rows={4} className={inputClass} />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Member
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
