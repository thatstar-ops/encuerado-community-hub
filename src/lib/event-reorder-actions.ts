'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from './prisma'
import { getCurrentAdmin } from './auth'

async function getOrderedEvents() {
  return prisma.event.findMany({
    where: {
      archivedAt: null,
      cancelledAt: null,
      status: { not: 'Cancelled' },
    },
    orderBy: [
      { displayOrder: 'asc' },
      { startsAt: 'asc' },
      { createdAt: 'asc' },
    ],
    select: { id: true, displayOrder: true },
  })
}

async function normalizeOrder(events: { id: string; displayOrder: number }[]) {
  for (let i = 0; i < events.length; i++) {
    const newOrder = (i + 1) * 10
    if (events[i].displayOrder !== newOrder) {
      await prisma.event.update({
        where: { id: events[i].id },
        data: { displayOrder: newOrder },
      })
    }
  }
}

export async function moveEventUp(eventId: string) {
  const admin = await getCurrentAdmin()
  if (!admin) throw new Error('Unauthorized')

  const events = await getOrderedEvents()
  const index = events.findIndex(e => e.id === eventId)
  if (index === -1) throw new Error('Event not found')
  if (index === 0) return

  const newEvents = [...events]
  ;[newEvents[index - 1], newEvents[index]] = [newEvents[index], newEvents[index - 1]]

  await normalizeOrder(newEvents)
  revalidatePath('/events')
}

export async function moveEventDown(eventId: string) {
  const admin = await getCurrentAdmin()
  if (!admin) throw new Error('Unauthorized')

  const events = await getOrderedEvents()
  const index = events.findIndex(e => e.id === eventId)
  if (index === -1) throw new Error('Event not found')
  if (index === events.length - 1) return

  const newEvents = [...events]
  ;[newEvents[index + 1], newEvents[index]] = [newEvents[index], newEvents[index + 1]]

  await normalizeOrder(newEvents)
  revalidatePath('/events')
}
