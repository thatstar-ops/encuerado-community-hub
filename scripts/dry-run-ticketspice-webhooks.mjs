import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ===== HELPERS =====

function maskEmail(email) {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return local.slice(0, 1) + '***@' + domain
}

function maskPhone(phone) {
  if (!phone) return '—'
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 4) return '***'
  return '***-***-' + cleaned.slice(-4)
}

function shortId(id) {
  return id?.slice(-8) || '—'
}

// ===== PRODUCT MAPPING =====

const PACKAGE_EVENT_TITLES = [
  'ATAME/VPL Crossover',
  'Primer Impacto',
  'Aguas Frescas Wet Play Party',
  'Sombras de Mi Barrio',
  'Mr Cuero Contest & After Party',
]

const INDIVIDUAL_TICKET_MAP = {
  'ATAME / VPL CROSSOVER': 'ATAME/VPL Crossover',
  'PRIMER IMPACTO': 'Primer Impacto',
  'AGUAS FRESCAS PISS QUEEN (BEER AND WATER INCLUDED)': 'Aguas Frescas Wet Play Party',
  'SOMBRAS DE MI BARRIO - ART SHOW OPENING': 'Sombras de Mi Barrio',
  'ANYTHING GOES - MR CUERO CONTEST AND AFTER PARTY': 'Mr Cuero Contest & After Party',
}

const IGNORED_PRODUCTS = [
  'ENCUERADO T SHIRT',
  'ENCUERADO PIN',
]

function classifyTicket(label) {
  const key = label.trim()
  if (key === 'ENCUERADO WEEKEND PASS') return { type: 'weekend_pass', access: 'Weekend', passCount: 1, vip: false }
  if (key === 'ENCUERADO WEEKEND VIP PASS') return { type: 'vip_pass', access: 'VIP', passCount: 2, vip: true, unclaimed: 1 }
  if (key === 'BE A SPONSOR') return { type: 'sponsor_package', access: 'Sponsor', passCount: 1, review: true }
  if (IGNORED_PRODUCTS.includes(key)) return { type: 'addon', access: 'None', passCount: 0 }
  if (INDIVIDUAL_TICKET_MAP[key]) return { type: 'individual_event', access: 'Individual', passCount: 1, eventTitle: INDIVIDUAL_TICKET_MAP[key] }
  return { type: 'unknown', access: '?', passCount: 1, review: true }
}

// ===== MANUAL ACTUAL 2026 PAID ORDER FIXTURE =====

const MANUAL_FIXTURE = {
  source: 'MANUAL_ACTUAL_2026_ORDER_FIXTURE',
  payload: {
    eventType: 'registration',
    data: {
      id: '0077587274',
      orderNumber: '0077587274',
      orderStatus: 'completed',
      total: 156.27,
      formName: 'Encuerado Weekend 2026',
      registrationTimestamp: '2026-06-27T17:29:00Z', // approximate
      billing: {
        name: { first: '[REDACTED]', last: '[REDACTED]' },
        email: '[REDACTED]',
        phone: '[REDACTED]',
      },
      registrants: [
        {
          data: [
            {
              key: 'tshirtSize',
              label: 'T-Shirt Size',
              value: 'xl',
              optionLabel: 'XL',
            },
          ],
        },
      ],
      tickets: [
        {
          id: '01KW522H810WNSD7K46',
          lookupId: 'MANUAL-0077587274-1',
          ticketKey: 'weekendPass',
          ticketLabel: 'ENCUERADO WEEKEND PASS',
          amount: 156.27,
          fee: 6.27,
          total: 156.27,
        },
      ],
    },
  },
}

// ===== MAIN =====

