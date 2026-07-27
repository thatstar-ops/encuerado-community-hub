import { prisma } from '@/lib/prisma'

type CleanupSummary = {
  scanned: number
  eligibleForDeletion: number
  deleted: number
  retained: number
}

function normalizeKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePayload(payloadJson: unknown, rawBody: string | null) {
  if (payloadJson && typeof payloadJson === 'object' && !Array.isArray(payloadJson)) {
    return payloadJson as Record<string, unknown>
  }
  if (!rawBody) return null
  try {
    const parsed = JSON.parse(rawBody)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isSafelyIrrelevantWebhook(
  payload: Record<string, unknown>,
  fallbackEventType: string | null
) {
  const eventType = normalizeKey(
    payload.eventType ||
      payload.event_type ||
      payload.event ||
      payload.type ||
      payload.action ||
      fallbackEventType
  )

  if (eventType && eventType !== 'registration') return true

  const data =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null

  if (!data) return false

  const formName = String(data.formName || '').trim()
  const orderNumber = String(data.orderNumber || '').trim()
  const total = Number(data.total || 0)

  if (formName && formName !== 'Encuerado Weekend 2026') return true
  if (Number.isFinite(total) && total <= 0) return true
  if (orderNumber === 'NCRDWKND2026-XZT0002') return true

  return false
}

export async function cleanupIrrelevantWebhookLogs(
  retentionDays = 30,
  dryRun = false
): Promise<CleanupSummary> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      receivedAt: { lt: cutoff },
      processedAt: null,
    },
    select: {
      id: true,
      eventType: true,
      payloadJson: true,
      rawBody: true,
    },
  })

  const deletableIds: string[] = []

  for (const log of logs) {
    const payload = parsePayload(log.payloadJson, log.rawBody)
    if (payload && isSafelyIrrelevantWebhook(payload, log.eventType)) {
      deletableIds.push(log.id)
    }
  }

  if (!dryRun && deletableIds.length > 0) {
    await prisma.ticketSpiceWebhookLog.deleteMany({
      where: { id: { in: deletableIds } },
    })
  }

  return {
    scanned: logs.length,
    eligibleForDeletion: deletableIds.length,
    deleted: dryRun ? 0 : deletableIds.length,
    retained: logs.length - deletableIds.length,
  }
}
