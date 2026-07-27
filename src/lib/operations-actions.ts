'use server'

import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { OperationsStatus, TaskPriority, TaskStatus } from '@prisma/client'

type NoticeStatus = 'success' | 'blocked'

const operationStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const
const taskStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const
const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

function safeReturnTo(returnTo: string) {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/admin/operations'
  }
  return returnTo
}

function redirectWithNotice(
  returnTo: string,
  status: NoticeStatus,
  message: string
): never {
  const target = safeReturnTo(returnTo)
  const separator = target.includes('?') ? '&' : '?'
  redirect(
    `${target}${separator}actionStatus=${status}&actionMessage=${encodeURIComponent(
      message
    )}`
  )
}

async function requireAdmin(returnTo: string) {
  const admin = await getCurrentAdmin()
  if (!admin) {
    redirect(`/admin/login?redirect=${encodeURIComponent(safeReturnTo(returnTo))}`)
  }
}

async function requireEvent(eventId: string, returnTo: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  })
  if (!event) {
    redirectWithNotice(returnTo, 'blocked', 'Event could not be found.')
  }
}

function textField(
  formData: FormData,
  name: string,
  label: string,
  returnTo: string,
  options: { max: number; required?: boolean }
) {
  const value = String(formData.get(name) || '').trim()
  if (options.required && !value) {
    redirectWithNotice(returnTo, 'blocked', `${label} is required.`)
  }
  if (value.length > options.max) {
    redirectWithNotice(
      returnTo,
      'blocked',
      `${label} must be ${options.max} characters or fewer.`
    )
  }
  return value || null
}

function numberField(formData: FormData, name: string, returnTo: string) {
  const raw = String(formData.get(name) || '').trim()
  if (!raw) return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    redirectWithNotice(returnTo, 'blocked', 'Sort order must be a whole number.')
  }
  return value
}

function dateField(formData: FormData, name: string, label: string, returnTo: string) {
  const raw = String(formData.get(name) || '').trim()
  if (!raw) return null
  const value = new Date(raw)
  if (Number.isNaN(value.getTime())) {
    redirectWithNotice(returnTo, 'blocked', `${label} must be a valid date/time.`)
  }
  return value
}

function enumField<T extends readonly string[]>(
  formData: FormData,
  name: string,
  allowed: T,
  fallback: T[number],
  label: string,
  returnTo: string
) {
  const value = String(formData.get(name) || fallback).trim()
  if (!allowed.includes(value)) {
    redirectWithNotice(returnTo, 'blocked', `${label} is not valid.`)
  }
  return value as T[number]
}

function emailField(formData: FormData, name: string, returnTo: string) {
  const value = textField(formData, name, 'Email', returnTo, { max: 180 })
  if (!value) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    redirectWithNotice(returnTo, 'blocked', 'Email must be valid.')
  }
  return value.toLowerCase()
}

function urlField(formData: FormData, name: string, returnTo: string) {
  const value = textField(formData, name, 'Website URL', returnTo, { max: 500 })
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      redirectWithNotice(returnTo, 'blocked', 'Website URL must start with http or https.')
    }
    return url.toString()
  } catch {
    redirectWithNotice(returnTo, 'blocked', 'Website URL must be valid.')
  }
}

function confirmDelete(formData: FormData, returnTo: string) {
  const phrase = String(formData.get('confirmPhrase') || '').trim()
  if (phrase !== 'DELETE') {
    redirectWithNotice(returnTo, 'blocked', 'Type DELETE to confirm deletion.')
  }
}

async function requireRunSheetItem(
  eventId: string,
  itemId: string,
  returnTo: string
) {
  const item = await prisma.eventRunSheetItem.findUnique({
    where: { id: itemId },
    select: { eventId: true },
  })
  if (!item || item.eventId !== eventId) {
    redirectWithNotice(returnTo, 'blocked', 'Run sheet item could not be found.')
  }
}

async function requireStaffTask(eventId: string, taskId: string, returnTo: string) {
  const task = await prisma.eventStaffTask.findUnique({
    where: { id: taskId },
    select: { eventId: true },
  })
  if (!task || task.eventId !== eventId) {
    redirectWithNotice(returnTo, 'blocked', 'Staff task could not be found.')
  }
}

async function requireContact(contactId: string, returnTo: string) {
  const contact = await prisma.operationsContact.findUnique({
    where: { id: contactId },
    select: { id: true },
  })
  if (!contact) {
    redirectWithNotice(returnTo, 'blocked', 'Contact could not be found.')
  }
}

