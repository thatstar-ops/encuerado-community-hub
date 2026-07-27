import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { cleanupIrrelevantWebhookLogsAction, dryRunAction, processEligibleOrdersAction } from '@/lib/ticketspice/actions'

const EVENT_TIME_ZONE = 'America/Los_Angeles'

// Helper to format dates
function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

// Mask email for display
function maskEmail(email: string | null) {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return local.slice(0, 1) + '***@' + domain
}

function normalizeKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}

function isSponsorTicketLabel(label: string) {
  const normalized = normalizeKey(label)
  return normalized === normalizeKey('BE A SPONSOR') || normalized.includes('sponsor')
}

function ticketAliasToEventTitle(label: string) {
  const map = new Map<string, string>([
    [normalizeKey('ATAME / VPL CROSSOVER'), 'ATAME/VPL Crossover'],
    [normalizeKey('ATAME/VPL CROSSOVER'), 'ATAME/VPL Crossover'],
    [normalizeKey('PRIMER IMPACTO'), 'Primer Impacto'],
    [normalizeKey('AGUAS FRESCAS PISS QUEEN (BEER AND WATER INCLUDED)'), 'Aguas Frescas Wet Play Party'],
    [normalizeKey('AGUAS FRESCAS WET PLAY PARTY'), 'Aguas Frescas Wet Play Party'],
    [normalizeKey('SOMBRAS DE MI BARRIO - ART SHOW OPENING'), 'Sombras de Mi Barrio'],
    [normalizeKey('SOMBRAS DE MI BARRIO'), 'Sombras de Mi Barrio'],
    [normalizeKey('ANYTHING GOES - MR CUERO CONTEST AND AFTER PARTY'), 'Mr Cuero Contest & After Party'],
    [normalizeKey('ANYTHING GOES - MR CUERO CONTEST PRE AND AFTER PARTY'), 'Mr Cuero Contest & After Party'],
    [normalizeKey('MR CUERO CONTEST AND AFTER PARTY'), 'Mr Cuero Contest & After Party'],
    [normalizeKey('MR CUERO CONTEST & AFTER PARTY'), 'Mr Cuero Contest & After Party'],
  ])

  return map.get(normalizeKey(label)) || null
}

// Pull the billing email out of a webhook payload, if present. Used both to
// classify a single log and to batch-prefetch members across all logs up
// front (avoids a member lookup per row).
function extractBillingEmail(payload: any): string | null {
  if (!payload || payload.eventType !== 'registration') return null
  const data = payload.data
  if (!data) return null
  if (data.formName !== 'Encuerado Weekend 2026' || !data.formName) return null
  if (data.total <= 0) return null
  if (data.orderStatus !== 'completed') return null
  const email = data.billing?.email
  return email ? String(email).trim().toLowerCase() : null
}

