import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  assertApprovedScheduleFlyerUrl,
  copyScheduleFlyerToBlob,
  findScheduleDuplicate,
  loadScheduleEvents,
  safeHttpUrl,
  SCHEDULE_URL,
  validateExternalFlyerUrl,
  type FlyerHandling,
  type ExistingScheduleEvent,
  type ScheduleEvent,
  type ScheduleSourceMode,
  validateScheduleEvent,
} from '@/lib/schedule-import'

type ImportAction = 'create' | 'update' | 'separate'
type UpdateField = 'title' | 'description' | 'location' | 'startAt' | 'endAt' | 'flyerUrl' | 'sourceUrl'

type CommitSelection = {
  externalKey: string
  isManual: boolean
  action: ImportAction
  fields: Partial<Record<'title' | 'description' | 'location' | 'startAt' | 'endAt' | 'flyerUrl' | 'sourceUrl', string>>
  updateFields: Partial<Record<UpdateField, boolean>>
  flyerHandling: FlyerHandling
  allowExternalFlyerFallback: boolean
  externalFlyerConfirmed: boolean
  importSeparatelyConfirmed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseSelection(value: unknown): CommitSelection | null {
  if (!isRecord(value) || typeof value.externalKey !== 'string') return null
  if (!value.externalKey.trim() || value.externalKey.length > 300) return null
  const action = value.action === 'update' || value.action === 'separate' ? value.action : value.action === 'create' ? value.action : null
  if (!action) return null
  const fields = isRecord(value.fields) ? value.fields : {}
  const updateFields = isRecord(value.updateFields) ? value.updateFields : {}
  const flyerHandling = value.flyerHandling === 'external' || value.flyerHandling === 'none' ? value.flyerHandling : 'copy'
  return {
    externalKey: value.externalKey,
    isManual: value.isManual === true,
    action,
    fields: {
      title: typeof fields.title === 'string' ? fields.title : undefined,
      description: typeof fields.description === 'string' ? fields.description : undefined,
      location: typeof fields.location === 'string' ? fields.location : undefined,
      startAt: typeof fields.startAt === 'string' ? fields.startAt : undefined,
      endAt: typeof fields.endAt === 'string' ? fields.endAt : undefined,
      flyerUrl: typeof fields.flyerUrl === 'string' ? fields.flyerUrl : undefined,
      sourceUrl: typeof fields.sourceUrl === 'string' ? fields.sourceUrl : undefined,
    },
    updateFields: {
      title: updateFields.title === true,
      description: updateFields.description === true,
      location: updateFields.location === true,
      startAt: updateFields.startAt === true,
      endAt: updateFields.endAt === true,
      flyerUrl: updateFields.flyerUrl === true,
      sourceUrl: updateFields.sourceUrl === true,
    },
    flyerHandling,
    allowExternalFlyerFallback: value.allowExternalFlyerFallback === true,
    externalFlyerConfirmed: value.externalFlyerConfirmed === true,
    importSeparatelyConfirmed: value.importSeparatelyConfirmed === true,
  }
}

function editedEvent(source: ScheduleEvent, fields: CommitSelection['fields']) {
  return {
    title: (fields.title ?? source.title).trim(),
    description: (fields.description ?? source.description).trim(),
    location: (fields.location ?? source.location).trim(),
    startsAt: new Date(fields.startAt ?? source.startAt),
    endsAt: new Date(fields.endAt ?? source.endAt),
    flyerUrl: (fields.flyerUrl ?? source.flyerUrl).trim(),
    sourceUrl: (fields.sourceUrl ?? source.sourceUrl).trim() || SCHEDULE_URL,
  }
}

function validateEditedEvent(source: ScheduleEvent, selection: CommitSelection) {
  const edited = editedEvent(source, selection.fields)
  const invalidDates = Number.isNaN(edited.startsAt.valueOf()) || Number.isNaN(edited.endsAt.valueOf())
  const validationEvent: ScheduleEvent = {
    ...source,
    title: edited.title,
    description: edited.description,
    location: edited.location,
    startAt: invalidDates ? source.startAt : edited.startsAt.toISOString(),
    endAt: invalidDates ? source.endAt : edited.endsAt.toISOString(),
    flyerUrl: edited.flyerUrl,
    sourceUrl: edited.sourceUrl,
  }
  const errors = validateScheduleEvent(validationEvent)
  if (invalidDates) errors.push('Start and end times must be valid dates.')
  return { edited, errors }
}

function manualSourceEvent(selection: CommitSelection): ScheduleEvent {
  return {
    title: (selection.fields.title || '').trim(),
    description: (selection.fields.description || '').trim(),
    location: (selection.fields.location || '').trim(),
    sourceDateText: 'Manually added by admin',
    startAt: selection.fields.startAt || '',
    endAt: selection.fields.endAt || '',
    overnight: false,
    flyerUrl: (selection.fields.flyerUrl || '').trim(),
    sourceUrl: (selection.fields.sourceUrl || SCHEDULE_URL).trim(),
    externalKey: selection.externalKey,
    extraction: 'manual',
    extractionLabel: 'Manually Added',
    warnings: [],
  }
}

function candidateFromEdited(source: ScheduleEvent, selection: CommitSelection, edited: ReturnType<typeof editedEvent>): ScheduleEvent {
  return {
    ...source,
    title: edited.title,
    description: edited.description,
    location: edited.location,
    startAt: edited.startsAt.toISOString(),
    endAt: edited.endsAt.toISOString(),
    flyerUrl: edited.flyerUrl,
    sourceUrl: edited.sourceUrl,
    externalKey: selection.isManual ? selection.externalKey : source.externalKey,
  }
}

async function resolveFlyer(flyerUrl: string, selection: CommitSelection, title: string, approvedFlyerUrls: string[]) {
  if (selection.flyerHandling === 'none' || !flyerUrl) return { url: null as string | null, storage: 'none', message: 'Imported without a flyer.' }

  if (selection.flyerHandling === 'external') {
    const externalUrl = safeHttpUrl(flyerUrl)
    if (!externalUrl) throw new Error('Flyer URL is not a valid http or https URL.')
    const validatedUrl = approvedFlyerUrls.includes(externalUrl)
      ? await assertApprovedScheduleFlyerUrl(externalUrl, approvedFlyerUrls)
      : selection.externalFlyerConfirmed
        ? await validateExternalFlyerUrl(externalUrl)
        : null
    if (!validatedUrl) throw new Error('Unapproved flyer URL requires explicit external flyer confirmation.')
    return { url: validatedUrl, storage: 'external', message: 'Use External Flyer: validated external image was stored.' }
  }

  if (!approvedFlyerUrls.includes(flyerUrl)) {
    throw new Error('Copy Flyer to Storage is only available for approved schedule flyer URLs. Use External Flyer for a reviewed custom URL.')
  }

  const copied = await copyScheduleFlyerToBlob(flyerUrl, title, approvedFlyerUrls)
  if (copied.ok) return { url: copied.url, storage: 'blob', message: 'Copy Flyer to Storage' }

  if (selection.allowExternalFlyerFallback && copied.fallbackUrl) {
    const externalUrl = await assertApprovedScheduleFlyerUrl(copied.fallbackUrl, approvedFlyerUrls)
    return { url: externalUrl, storage: 'external', message: 'Flyer copy failed; validated external flyer fallback was used. ' + copied.error }
  }

  return { url: null as string | null, storage: 'none', message: 'Flyer copy failed, so the event was imported without a flyer. ' + copied.error }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid import request.' }, { status: 400 })

  const sourceMode: ScheduleSourceMode = body.sourceMode === 'fallback' ? 'fallback' : 'automatic'
  const selections = Array.isArray(body.selections) ? body.selections.map(parseSelection).filter(Boolean) as CommitSelection[] : []
  if (!selections.length) return NextResponse.json({ error: 'Select at least one event.' }, { status: 400 })

  const sourceEvents = await loadScheduleEvents(sourceMode)
  const approvedFlyerUrls = sourceEvents.map((event) => event.flyerUrl).filter(Boolean)
  const sourceByKey = new Map(sourceEvents.map((event) => [event.externalKey, event]))
  const existingEvents: ExistingScheduleEvent[] = await prisma.event.findMany({
    select: { id: true, title: true, description: true, location: true, startsAt: true, endsAt: true, flyerImageUrl: true, sourceUrl: true, externalKey: true },
  })
  const results: Array<{ title: string; action: ImportAction; status: 'imported' | 'updated' | 'skipped' | 'failed'; message: string; flyerStorage?: string }> = []

  for (const selection of selections) {
    const source = selection.isManual ? manualSourceEvent(selection) : sourceByKey.get(selection.externalKey)
    if (!source) {
      results.push({ title: selection.externalKey, action: selection.action, status: 'failed', message: 'Selected event was not found in the approved schedule source.' })
      continue
    }

    const sourceErrors = validateScheduleEvent(source)
    if (sourceErrors.length) {
      results.push({ title: source.title, action: selection.action, status: 'failed', message: sourceErrors.join(' ') })
      continue
    }

    const { edited, errors } = validateEditedEvent(source, selection)
    if (errors.length) {
      results.push({ title: source.title, action: selection.action, status: 'failed', message: errors.join(' ') })
      continue
    }

    const candidate = candidateFromEdited(source, selection, edited)
    const duplicate = findScheduleDuplicate(candidate, existingEvents)
    const exactDuplicate = duplicate?.reason === 'Exact externalKey' || duplicate?.reason === 'Existing sourceUrl'

    try {
      if (selection.action === 'create' && duplicate) {
        results.push({ title: source.title, action: selection.action, status: 'skipped', message: 'A matching event already exists. Choose update existing or explicitly import as separate.' })
        continue
      }

      if (selection.action === 'separate' && (!duplicate || exactDuplicate || !selection.importSeparatelyConfirmed)) {
        results.push({ title: source.title, action: selection.action, status: 'failed', message: 'Importing as a separate event requires a possible existing match and explicit administrator confirmation.' })
        continue
      }

      if (selection.action === 'update') {
        if (!duplicate) {
          results.push({ title: source.title, action: selection.action, status: 'failed', message: 'No existing event was found to update.' })
          continue
        }

        const data: Record<string, string | Date | null> = {}
        let updateFlyerStorage: string | undefined
        if (selection.updateFields.title) data.title = edited.title
        if (selection.updateFields.description) data.description = edited.description
        if (selection.updateFields.location) data.location = edited.location
        if (selection.updateFields.startAt) data.startsAt = edited.startsAt
        if (selection.updateFields.endAt) data.endsAt = edited.endsAt
        if (selection.updateFields.sourceUrl) {
          data.sourceUrl = edited.sourceUrl
          data.externalKey = selection.isManual ? null : source.externalKey
        }
        if (selection.updateFields.flyerUrl) {
          const flyer = await resolveFlyer(edited.flyerUrl, selection, edited.title, approvedFlyerUrls)
          data.flyerImageUrl = flyer.url
          updateFlyerStorage = flyer.storage
        }

        if (!Object.keys(data).length) {
          results.push({ title: source.title, action: selection.action, status: 'skipped', message: 'No source fields were selected for update.' })
          continue
        }

        await prisma.event.update({ where: { id: duplicate.event.id }, data })
        results.push({ title: edited.title, action: selection.action, status: 'updated', message: 'Updated existing event without touching registrations, check-ins, volunteer shifts, or relationships.', flyerStorage: updateFlyerStorage })
        continue
      }

      const flyer = await resolveFlyer(edited.flyerUrl, selection, edited.title, approvedFlyerUrls)
      const created = await prisma.event.create({
        data: {
          title: edited.title,
          description: edited.description,
          location: edited.location,
          startsAt: edited.startsAt,
          endsAt: edited.endsAt,
          status: 'Draft',
          flyerImageUrl: flyer.url,
          sourceUrl: edited.sourceUrl,
          externalKey: selection.isManual ? null : source.externalKey,
        },
      })
      existingEvents.push({ id: created.id, title: created.title, description: created.description, location: created.location, startsAt: created.startsAt, endsAt: created.endsAt, flyerImageUrl: created.flyerImageUrl, sourceUrl: created.sourceUrl, externalKey: created.externalKey })
      results.push({ title: source.title, action: selection.action, status: 'imported', message: flyer.message || 'Imported event.', flyerStorage: flyer.storage })
    } catch (error) {
      results.push({ title: source.title, action: selection.action, status: 'failed', message: error instanceof Error ? error.message : 'Import failed.' })
    }
  }

  return NextResponse.json({
    imported: results.filter((result) => result.status === 'imported').length,
    updated: results.filter((result) => result.status === 'updated').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  })
}
