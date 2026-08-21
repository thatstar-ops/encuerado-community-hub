import { prisma } from '@/lib/prisma'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCarneAsadaPurchase(productName: string | null | undefined) {
  return normalize(productName).includes('CARNE ASADA')
}

function isAguaFrescaPurchase(productName: string | null | undefined) {
  const name = normalize(productName)

  return (
    name.includes('AGUAS FRESCAS') ||
    name.includes('AGUA FRESCA') ||
    name.includes('PISS QUEEN')
  )
}

function readNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function dollarsToCents(value: number) {
  return Math.round(value * 100)
}

function extractDonationCents(raw: any) {
  const ticketData = Array.isArray(raw?.data) ? raw.data : []

  for (const item of ticketData) {
    if (item?.key === 'donation' && Array.isArray(item.repeater)) {
      for (const repeated of item.repeater) {
        const donationAmount = readNumber(repeated?.amount?.value)

        if (donationAmount !== null && donationAmount > 0) {
          return dollarsToCents(donationAmount)
        }
      }
    }
  }

  const directDonation = readNumber(raw?.donationAmount)
  if (directDonation !== null && directDonation > 0) {
    return dollarsToCents(directDonation)
  }

  return null
}

function ticketSpiceAmountToCents(value: unknown) {
  const amount = readNumber(value)

  if (amount === null || amount <= 0) return null

  // TicketSpice raw ticket amount is coming through as dollars:
  // 30 means $30, 50 means $50, 1000 means $1000.
  return dollarsToCents(amount)
}

// TicketSpice includes a per-ticket fee breakdown inside rawProductJson.data,
// e.g. { key: "fee", type: "lineItem", appFeeTotal: "2.77" }. This is the
// processing fee passed through to the buyer on top of the ticket price
// (amount + fee = total). Used to derive a fee-exclusive "ticket price"
// figure straight from what was actually charged, instead of trusting the
// static raw.amount field (see baseTicketAmountCents for why that field
// alone isn't safe when a coupon was applied).
function feeCentsFromRaw(raw: any): number | null {
  const items = Array.isArray(raw?.data) ? raw.data : []

  for (const item of items) {
    if (item?.key === 'fee') {
      const feeAmount = readNumber(item?.appFeeTotal)
      if (feeAmount !== null && feeAmount >= 0) return dollarsToCents(feeAmount)
    }
  }

  return null
}

function baseTicketAmountCents(purchase: {
  amountPaidCents: number | null
  productName: string | null
  purchaseType: string | null
  productCategory: string | null
  rawProductJson: unknown
  passCount: number
}) {
  const raw = purchase.rawProductJson as any

  const isSponsor =
    normalize(purchase.purchaseType).includes('SPONSOR') ||
    normalize(purchase.productCategory).includes('SPONSOR') ||
    normalize(purchase.productName).includes('SPONSOR')

  if (isSponsor) {
    const donationCents = extractDonationCents(raw)
    if (donationCents !== null) return donationCents
  }

  // Prefer the amount actually charged for this specific purchase minus its
  // TicketSpice processing fee. amountPaidCents already reflects whatever
  // was really collected - including coupon/discount codes applied at
  // checkout - whereas rawProductJson.amount is a static per-ticket list
  // price that does NOT get rewritten when a coupon is used. Relying on
  // raw.amount alone silently overstates revenue on any discounted order
  // (confirmed: an ENCWKD25 coupon order billed $45.01 total but its ticket
  // line item still reported amount=50/total=52.77 as if full price).
  if (purchase.amountPaidCents) {
    const feeCents = feeCentsFromRaw(raw)
    if (feeCents !== null) {
      return Math.max(0, purchase.amountPaidCents - feeCents)
    }
  }

  // Prefer the real TicketSpice line-item amount over a hardcoded price.
  // Ticket prices change over a sale window (Carne Asada went from $30 to
  // $50 partway through 2026 sales) - a flat constant goes stale the moment
  // pricing changes. This is already the fee-exclusive total TicketSpice
  // billed for this line item, so do NOT multiply by passCount here:
  // passCount can mean "this ticket type admits N people" (VIP Pass = 2)
  // rather than "N of these were bought at this price."
  const rawAmount = ticketSpiceAmountToCents(raw?.amount)
  if (rawAmount !== null) return rawAmount

  const rawPricePointAmount = ticketSpiceAmountToCents(raw?.pricePoint?.amount)
  if (rawPricePointAmount !== null) return rawPricePointAmount

  const rawPricePointPrice = ticketSpiceAmountToCents(raw?.pricePoint?.price)
  if (rawPricePointPrice !== null) return rawPricePointPrice

  // Manual entries: trust whatever was actually collected, if recorded.
  // Stored as a total for the whole entry already, not per-ticket.
  if (purchase.amountPaidCents) return purchase.amountPaidCents

  // No hardcoded price fallback on purpose: a flat guess (e.g. "Carne Asada
  // is $30") silently goes stale the moment pricing changes, and would
  // report a number nobody actually charged or collected. If we have
  // neither real webhook data nor a recorded amount for this purchase, the
  // honest answer is $0, not a guess - it'll show up here as a gap to
  // investigate rather than a plausible-looking wrong number.
  return 0
}

export async function AdminMoneyTallies() {
  const purchases = await prisma.ticketPurchase.findMany({
    where: {
      paymentStatus: {
        in: ['Paid', 'paid', 'PAID', 'Completed', 'completed', 'COMPLETED'],
      },
    },
    select: {
      amountPaidCents: true,
      productName: true,
      purchaseType: true,
      productCategory: true,
      rawProductJson: true,
      passCount: true,
    },
  })

  const purchasesWithBaseAmounts = purchases.map((purchase) => ({
    ...purchase,
    baseAmountCents: baseTicketAmountCents(purchase),
  }))

  const carneAsadaCents = purchasesWithBaseAmounts
    .filter((purchase) => isCarneAsadaPurchase(purchase.productName))
    .reduce((sum, purchase) => sum + purchase.baseAmountCents, 0)

  const aguaFrescaCents = purchasesWithBaseAmounts
    .filter((purchase) => isAguaFrescaPurchase(purchase.productName))
    .reduce((sum, purchase) => sum + purchase.baseAmountCents, 0)

  const allExceptCarneAsadaCents = purchasesWithBaseAmounts
    .filter((purchase) => !isCarneAsadaPurchase(purchase.productName))
    .reduce((sum, purchase) => sum + purchase.baseAmountCents, 0)

  const allCents = purchasesWithBaseAmounts.reduce(
    (sum, purchase) => sum + purchase.baseAmountCents,
    0
  )

  const cards = [
    {
      label: 'Carne Asada',
      amount: carneAsadaCents,
      helper: 'Ticket price only, no TicketSpice fees',
    },
    {
      label: 'Agua Fresca',
      amount: aguaFrescaCents,
      helper: 'Ticket price only, no TicketSpice fees',
    },
    {
      label: 'All except Carne Asada',
      amount: allExceptCarneAsadaCents,
      helper: 'All other tickets, passes, and sponsors',
    },
    {
      label: 'All',
      amount: allCents,
      helper: 'All ticket sales, passes, and sponsors',
    },
  ]

  return (
    <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-white/10 bg-[#16090B] p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-lg font-black text-black">
              $
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-white/60">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-black text-white">
                {money(card.amount)}
              </p>
              <p className="mt-1 text-xs text-white/50">{card.helper}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}