// Determine status label per log (robust matching).
// `memberByEmail` / `participationByMemberId` are optional pre-fetched
// lookups (see caller) so we don't run a member + participation-record
// query per row when rendering the admin log list.
async function getOrderStatusLabel(
  payload: any,
  memberByEmail?: Map<string, { id: string }>,
  participationByMemberId?: Set<string>
) {
  if (!payload || payload.eventType !== 'registration') return 'Not a registration'
  const data = payload.data
  if (!data) return 'Missing data'

  if (data.formName !== 'Encuerado Weekend 2026' || !data.formName) {
    return 'Fake sample / unrelated'
  }
  if (data.total <= 0) return 'Free/test order'
  if (data.orderStatus !== 'completed') return `Status: ${data.orderStatus}`

  // Eligible paid order – now check attendee/registrations
  const billing = data.billing
  if (!billing?.email) return 'Needs review (no email)'
  const email = billing.email.trim().toLowerCase()

  const member = memberByEmail
    ? memberByEmail.get(email) ?? null
    : await prisma.member.findFirst({ where: { email } })
  if (!member) return 'Eligible paid order'

  // Check ParticipationRecord
  const hasParticipation = participationByMemberId
    ? participationByMemberId.has(member.id)
    : Boolean(
        await prisma.participationRecord.findFirst({
          where: { memberId: member.id, year: 2026, type: 'ATTENDEE' },
        })
      )
  if (!hasParticipation) return 'Partially imported (missing participation)'

  // Build expected events list
  const tickets = data.tickets || []
  const expectedEvents: Set<string> = new Set()
  const WEEKEND_EVENTS = [
    'ATAME/VPL Crossover',
    'Primer Impacto',
    'Aguas Frescas Wet Play Party',
    'Sombras de Mi Barrio',
    'Mr Cuero Contest & After Party',
  ]

  const appEvents = await prisma.event.findMany({
    select: { title: true },
  })
  const appEventByNormalizedTitle = new Map(
    appEvents.map((event) => [normalizeKey(event.title), event.title])
  )

  let hasSponsorTicket = false

  for (const ticket of tickets) {
    const label = String(ticket.ticketLabel || ticket.name || ticket.productName || '')
    const normalizedLabel = normalizeKey(label)

    if (isSponsorTicketLabel(label)) {
      hasSponsorTicket = true
      WEEKEND_EVENTS.forEach((eventTitle) => expectedEvents.add(eventTitle))
      continue
    }

    if (
      normalizedLabel === normalizeKey('ENCUERADO WEEKEND PASS') ||
      normalizedLabel === normalizeKey('ENCUERADO WEEKEND VIP PASS')
    ) {
      WEEKEND_EVENTS.forEach((eventTitle) => expectedEvents.add(eventTitle))
      continue
    }

    const mappedEventTitle = ticketAliasToEventTitle(label)
    if (mappedEventTitle) {
      expectedEvents.add(mappedEventTitle)
      continue
    }

    const directMatchedEventTitle = appEventByNormalizedTitle.get(normalizedLabel)
    if (directMatchedEventTitle) {
      expectedEvents.add(directMatchedEventTitle)
    }
  }

  if (hasSponsorTicket) {
    const sponsorFulfillment = await prisma.sponsorFulfillment.findFirst({
      where: {
        memberId: member.id,
        eventYear: 2026,
      },
      select: {
        sponsorTier: true,
      },
    })

    const sponsorPurchase = await prisma.ticketPurchase.findFirst({
      where: {
        memberId: member.id,
        externalSource: 'TicketSpice',
        orderNumber: data.orderNumber || undefined,
        purchaseType: 'Sponsor',
      },
      select: {
        id: true,
      },
    })

    if (sponsorFulfillment) {
      return sponsorFulfillment.sponsorTier
        ? sponsorFulfillment.sponsorTier + ' sponsor imported'
        : 'Sponsor imported'
    }

    if (sponsorPurchase) {
      return 'Sponsor purchase imported - missing fulfillment'
    }
  }

  // Check if all expected events have registrations
  let foundAll = expectedEvents.size > 0
  for (const eventTitle of expectedEvents) {
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { title: eventTitle },
          { title: { equals: eventTitle, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (!event) {
      foundAll = false
      break
    }
    const reg = await prisma.eventRegistration.findFirst({
      where: { memberId: member.id, eventId: event.id },
    })
    if (!reg) {
      foundAll = false
      break
    }
  }

  if (foundAll) return hasSponsorTicket ? 'Sponsor imported' : 'Already imported'
  if (expectedEvents.size > 0) return hasSponsorTicket ? 'Sponsor partially imported' : 'Partially imported'
  return 'Eligible paid order'
}

export default async function TicketSpiceWebhooksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    dryRunResult?: string
    processResult?: string
    cleanupResult?: string
    message?: string
  }>
}) {
  const admin = await requireSuperAdmin()

  const params = await searchParams

  // Parse dry-run result
  let dryRunResult: any = null
  if (params?.dryRunResult) {
    try {
      dryRunResult = JSON.parse(params.dryRunResult)
    } catch {}
  }

  // Parse process result
  let processResult: any = null
  if (params?.processResult) {
    try {
      processResult = JSON.parse(params.processResult)
    } catch {}
  }

  let cleanupResult: Record<string, number> | null = null
  if (params?.cleanupResult) {
    try {
      cleanupResult = JSON.parse(params.cleanupResult)
    } catch {}
  }

  const message = params?.message || null

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      receivedAt: true,
      eventType: true,
      status: true,
      payloadJson: true,
      rawBody: true,
      processedAt: true,
      error: true,
    },
  })

  // Parse all payloads once up front so we can batch-prefetch the member +
  // participation lookups instead of querying per row (was up to ~2 extra
  // queries per row / ~100 queries for 50 rows).
  const logsWithPayload = logs.map((log) => ({
    ...log,
    payload: log.payloadJson || (log.rawBody ? JSON.parse(log.rawBody as string) : null),
  }))

  const billingEmails = [
    ...new Set(
      logsWithPayload
        .map((log) => extractBillingEmail(log.payload))
        .filter((email): email is string => Boolean(email))
    ),
  ]

  const prefetchedMembers = billingEmails.length
    ? await prisma.member.findMany({
        where: { email: { in: billingEmails } },
        select: { id: true, email: true },
      })
    : []
  const memberByEmail = new Map(
    prefetchedMembers.map((member) => [member.email.toLowerCase(), member])
  )

  const memberIds = prefetchedMembers.map((member) => member.id)
  const prefetchedParticipation = memberIds.length
    ? await prisma.participationRecord.findMany({
        where: { memberId: { in: memberIds }, year: 2026, type: 'ATTENDEE' },
        select: { memberId: true },
      })
    : []
  const participationByMemberId = new Set(
    prefetchedParticipation.map((record) => record.memberId)
  )

  // Pre‑compute status labels
  const logsWithStatus = await Promise.all(
    logsWithPayload.map(async (log) => {
      const label = await getOrderStatusLabel(log.payload, memberByEmail, participationByMemberId)
      return { ...log, statusLabel: label }
    })
  )

  // Summary counts
  const statusCounts: Record<string, number> = {}
  logsWithStatus.forEach((log) => {
    const key = log.statusLabel
    statusCounts[key] = (statusCounts[key] || 0) + 1
  })

  const alreadyImportedCount = statusCounts['Already imported'] || 0
  const eligiblePaidOrderCount = statusCounts['Eligible paid order'] || 0
  const partialImportCount = Object.entries(statusCounts)
    .filter(([label]) => label.startsWith('Partially imported'))
    .reduce((sum, [, count]) => sum + count, 0)
  const needsReviewCount = Object.entries(statusCounts)
    .filter(([label]) => label.startsWith('Needs review'))
    .reduce((sum, [, count]) => sum + count, 0)
  const rawCapturedCount = logsWithStatus.filter((log) => log.status === 'captured').length
  const rawProcessedCount = logsWithStatus.filter((log) => Boolean(log.processedAt)).length

  // Color mapping for badges
  function badgeColor(label: string) {
    if (label === 'Already imported') return 'bg-green-600 text-white'
    if (label.toLowerCase().includes('sponsor') && label.toLowerCase().includes('imported')) return 'bg-green-600 text-white'
    if (label.toLowerCase().includes('el mero mero')) return 'bg-green-600 text-white'
    if (label.toLowerCase().includes('padrino')) return 'bg-green-600 text-white'
    if (label.toLowerCase().includes('compadre')) return 'bg-green-600 text-white'
    if (label.startsWith('Partially imported')) return 'bg-[#B11218] text-white'
    if (label === 'Eligible paid order') return 'bg-[#B11218] text-white'
    if (label === 'Free/test order') return 'bg-[#3A1215] text-white'
    if (label.startsWith('Needs review')) return 'bg-orange-600 text-white'
    if (label === 'Fake sample / unrelated') return 'bg-[#2A0E10] text-[#B7B7B7]'
    if (label.startsWith('Status:')) return 'bg-[#3A1215] text-white'
    return 'bg-[#2A0E10] text-white'
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/admin"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Dashboard
          </Link>

          <div className="flex gap-4">
            {/* Dry Run button */}
            <form action={dryRunAction}>
              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Dry Run Eligible Orders
              </button>
            </form>

            {/* Process button with confirmation */}
            <form action={processEligibleOrdersAction} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confirmProcess"
                  name="confirmProcess"
                  value="yes"
                  className="h-5 w-5 rounded border-[#3A1215] bg-[#0B0B0B] text-yellow-400 focus:ring-[#B11218]"
                />
                <label htmlFor="confirmProcess" className="text-sm text-[#B7B7B7] font-medium">
                  I understand this will create/update attendee records and event registrations for eligible paid TicketSpice orders.
                </label>
              </div>
              <button
                type="submit"
                className="rounded-lg border border-red-500 bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Process Eligible Orders
              </button>
              <p className="text-xs text-[#777777] mt-1">
                Run Dry Run first. Processing is idempotent, but this writes to the database.
              </p>
            </form>

            <form action={cleanupIrrelevantWebhookLogsAction} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confirmCleanup"
                  name="confirmCleanup"
                  value="yes"
                  className="h-5 w-5 rounded border-[#3A1215] bg-[#0B0B0B] text-yellow-400 focus:ring-[#B11218]"
                />
                <label htmlFor="confirmCleanup" className="text-sm font-medium text-[#B7B7B7]">
                  Delete only unrelated, free/test, or non-registration webhook logs older than 30 days.
                </label>
              </div>
              <button
                type="submit"
                className="rounded-lg border border-[#777777] bg-[#2A0E10] px-5 py-3 text-base font-bold text-white hover:bg-[#3A1215]"
              >
                Clean Up Irrelevant Logs
              </button>
              <p className="mt-1 text-xs text-[#777777]">
                Paid orders, failed processing, malformed payloads, and review-needed records are retained.
              </p>
            </form>
          </div>
        </div>

        {/* Message display */}
        {message && (
          <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-200">
            {message}
          </div>
        )}

        {/* Dry-run result */}
        {dryRunResult && (
          <div className="mb-6 rounded-xl border border-[#B11218]/50 bg-[#B11218]/10 p-4 text-yellow-100">
            <strong>Dry‑Run Result:</strong>
            <pre className="mt-2 text-sm">{JSON.stringify(dryRunResult, null, 2)}</pre>
          </div>
        )}

        {/* Process result */}
        {processResult && (
          <div className="mb-6 rounded-xl border border-green-500/50 bg-green-500/10 p-4 text-green-100">
            <strong>Process Result:</strong>
            <pre className="mt-2 text-sm">{JSON.stringify(processResult, null, 2)}</pre>
          </div>
        )}

        {cleanupResult && (
          <div className="mb-6 rounded-xl border border-blue-500/50 bg-blue-500/10 p-4 text-blue-100">
            <strong>Cleanup Result:</strong>
            <pre className="mt-2 text-sm">{JSON.stringify(cleanupResult, null, 2)}</pre>
          </div>
        )}

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-5xl font-black uppercase tracking-wide text-white">TicketSpice Webhooks</h1>
          <p className="mt-4 text-xl text-[#B7B7B7]">
            Captured TicketSpice Orders — read‑only status.
          </p>

          {/* Summary counts */}
          <div className="mt-6 flex flex-wrap gap-3">
            {Object.entries(statusCounts).map(([label, count]) => (
              <span
                key={label}
                className={`rounded-full px-4 py-2 text-sm font-bold ${badgeColor(label)}`}
              >
                {label}: {count}
              </span>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-[#B11218]/50 bg-[#B11218]/10 p-4 text-yellow-100">
            Webhook payloads may contain private attendee, order, or payment‑related information.
            Do not share screenshots or copied payloads publicly.
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full min-w-[1200px] text-left text-base">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-4 font-bold">Received</th>
                  <th className="p-4 font-bold">Order #</th>
                  <th className="p-4 font-bold">Import Status</th>
                  <th className="p-4 font-bold">Raw Log</th>
                  <th className="p-4 font-bold">Form</th>
                  <th className="p-4 font-bold">Total</th>
                  <th className="p-4 font-bold">Buyer</th>
                  <th className="p-4 font-bold">Tickets</th>
                  <th className="p-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logsWithStatus.map((log) => {
                  const data = log.payload?.data || {}
                  const billing = data.billing || {}
                  const tickets = data.tickets || []
                  const ticketLabels = tickets.map((t: any) => t.ticketLabel || 'Unknown').join(', ')

                  return (
                    <tr
                      key={log.id}
                      className="border-t border-[#2A0E10] bg-[#0B0B0B] hover:bg-[#151111]"
                    >
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {formatDate(log.receivedAt)}
                      </td>
                      <td className="p-4 font-mono text-sm text-[#B11218]">
                        {data.orderNumber || '—'}
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-bold ${badgeColor(log.statusLabel)}`}
                        >
                          {log.statusLabel}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        <div>Status: {log.status || '—'}</div>
                        <div className="text-xs text-[#777777]">Processed: {formatDate(log.processedAt)}</div>
                        {log.error && <div className="mt-1 text-xs text-[#FFB3B6]">Error: {log.error}</div>}
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {data.formName || '—'}
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {data.total != null ? `$${data.total}` : '—'}
                      </td>
                      <td className="p-4 text-sm text-[#B7B7B7]">
                        {billing.name?.first || billing.name?.last
                          ? `${billing.name?.first || ''} ${billing.name?.last || ''}`.trim()
                          : '—'}
                        <br />
                        <span className="text-xs text-[#777777]">{maskEmail(billing.email)}</span>
                      </td>
                      <td className="p-4 text-sm text-[#8F8F8F] max-w-[200px] truncate">
                        {ticketLabels || '—'}
                      </td>
                      <td className="p-4">
                        <details className="cursor-pointer text-sm">
                          <summary className="text-[#B11218] hover:text-[#D11A22]">
                            View Raw
                          </summary>
                          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-black p-4 text-xs text-[#B7B7B7]">
                            {JSON.stringify(log.payloadJson || log.rawBody, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {logsWithStatus.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-6 text-[#B7B7B7]">
                No webhook logs captured yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}