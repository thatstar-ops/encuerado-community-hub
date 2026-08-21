'use server'

import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import { requireNonCheckInAdmin } from './auth'

function redirectWithNotice(status: 'success' | 'blocked', message: string): never {
  const params = new URLSearchParams({ actionStatus: status, actionMessage: message })
  redirect(`/admin/volunteer-roles?${params.toString()}`)
}

export async function createVolunteerRole(formData: FormData) {
  await requireNonCheckInAdmin()

  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()

  if (!title || !description) {
    redirectWithNotice('blocked', 'Title and job description are required.')
  }

  await prisma.volunteerRole.create({
    data: { title, description },
  })

  redirectWithNotice('success', `Role "${title}" created.`)
}

export async function updateVolunteerRole(formData: FormData) {
  await requireNonCheckInAdmin()

  const id = String(formData.get('id') || '').trim()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()

  if (!id) redirectWithNotice('blocked', 'Role not found.')
  if (!title || !description) {
    redirectWithNotice('blocked', 'Title and job description are required.')
  }

  await prisma.volunteerRole.update({
    where: { id },
    data: { title, description },
  })

  redirectWithNotice('success', `Role "${title}" updated.`)
}

export async function archiveVolunteerRole(formData: FormData) {
  await requireNonCheckInAdmin()

  const id = String(formData.get('id') || '').trim()
  if (!id) redirectWithNotice('blocked', 'Role not found.')

  // Archiving only hides the role from the "pick a role" dropdown on shifts -
  // shifts that already reference it keep showing its title/description
  // (see roleId onDelete: SetNull only applies to a hard delete, which this
  // app never does for roles; archive is the safe default).
  await prisma.volunteerRole.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice('success', 'Role archived.')
}

export async function reactivateVolunteerRole(formData: FormData) {
  await requireNonCheckInAdmin()

  const id = String(formData.get('id') || '').trim()
  if (!id) redirectWithNotice('blocked', 'Role not found.')

  await prisma.volunteerRole.update({
    where: { id },
    data: { archivedAt: null },
  })

  redirectWithNotice('success', 'Role reactivated.')
}
