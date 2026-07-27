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

function knownBasePriceCents(productName: string | null | undefined) {
  const name = normalize(productName)

  if (name.includes('CARNE ASADA')) return 3000

  if (
    name.includes('AGUAS FRESCAS') ||
    name.includes('AGUA FRESCA') ||
    name.includes('PISS QUEEN')
  ) {
    return 5000
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

function baseTicketAmountCents(purchase: {
  amountPaidCents: number | null
  productName: string | null
  purchaseType: string | null
  productCategory: string | null
  rawProductJson: unknown
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

  const knownPrice = knownBasePriceCents(purchase.productName)
  if (knownPrice !== null) return knownPrice

  const rawAmount = ticketSpiceAmountToCents(raw?.amount)
  if (rawAmount !== null) return rawAmount

  const rawPricePointAmount = ticketSpiceAmountToCents(raw?.pricePoint?.amount)
  if (rawPricePointAmount !== null) return rawPricePointAmount

  const rawPricePointPrice = ticketSpiceAmountToCents(raw?.pricePoint?.price)
  if (rawPricePointPrice !== null) return rawPricePointPrice

  // Last fallback for older records without raw TicketSpice details.
  // This may include TicketSpice fees, so use rawProductJson whenever available.
  return purchase.amountPaidCents || 0
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