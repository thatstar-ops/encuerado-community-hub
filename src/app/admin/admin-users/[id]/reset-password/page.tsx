import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resetAdminPassword } from '@/lib/admin-user-actions'

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; success?: string }>
}) {
  await requireSuperAdmin()

  const { id } = await params
  const queryParams = searchParams ? await searchParams : {}

  const admin = await prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  })

  if (!admin) notFound()

  const inputClass =
    'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-md">
        <Link
          href="/admin/admin-users"
          className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
        >
          ← Back to Admin Users
        </Link>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-white">Reset Password</h1>

          <div className="mt-4 rounded-lg border border-[#2A0E10] bg-[#151111] p-4">
            <p className="font-bold text-white">{admin.name}</p>
            <p className="text-[#B7B7B7]">{admin.email}</p>
            <p className="mt-1 text-sm text-[#8F8F8F]">
              Role: {admin.role} · {admin.isActive ? 'Active' : 'Inactive'}
            </p>
          </div>

          {queryParams.error && (
            <div className="mt-4 rounded-lg border border-red-500 bg-red-950 p-4 text-red-100">
              {queryParams.error}
            </div>
          )}

          {queryParams.success && (
            <div className="mt-4 rounded-lg border border-green-500 bg-green-950 p-4 text-green-100">
              Password has been reset successfully.
            </div>
          )}

          <form
            action={async (formData: FormData) => {
              'use server'

              try {
                formData.append('id', id)
                await resetAdminPassword(formData)
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : 'Failed to reset password.'
                redirect(
                  `/admin/admin-users/${id}/reset-password?error=${encodeURIComponent(message)}`
                )
              }

              redirect(`/admin/admin-users/${id}/reset-password?success=1`)
            }}
            className="mt-8 grid gap-5"
          >
            <label className="grid gap-2">
              <span className="text-base font-bold text-white">New Password</span>
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Confirm Password</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="Re-enter new password"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Reset Password
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
