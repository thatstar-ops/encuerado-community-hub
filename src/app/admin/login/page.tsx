import Link from 'next/link'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createAdminSession, getCurrentAdmin } from '@/lib/auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

function getSafeRedirect(value: FormDataEntryValue | string | undefined | null) {
  const redirectTo = String(value || '').trim()

  if (
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('//') &&
    !redirectTo.startsWith('/\\')
  ) {
    return redirectTo
  }

  return '/admin'
}

function loginErrorUrl(redirectTo: string, reason: '1' | 'locked' = '1') {
  const params = new URLSearchParams({ error: reason })

  if (redirectTo !== '/admin') {
    params.set('redirect', redirectTo)
  }

  return `/admin/login?${params.toString()}`
}

async function loginAdmin(formData: FormData) {
  'use server'

  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const redirectTo = getSafeRedirect(formData.get('redirect'))

  if (!email || !password) {
    redirect(loginErrorUrl(redirectTo))
  }

  // Rate limit by IP and by the email being attempted, whichever trips
  // first — stops both "one attacker hammering the form" and "one attacker
  // spraying attempts at a known admin email from many IPs" scenarios.
  const ip = await getClientIp()
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, { max: 10, windowMinutes: 15 }),
    checkRateLimit(`login:email:${email}`, { max: 5, windowMinutes: 15 }),
  ])

  if (ipLimit.limited || emailLimit.limited) {
    redirect(loginErrorUrl(redirectTo, 'locked'))
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email },
  })

  if (!admin) {
    redirect(loginErrorUrl(redirectTo))
  }

  const passwordIsValid = await bcrypt.compare(password, admin.passwordHash)

  if (!passwordIsValid) {
    redirect(loginErrorUrl(redirectTo))
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  })

  await createAdminSession(admin.id, admin.email)

  redirect(redirectTo)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = getSafeRedirect(params.redirect)
  const admin = await getCurrentAdmin()

  if (admin) {
    redirect(redirectTo)
  }

  const hasError = params.error === '1'
  const isLocked = params.error === 'locked'

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link
            href="/"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Admin Login</h1>

          <p className="mt-3 text-lg text-[#B7B7B7]">
            Sign in to manage Encuerado events.
          </p>

          {hasError && (
            <div className="mt-6 rounded-lg border border-red-500 bg-red-950 p-4 text-red-100">
              Invalid email or password.
            </div>
          )}

          {isLocked && (
            <div className="mt-6 rounded-lg border border-red-500 bg-red-950 p-4 text-red-100">
              Too many login attempts. Please wait a while before trying again.
            </div>
          )}

          <form action={loginAdmin} className="mt-8 grid gap-5">
            <input name="redirect" type="hidden" value={redirectTo} />
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Password</span>
              <input
                name="password"
                type="password"
                required
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Login
            </button>
          </form>

        </div>
      </div>
    </main>
  )
}
