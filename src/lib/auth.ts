import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import type { AdminUser } from '@prisma/client'

const SESSION_COOKIE_NAME = 'encuerado_admin_session'

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.')
  }
  return new TextEncoder().encode(secret)
}

export async function createAdminSession(adminUserId: string, email: string) {
  const token = await new SignJWT({ adminUserId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  try {
    const verified = await jwtVerify(token, getSecretKey())
    const adminUserId = String(verified.payload.adminUserId || '')
    if (!adminUserId) return null

    const admin = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
    })
    if (!admin || !admin.isActive) return null
    return admin
  } catch {
    return null
  }
}

export function isSuperAdmin(admin: AdminUser) {
  return admin.role === 'SUPER_ADMIN'
}

export function isCheckInAdmin(admin: AdminUser) {
  return admin.role === 'CHECK_IN'
}

export async function requireSuperAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin || !isSuperAdmin(admin)) {
    redirect('/admin?error=unauthorized')
  }
  return admin
}

export async function requireNonCheckInAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) {
    redirect('/admin/login')
  }
  if (isCheckInAdmin(admin)) {
    redirect('/admin?error=unauthorized')
  }
  return admin
}
