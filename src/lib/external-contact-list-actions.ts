'use server'

import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import { requireSuperAdmin } from './auth'

export async function deleteExternalContactList(formData: FormData) {
  await requireSuperAdmin()

  const id = String(formData.get('id') || '').trim()
  const confirmPhrase = String(formData.get('confirmPhrase') || '').trim()

  if (!id) throw new Error('List not found.')
  if (confirmPhrase !== 'DELETE') {
    throw new Error('Type DELETE to confirm.')
  }

  // Deleting the list cascades ExternalContactListMember rows only (the
  // list-membership links). The underlying Member records are never
  // touched here - someone on this list who is also a real attendee,
  // volunteer, etc. keeps their Member record untouched.
  await prisma.externalContactList.delete({ where: { id } })

  redirect('/admin/admin-users/external-contact-lists')
}
