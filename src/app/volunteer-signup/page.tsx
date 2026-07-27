import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

async function submitVolunteerSignup(formData: FormData) {
  'use server'

  const ip = await getClientIp()
  const { limited } = await checkRateLimit(`volunteer-signup:ip:${ip}`, {
    max: 5,
    windowMinutes: 10,
  })
  if (limited) {
    throw new Error('Too many submissions from this location. Please try again in a few minutes.')
  }

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const preferredName = String(formData.get('preferredName') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const phone = String(formData.get('phone') || '').trim()
  const city = String(formData.get('city') || '').trim()
  const state = String(formData.get('state') || '').trim()
  const preferredRoles = String(formData.get('preferredRoles') || '').trim()
  const availability = String(formData.get('availability') || '').trim()
  const experience = String(formData.get('experience') || '').trim()
  const emergencyName = String(formData.get('emergencyName') || '').trim()
  const emergencyPhone = String(formData.get('emergencyPhone') || '').trim()
  const consentToContact = formData.get('consentToContact') === 'on'

  // Shirt size
  const allowedShirtSizes = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL']
  const shirtSize = String(formData.get('shirtSize') || '').trim().toUpperCase()
  if (!allowedShirtSizes.includes(shirtSize)) {
    throw new Error('Please select a valid shirt size.')
  }

  if (!firstName || !lastName || !email) {
    throw new Error('First name, last name, and email are required.')
  }

  const member = await prisma.member.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      phone: phone || null,
      city: city || null,
      state: state || null,
      notes: 'Submitted public volunteer signup.',
      archivedAt: null,
    },
    create: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      email,
      phone: phone || null,
      city: city || null,
      state: state || null,
      country: 'USA',
      firstYearAttended: 2025,
      notes: 'Submitted public volunteer signup.',
    },
  })

  await prisma.volunteerProfile.upsert({
    where: { memberId: member.id },
    update: {
      status: 'Interested',
      preferredRoles: preferredRoles || null,
      availability: availability || null,
      experience: experience || null,
      emergencyName: emergencyName || null,
      emergencyPhone: emergencyPhone || null,
      consentToContact,
      shirtSize,
      archivedAt: null,
    },
    create: {
      memberId: member.id,
      status: 'Interested',
      preferredRoles: preferredRoles || null,
      availability: availability || null,
      experience: experience || null,
      emergencyName: emergencyName || null,
      emergencyPhone: emergencyPhone || null,
      consentToContact,
      shirtSize,
    },
  })

  redirect('/volunteer-signup/thank-you')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default function VolunteerSignupPage() {
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Volunteer Signup</h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            Let us know how you would like to help with Encuerado.
          </p>

          <form action={submitVolunteerSignup} className="mt-8 grid gap-5">
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

            {/* Shirt Size dropdown */}
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Shirt Size *</span>
              <select name="shirtSize" required className={inputClass}>
                <option value="">Select a size</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
                <option value="XXXL">XXXL</option>
              </select>
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
              <span className="text-base font-bold text-white">
                Preferred volunteer roles
              </span>
              <textarea
                name="preferredRoles"
                rows={3}
                placeholder="Check-in, setup, breakdown, hospitality, door, runner, workshop support..."
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Availability</span>
              <textarea
                name="availability"
                rows={3}
                placeholder="Friday evening, Saturday morning, Sunday afternoon..."
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">
                Relevant experience / notes
              </span>
              <textarea name="experience" rows={4} className={inputClass} />
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Emergency contact name
                </span>
                <input name="emergencyName" className={inputClass} />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Emergency contact phone
                </span>
                <input name="emergencyPhone" className={inputClass} />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-[#3A1215] bg-[#151111] p-4">
              <input
                name="consentToContact"
                type="checkbox"
                defaultChecked
                className="mt-1 h-5 w-5"
              />
              <span className="text-base font-bold text-white">
                I agree to be contacted about volunteering for Encuerado.
              </span>
            </label>

            <p className="text-sm text-[#8F8F8F]">
              By submitting, you agree to our{' '}
              <Link href="/privacy" className="font-bold text-[#B11218] hover:text-[#D11A22]">
                Privacy Policy
              </Link>
              .
            </p>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Submit Volunteer Signup
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}