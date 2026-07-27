'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { requireSuperAdmin } from '@/lib/auth'

const ALLOWED_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CHECK_IN'] as const

function validateRole(role: string) {
  if (!ALLOWED_ROLES.includes(role as any)) {
    throw new Error(`Role must be one of: ${ALLOWED_ROLES.join(', ')}.`)
  }
}

export async function createAdminUser(formData: FormData) {
  await requireSuperAdmin()

  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const role = String(formData.get('role') || '').trim()
  const password = String(formData.get('password') || '')

  if (!name || !email || !role || !password) {
    throw new Error('Name, email, role, and password are required.')
  }

  validateRole(role)

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.create({
    data: {
      name,
      email,
      role: role as any,
      passwordHash,
    },
  })

  revalidatePath('/admin/admin-users')
}

export async function updateAdminUser(formData: FormData) {
  await requireSuperAdmin()

  const id = String(formData.get('id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const role = String(formData.get('role') || '').trim()

  if (!id || !name || !email || !role) {
    throw new Error('ID, name, email, and role are required.')
  }

  validateRole(role)

  await prisma.adminUser.update({
    where: { id },
    data: {
      name,
      email,
      role: role as any,
    },
  })

  revalidatePath('/admin/admin-users')
}

export async function deactivateAdminUser(adminUserId: string) {
  await requireSuperAdmin()

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { isActive: false },
  })
  revalidatePath('/admin/admin-users')
}

export async function reactivateAdminUser(adminUserId: string) {
  await requireSuperAdmin()

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { isActive: true },
  })
  revalidatePath('/admin/admin-users')
}

export async function resetAdminPassword(formData: FormData) {
  await requireSuperAdmin()

  const id = String(formData.get('id') || '').trim()
  const newPassword = String(formData.get('newPassword') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (!id) throw new Error('Admin ID is required.')
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.')
  if (newPassword !== confirmPassword) throw new Error('Passwords do not match.')

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash },
  })

  revalidatePath('/admin/admin-users')
}