async function requireSupply(supplyId: string, returnTo: string) {
  const supply = await prisma.operationsSupply.findUnique({
    where: { id: supplyId },
    select: { id: true },
  })
  if (!supply) {
    redirectWithNotice(returnTo, 'blocked', 'Supply could not be found.')
  }
}

// ===== Run Sheet =====
export async function createRunSheetItem(
  eventId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireEvent(eventId, returnTo)

  await prisma.eventRunSheetItem.create({
    data: {
      eventId,
      sortOrder: numberField(formData, 'sortOrder', returnTo),
      time: dateField(formData, 'time', 'Time', returnTo),
      title: textField(formData, 'title', 'Title', returnTo, {
        max: 160,
        required: true,
      })!,
      owner: textField(formData, 'owner', 'Owner', returnTo, { max: 120 }),
      location: textField(formData, 'location', 'Location', returnTo, { max: 160 }),
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
      status: enumField(
        formData,
        'status',
        operationStatuses,
        'NOT_STARTED',
        'Status',
        returnTo
      ) as OperationsStatus,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Run sheet item added.')
}

export async function updateRunSheetItem(
  eventId: string,
  itemId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireRunSheetItem(eventId, itemId, returnTo)

  await prisma.eventRunSheetItem.update({
    where: { id: itemId },
    data: {
      sortOrder: numberField(formData, 'sortOrder', returnTo),
      time: dateField(formData, 'time', 'Time', returnTo),
      title: textField(formData, 'title', 'Title', returnTo, {
        max: 160,
        required: true,
      })!,
      owner: textField(formData, 'owner', 'Owner', returnTo, { max: 120 }),
      location: textField(formData, 'location', 'Location', returnTo, { max: 160 }),
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
      status: enumField(
        formData,
        'status',
        operationStatuses,
        'NOT_STARTED',
        'Status',
        returnTo
      ) as OperationsStatus,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Run sheet item updated.')
}

export async function deleteRunSheetItem(
  eventId: string,
  itemId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireRunSheetItem(eventId, itemId, returnTo)
  confirmDelete(formData, returnTo)

  await prisma.eventRunSheetItem.delete({ where: { id: itemId } })

  redirectWithNotice(returnTo, 'success', 'Run sheet item deleted.')
}

// ===== Staff Tasks =====
export async function createStaffTask(
  eventId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireEvent(eventId, returnTo)

  await prisma.eventStaffTask.create({
    data: {
      eventId,
      title: textField(formData, 'title', 'Task title', returnTo, {
        max: 160,
        required: true,
      })!,
      assignedTo: textField(formData, 'assignedTo', 'Assigned to', returnTo, {
        max: 120,
      }),
      dueAt: dateField(formData, 'dueAt', 'Due date', returnTo),
      priority: enumField(
        formData,
        'priority',
        taskPriorities,
        'MEDIUM',
        'Priority',
        returnTo
      ) as TaskPriority,
      status: enumField(
        formData,
        'status',
        taskStatuses,
        'TODO',
        'Status',
        returnTo
      ) as TaskStatus,
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
    },
  })

  redirectWithNotice(returnTo, 'success', 'Staff task added.')
}

export async function updateStaffTask(
  eventId: string,
  taskId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireStaffTask(eventId, taskId, returnTo)

  await prisma.eventStaffTask.update({
    where: { id: taskId },
    data: {
      title: textField(formData, 'title', 'Task title', returnTo, {
        max: 160,
        required: true,
      })!,
      assignedTo: textField(formData, 'assignedTo', 'Assigned to', returnTo, {
        max: 120,
      }),
      dueAt: dateField(formData, 'dueAt', 'Due date', returnTo),
      priority: enumField(
        formData,
        'priority',
        taskPriorities,
        'MEDIUM',
        'Priority',
        returnTo
      ) as TaskPriority,
      status: enumField(
        formData,
        'status',
        taskStatuses,
        'TODO',
        'Status',
        returnTo
      ) as TaskStatus,
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
    },
  })

  redirectWithNotice(returnTo, 'success', 'Staff task updated.')
}

export async function deleteStaffTask(
  eventId: string,
  taskId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireStaffTask(eventId, taskId, returnTo)
  confirmDelete(formData, returnTo)

  await prisma.eventStaffTask.delete({ where: { id: taskId } })

  redirectWithNotice(returnTo, 'success', 'Staff task deleted.')
}

// ===== Contacts (Vendor / Contact List & Weekend Crew) =====
export async function createOperationsContact(returnTo: string, formData: FormData) {
  await requireAdmin(returnTo)

  const isCrewValue = formData.get('isCrew')
  const isCrew = isCrewValue === 'true' || isCrewValue === 'on'

  await prisma.operationsContact.create({
    data: {
      name: textField(formData, 'name', 'Name', returnTo, {
        max: 160,
        required: true,
      })!,
      company: textField(formData, 'company', 'Company', returnTo, { max: 160 }),
      role: textField(formData, 'role', 'Role', returnTo, { max: 120 }),
      phone: textField(formData, 'phone', 'Phone', returnTo, { max: 80 }),
      email: emailField(formData, 'email', returnTo),
      websiteUrl: urlField(formData, 'websiteUrl', returnTo),
      category: textField(formData, 'category', 'Category', returnTo, { max: 80 }),
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
      isCrew,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Contact added.')
}

export async function updateOperationsContact(
  contactId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireContact(contactId, returnTo)

  const isCrewValue = formData.get('isCrew')
  const isCrew = isCrewValue === 'true' || isCrewValue === 'on'

  await prisma.operationsContact.update({
    where: { id: contactId },
    data: {
      name: textField(formData, 'name', 'Name', returnTo, {
        max: 160,
        required: true,
      })!,
      company: textField(formData, 'company', 'Company', returnTo, { max: 160 }),
      role: textField(formData, 'role', 'Role', returnTo, { max: 120 }),
      phone: textField(formData, 'phone', 'Phone', returnTo, { max: 80 }),
      email: emailField(formData, 'email', returnTo),
      websiteUrl: urlField(formData, 'websiteUrl', returnTo),
      category: textField(formData, 'category', 'Category', returnTo, { max: 80 }),
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
      isCrew,
    },
  })

  redirectWithNotice(returnTo, 'success', 'Contact updated.')
}

export async function archiveOperationsContact(contactId: string, returnTo: string) {
  await requireAdmin(returnTo)
  await requireContact(contactId, returnTo)

  await prisma.operationsContact.update({
    where: { id: contactId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Contact archived.')
}

export async function restoreOperationsContact(contactId: string, returnTo: string) {
  await requireAdmin(returnTo)
  await requireContact(contactId, returnTo)

  await prisma.operationsContact.update({
    where: { id: contactId },
    data: { archivedAt: null },
  })

  redirectWithNotice(returnTo, 'success', 'Contact restored.')
}

// ===== Supplies =====
export async function createOperationsSupply(returnTo: string, formData: FormData) {
  await requireAdmin(returnTo)

  await prisma.operationsSupply.create({
    data: {
      name: textField(formData, 'name', 'Name', returnTo, {
        max: 160,
        required: true,
      })!,
      quantity: textField(formData, 'quantity', 'Quantity', returnTo, { max: 80 }),
      owner: textField(formData, 'owner', 'Owner', returnTo, { max: 120 }),
      category: textField(formData, 'category', 'Category', returnTo, { max: 80 }),
      packed: formData.get('packed') === 'on',
      delivered: formData.get('delivered') === 'on',
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
    },
  })

  redirectWithNotice(returnTo, 'success', 'Supply added.')
}

export async function updateOperationsSupply(
  supplyId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireSupply(supplyId, returnTo)

  await prisma.operationsSupply.update({
    where: { id: supplyId },
    data: {
      name: textField(formData, 'name', 'Name', returnTo, {
        max: 160,
        required: true,
      })!,
      quantity: textField(formData, 'quantity', 'Quantity', returnTo, { max: 80 }),
      owner: textField(formData, 'owner', 'Owner', returnTo, { max: 120 }),
      category: textField(formData, 'category', 'Category', returnTo, { max: 80 }),
      packed: formData.get('packed') === 'on',
      delivered: formData.get('delivered') === 'on',
      notes: textField(formData, 'notes', 'Notes', returnTo, { max: 2000 }),
    },
  })

  redirectWithNotice(returnTo, 'success', 'Supply updated.')
}

export async function toggleOperationsSupplyPacked(
  supplyId: string,
  returnTo: string
) {
  await requireAdmin(returnTo)

  const supply = await prisma.operationsSupply.findUnique({
    where: { id: supplyId },
    select: { packed: true },
  })
  if (!supply) {
    redirectWithNotice(returnTo, 'blocked', 'Supply could not be found.')
  }

  await prisma.operationsSupply.update({
    where: { id: supplyId },
    data: { packed: !supply.packed },
  })

  redirectWithNotice(returnTo, 'success', 'Packed status updated.')
}

export async function toggleOperationsSupplyDelivered(
  supplyId: string,
  returnTo: string
) {
  await requireAdmin(returnTo)

  const supply = await prisma.operationsSupply.findUnique({
    where: { id: supplyId },
    select: { delivered: true },
  })
  if (!supply) {
    redirectWithNotice(returnTo, 'blocked', 'Supply could not be found.')
  }

  await prisma.operationsSupply.update({
    where: { id: supplyId },
    data: { delivered: !supply.delivered },
  })

  redirectWithNotice(returnTo, 'success', 'Delivered status updated.')
}

export async function archiveOperationsSupply(supplyId: string, returnTo: string) {
  await requireAdmin(returnTo)
  await requireSupply(supplyId, returnTo)

  await prisma.operationsSupply.update({
    where: { id: supplyId },
    data: { archivedAt: new Date() },
  })

  redirectWithNotice(returnTo, 'success', 'Supply archived.')
}

export async function restoreOperationsSupply(supplyId: string, returnTo: string) {
  await requireAdmin(returnTo)
  await requireSupply(supplyId, returnTo)

  await prisma.operationsSupply.update({
    where: { id: supplyId },
    data: { archivedAt: null },
  })

  redirectWithNotice(returnTo, 'success', 'Supply restored.')
}

// ===== Crew Roster (per‑event) =====
export async function createCrewMember(
  eventId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)
  await requireEvent(eventId, returnTo)

  const operationsContactId = String(formData.get('operationsContactId') || '').trim()
  if (!operationsContactId) {
    redirectWithNotice(returnTo, 'blocked', 'Please select a person from the Weekend Crew List.')
  }

  const contact = await prisma.operationsContact.findUnique({
    where: { id: operationsContactId },
  })
  if (!contact) {
    redirectWithNotice(returnTo, 'blocked', 'Selected crew member could not be found.')
  }

  const position = textField(formData, 'position', 'Position', returnTo, { max: 120, required: true })!
  const notes = textField(formData, 'notes', 'Notes', returnTo, { max: 2000 })
  const sortOrder = numberField(formData, 'sortOrder', returnTo)

  await prisma.eventCrewMember.create({
    data: {
      eventId,
      position,
      name: contact.name,
      phone: contact.phone || undefined,
      email: contact.email || undefined,
      notes,
      sortOrder,
    },
  })

  // Ensure the contact is flagged as crew (in case it wasn't already)
  if (!contact.isCrew) {
    await prisma.operationsContact.update({
      where: { id: operationsContactId },
      data: { isCrew: true },
    })
  }

  redirectWithNotice(returnTo, 'success', 'Crew member added.')
}

export async function updateCrewMember(
  eventId: string,
  crewId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  const crew = await prisma.eventCrewMember.findUnique({
    where: { id: crewId },
    select: { eventId: true },
  })
  if (!crew || crew.eventId !== eventId) {
    redirectWithNotice(returnTo, 'blocked', 'Crew member could not be found.')
  }

  const position = textField(formData, 'position', 'Position', returnTo, { max: 120, required: true })!
  const notes = textField(formData, 'notes', 'Notes', returnTo, { max: 2000 })
  const sortOrder = numberField(formData, 'sortOrder', returnTo)

  await prisma.eventCrewMember.update({
    where: { id: crewId },
    data: { position, notes, sortOrder },
  })

  redirectWithNotice(returnTo, 'success', 'Crew member updated.')
}

export async function deleteCrewMember(
  eventId: string,
  crewId: string,
  returnTo: string,
  formData: FormData
) {
  await requireAdmin(returnTo)

  const crew = await prisma.eventCrewMember.findUnique({
    where: { id: crewId },
    select: { eventId: true },
  })
  if (!crew || crew.eventId !== eventId) {
    redirectWithNotice(returnTo, 'blocked', 'Crew member could not be found.')
  }

  confirmDelete(formData, returnTo)

  await prisma.eventCrewMember.delete({ where: { id: crewId } })

  redirectWithNotice(returnTo, 'success', 'Crew member removed.')
}