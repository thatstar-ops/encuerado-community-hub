// Diagnostic tool: find a specific TicketSpice order/ticket in the raw
// webhook log table by any substring (order number, ticket ID, buyer name,
// email, etc.) and print exactly why it did or didn't get processed into a
// Member/EventRegistration/TicketPurchase.
//
// Unlike the admin /admin/ticketspice-webhooks page, this searches ALL
// webhook logs (not just the most recent 50) and matches on the full raw
// JSON text, so it finds a hit regardless of which field the search term
// lives in (order number, ticket id, lookupId, buyer name, etc).
//
// Usage:
//   node scripts/find-ticketspice-order.mjs "01KYB89KV74W30Q9R8N" "Cesar" "Cruz"
//
// Read-only. Makes no writes.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const HARDCODED_EXCLUDED_ORDER_NUMBER = 'NCRDWKND2026-XZT0002'

const WEEKEND_PASS_EVENT_TITLES = [
  'ATAME/VPL Crossover',
  'Primer Impacto',
  'Aguas Frescas Wet Play Party',
  'Sombras de Mi Barrio',
  'Mr Cuero Contest & After Party',
]

const INDIVIDUAL_TICKET_ALIASES = {
  'ATAME / VPL CROSSOVER': 'ATAME/VPL Crossover',
  'ATAME/VPL CROSSOVER': 'ATAME/VPL Crossover',
  'PRIMER IMPACTO': 'Primer Impacto',
  'AGUAS FRESCAS PISS QUEEN (BEER AND WATER INCLUDED)': 'Aguas Frescas Wet Play Party',
  'AGUAS FRESCAS WET PLAY PARTY': 'Aguas Frescas Wet Play Party',
  'SOMBRAS DE MI BARRIO - ART SHOW OPENING': 'Sombras de Mi Barrio',
  'SOMBRAS DE MI BARRIO': 'Sombras de Mi Barrio',
  'ANYTHING GOES - MR CUERO CONTEST AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'ANYTHING GOES - MR CUERO CONTEST PRE AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'CARNE ASADA PLAY AND POOL PARTY': 'Carne Asada Play and Pool Party',
  'MR CUERO CONTEST AND AFTER PARTY': 'Mr Cuero Contest & After Party',
  'MR CUERO CONTEST & AFTER PARTY': 'Mr Cuero Contest & After Party',
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyTicketLabel(label, eventByNormalizedTitle) {
  const canonical = normalizeKey(label).toUpperCase()
  const normalized = normalizeKey(label)

  if (canonical === 'ENCUERADO WEEKEND PASS') return { type: 'weekend_pass' }
  if (canonical === 'ENCUERADO WEEKEND VIP PASS') return { type: 'vip_pass' }
  if (canonical === 'BE A SPONSOR' || canonical.includes('SPONSOR')) return { type: 'sponsor' }
  if (canonical.includes('T SHIRT') || canonical.includes('TSHIRT')) return { type: 'addon (shirt)' }
  if (canonical.endsWith(' PIN') || canonical.includes(' PIN ')) return { type: 'addon (pin)' }

  const aliasKey = Object.keys(INDIVIDUAL_TICKET_ALIASES).find(
    (k) => normalizeKey(k) === normalized
  )
  if (aliasKey) return { type: 'individual_event', eventTitle: INDIVIDUAL_TICKET_ALIASES[aliasKey] }

  const directMatch = eventByNormalizedTitle.get(normalized)
  if (directMatch) return { type: 'individual_event', eventTitle: directMatch }

  return { type: 'UNKNOWN — no alias and no matching Event title found' }
}

async function main() {
  const searchTerms = process.argv.slice(2).filter(Boolean)

  if (searchTerms.length === 0) {
    console.error('Usage: node scripts/find-ticketspice-order.mjs "<order number, ticket id, name, or email>" [more terms...]')
    process.exit(1)
  }

  console.log(`Searching all TicketSpiceWebhookLog rows for: ${searchTerms.join(' | ')}\n`)

  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    where: {
      OR: searchTerms.map((term) => ({
        rawBody: { contains: term, mode: 'insensitive' },
      })),
    },
    orderBy: { receivedAt: 'desc' },
  })

  if (logs.length === 0) {
    console.log('No webhook log rows matched. This means one of:')
    console.log('  1. TicketSpice never sent a webhook for this order (check TicketSpice\'s own dashboard/delivery log)')
    console.log('  2. The search term doesn\'t appear literally in the raw payload (try another term - order number, email, or name)')
    await prisma.$disconnect()
    return
  }

  const events = await prisma.event.findMany({ select: { id: true, title: true } })
  const eventByNormalizedTitle = new Map(events.map((e) => [normalizeKey(e.title), e.title]))

  for (const log of logs) {
    console.log('='.repeat(80))
    console.log(`Webhook log ID: ${log.id}`)
    console.log(`Received: ${log.receivedAt.toISOString()}`)
    console.log(`Processed: ${log.processedAt ? log.processedAt.toISOString() : 'NEVER'}`)
    console.log(`Status: ${log.status}${log.error ? '  Error: ' + log.error : ''}`)

    let payload = log.payloadJson
    if (!payload && log.rawBody) {
      try {
        payload = JSON.parse(log.rawBody)
      } catch {
        console.log('Payload JSON could not be parsed.\n')
        continue
      }
    }

    if (!payload || typeof payload !== 'object') {
      console.log('No usable payload on this log.\n')
      continue
    }

    const eventType = payload.eventType || payload.event_type || payload.type || 'unknown'
    console.log(`Event type: ${eventType}`)

    if (normalizeKey(eventType) !== 'registration') {
      console.log('>>> SKIPPED: eventType is not "registration" — never processed.\n')
      continue
    }

    const data = payload.data
    if (!data) {
      console.log('>>> SKIPPED: no data.data block on payload.\n')
      continue
    }

    console.log(`Order number: ${data.orderNumber || '(none)'}`)
    console.log(`Order status (raw): "${data.orderStatus}"`)
    console.log(`Form name (raw): "${data.formName}"`)
    console.log(`Total: ${data.total}`)

    const reasons = []
    if (data.orderStatus !== 'completed') reasons.push(`orderStatus is "${data.orderStatus}", not exactly "completed"`)
    if (data.formName !== 'Encuerado Weekend 2026') reasons.push(`formName is "${data.formName}", not exactly "Encuerado Weekend 2026"`)
    if (!(Number(data.total || 0) > 0)) reasons.push('total is 0 or missing')
    if (data.orderNumber === HARDCODED_EXCLUDED_ORDER_NUMBER) reasons.push('orderNumber matches the hardcoded excluded order number in the code')

    if (reasons.length > 0) {
      console.log('>>> SKIPPED AT THE ORDER LEVEL. Reason(s):')
      for (const r of reasons) console.log('    - ' + r)
      console.log('    Nothing (member, ticket, registration) was ever created from this order.\n')
      continue
    }

    const billing = data.billing || {}
    console.log(`Buyer: ${billing.name?.first || '?'} ${billing.name?.last || '?'} <${billing.email || 'NO EMAIL'}>`)

    if (!billing.email) {
      console.log('>>> STUCK IN MANUAL REVIEW: no billing.email present. No member was ever created.\n')
      continue
    }
    if (!billing.name?.first || !billing.name?.last) {
      console.log('>>> STUCK IN MANUAL REVIEW: missing first or last name. No member was ever created.\n')
      continue
    }

    const email = String(billing.email).trim().toLowerCase()
    const member = await prisma.member.findFirst({ where: { email } })

    if (!member) {
      console.log('>>> Order passed all order-level checks, but NO Member exists for this email yet.')
      console.log('    This order is currently sitting eligible-but-unprocessed. Run "Process Eligible Orders" on /admin/ticketspice-webhooks.\n')
      continue
    }

    console.log(`Member found: ${member.firstName} ${member.lastName} (id ${member.id}, archived: ${Boolean(member.archivedAt)})`)

    const participation = await prisma.participationRecord.findFirst({
      where: { memberId: member.id, year: 2026, type: 'ATTENDEE' },
    })
    console.log(`2026 ATTENDEE participation record: ${participation ? 'yes' : 'MISSING'}`)

    const tickets = data.tickets || []
    console.log(`\nTicket line items on this order (${tickets.length}):`)

    for (const ticket of tickets) {
      const label = String(ticket.ticketLabel || ticket.name || ticket.productName || '(no label)')
      const classification = classifyTicketLabel(label, eventByNormalizedTitle)
      console.log(`  - "${label}" (id: ${ticket.id || ticket.lookupId || '?'}) -> ${classification.type}${classification.eventTitle ? ' (' + classification.eventTitle + ')' : ''}`)

      if (classification.type === 'individual_event' || classification.type === 'weekend_pass' || classification.type === 'vip_pass') {
        const targetTitles = classification.eventTitle ? [classification.eventTitle] : WEEKEND_PASS_EVENT_TITLES
        for (const title of targetTitles) {
          const event = await prisma.event.findFirst({ where: { title } })
          if (!event) {
            console.log(`      >>> Event "${title}" does not exist in the Event table — this ticket can never register.`)
            continue
          }
          const reg = await prisma.eventRegistration.findFirst({ where: { memberId: member.id, eventId: event.id } })
          console.log(`      Registration for "${title}": ${reg ? 'EXISTS' : 'MISSING'}`)
        }
      }
    }

    console.log('')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
