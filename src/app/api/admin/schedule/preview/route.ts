import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/auth'
import {
  buildSchedulePreviewEvent,
  loadScheduleEvents,
  SCHEDULE_URL,
  type ScheduleSourceMode,
} from '@/lib/schedule-import'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const useFallback = Boolean((await request.json().catch(() => ({}))).useFallback)
    const sourceMode: ScheduleSourceMode = useFallback ? 'fallback' : 'automatic'
    const events = await loadScheduleEvents(sourceMode)
    const existing = await prisma.event.findMany({
      select: { id: true, title: true, description: true, location: true, startsAt: true, endsAt: true, flyerImageUrl: true, sourceUrl: true, externalKey: true },
    })
    return NextResponse.json({
      sourceMode,
      sourceUrl: SCHEDULE_URL,
      events: events.map((event) => buildSchedulePreviewEvent(event, existing, {
        blobTokenConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read the schedule.' }, { status: 400 })
  }
}