async function main() {
  // Fetch events from DB for matching
  const events = await prisma.event.findMany({ select: { id: true, title: true } })
  const eventByTitle = new Map(events.map(e => [e.title, e]))
  const findEvent = (title) => {
    if (eventByTitle.has(title)) return eventByTitle.get(title)
    for (const [evTitle, ev] of eventByTitle) {
      if (evTitle.toLowerCase() === title.toLowerCase()) return ev
    }
    for (const [evTitle, ev] of eventByTitle) {
      if (evTitle.toLowerCase().includes(title.toLowerCase())) return ev
    }
    return null
  }

  // Verify all package events exist
  for (const pkgTitle of PACKAGE_EVENT_TITLES) {
    if (!findEvent(pkgTitle)) {
      console.warn(`WARNING: Package event not found: "${pkgTitle}" — will be marked as missing`)
    }
  }

  // Existing data for preview (read-only)
  const existingEmails = new Set(
    (await prisma.member.findMany({ select: { email: true } })).map(m => m.email.toLowerCase())
  )
  const existingRegs = new Set(
    (await prisma.eventRegistration.findMany({ select: { memberId: true, eventId: true } }))
      .map(r => `${r.memberId}|${r.eventId}`)
  )

  // Fetch latest 50 captured logs
  const logs = await prisma.ticketSpiceWebhookLog.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 50,
    select: { id: true, payloadJson: true, rawBody: true, eventType: true, receivedAt: true },
  })

  // Process both captured logs and the manual fixture
  const entries = [
    ...logs.map(log => ({ source: 'captured', logId: log.id, payload: log.payloadJson || (log.rawBody ? JSON.parse(log.rawBody) : null) })),
    { source: MANUAL_FIXTURE.source, logId: null, payload: MANUAL_FIXTURE.payload },
  ]

  let totalLogs = 0, totalOrders = 0, totalTickets = 0
  let testOrFreeOrders = 0
  let wouldCreateAttendees = 0, wouldUpdateAttendees = 0
  let wouldCreateParticipation = 0
  let wouldCreateRegs = 0
  let addonsIgnored = 0
  let needsReview = 0

  for (const entry of entries) {
    const payload = entry.payload
    if (!payload || typeof payload !== 'object') continue

    totalLogs++
    const data = payload.data
    if (!data || payload.eventType !== 'registration' || data.orderStatus !== 'completed') continue

    // Check test/free orders
    const isTestFree = data.total === 0 || data.orderNumber === 'NCRDWKND2026-XZT0002'
    if (isTestFree) {
      testOrFreeOrders++
      console.log(`\n${'='.repeat(70)}`)
      console.log(`[TEST/FREE ORDER] (skipped from counts)`)
      console.log(`Source: ${entry.source}${entry.logId ? ' (log: ' + shortId(entry.logId) + ')' : ''}`)
      console.log(`Order Number: ${data.orderNumber} | Total: ${data.total}`)
      console.log(`This order will NOT be processed for attendee/registration creation.`)
      continue
    }

    totalOrders++

    console.log(`\n${'='.repeat(70)}`)
    if (entry.source === 'MANUAL_ACTUAL_2026_ORDER_FIXTURE') {
      console.log(`[MANUAL ACTUAL 2026 PAID ORDER FIXTURE]`)
    } else {
      console.log(`Webhook ID: ${entry.logId} | Event Type: ${payload.eventType}`)
    }
    console.log(`Order ID: ${data.id} | Order #: ${data.orderNumber}`)
    console.log(`Form: ${data.formName} | Status: ${data.orderStatus}`)
    console.log(`Timestamp: ${data.registrationTimestamp}`)

    const billing = data.billing
    if (billing) {
      const first = billing.name?.first || ''
      const last = billing.name?.last || ''
      console.log(`Buyer: ${first} ${last}`)
      console.log(`Email: ${maskEmail(billing.email)}  Phone: ${maskPhone(billing.phone)}`)
      const emailLower = billing.email?.toLowerCase()
      if (entry.source === 'MANUAL_ACTUAL_2026_ORDER_FIXTURE') {
        // For fixture, always show redacted note
        console.log(`  → [ACTUAL_2026_PAID_ATTENDEE_REDACTED]`)
        wouldCreateAttendees++ // assume it would be new unless we know otherwise; we don't check fixture email
      } else {
        const existing = emailLower && existingEmails.has(emailLower)
        if (existing) {
          wouldUpdateAttendees++
          console.log(`  → Attendee already exists (would UPDATE)`)
        } else {
          wouldCreateAttendees++
          console.log(`  → Attendee does not exist (would CREATE)`)
        }
      }
    }

    // T-shirt size
    const registrants = data.registrants || []
    for (const reg of registrants) {
      const fields = reg.data || []
      const shirtField = fields.find(f => f.key === 'tshirtSize')
      if (shirtField) {
        const size = shirtField.optionLabel || shirtField.value
        console.log(`T-Shirt Size: ${size ? size.toUpperCase() : '?'}`)
      }
    }

    const tickets = data.tickets || []
    totalTickets += tickets.length

    for (const ticket of tickets) {
      const label = ticket.ticketLabel || 'Unknown'
      const classification = classifyTicket(label)

      console.log(`\n  Ticket: ${label}`)
      console.log(`    ID: ${ticket.id}  Lookup: ${ticket.lookupId}  Key: ${ticket.ticketKey}`)
      console.log(`    Amount: ${ticket.amount}  Fee: ${ticket.fee}  Total: ${ticket.total}`)
      console.log(`    Classification: ${classification.type} / ${classification.access}`)
      console.log(`    Pass Count: ${classification.passCount || 1}`)

      if (classification.review) {
        console.log(`    *** NEEDS MANUAL REVIEW ***`)
        needsReview++
        continue
      }

      if (classification.type === 'addon') {
        console.log(`    -> Add-on only, no event access created`)
        addonsIgnored++
        continue
      }

      // Determine events to register
      let targetEvents = []
      if (classification.type === 'weekend_pass' || classification.type === 'vip_pass') {
        targetEvents = PACKAGE_EVENT_TITLES.map(title => findEvent(title)).filter(Boolean)
        if (targetEvents.length !== PACKAGE_EVENT_TITLES.length) {
          console.log(`    WARNING: Some package events not found in database`)
        }
      } else if (classification.type === 'individual_event' && classification.eventTitle) {
        const ev = findEvent(classification.eventTitle)
        if (ev) targetEvents = [ev]
        else {
          console.log(`    ERROR: Event "${classification.eventTitle}" not found — skipping`)
          needsReview++
          continue
        }
      }

      console.log(`    Would register for ${targetEvents.length} event(s):`)
      for (const ev of targetEvents) {
        console.log(`      - ${ev.title} (event ID: ${shortId(ev.id)}) [new registration]`)
        wouldCreateRegs++
      }

      // Participation record
      console.log(`    Would create 2026 ParticipationRecord (ATTENDEE, source=TicketSpice)`)
      wouldCreateParticipation++

      // VIP unclaimed
      if (classification.unclaimed) {
        console.log(`    VIP: 2 passes, 1 unclaimed (second admission not yet assigned)`)
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`DRY-RUN SUMMARY`)
  console.log(`  Logs scanned: ${totalLogs}`)
  console.log(`  Test/free orders skipped: ${testOrFreeOrders}`)
  console.log(`  Orders processed (actual): ${totalOrders}`)
  console.log(`  Tickets found: ${totalTickets}`)
  console.log(`  Attendees would be CREATED: ${wouldCreateAttendees}`)
  console.log(`  Attendees would be UPDATED: ${wouldUpdateAttendees}`)
  console.log(`  ParticipationRecords would be CREATED: ${wouldCreateParticipation}`)
  console.log(`  EventRegistrations would be CREATED: ${wouldCreateRegs}`)
  console.log(`  Add-ons ignored: ${addonsIgnored}`)
  console.log(`  Manual review needed: ${needsReview}`)
  console.log(``)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
