// Dumps every active Stripe Product and its Price(s) so we can build the
// Stripe Price ID -> internal ticket-type mapping (the equivalent of
// INDIVIDUAL_TICKET_ALIASES in src/lib/ticketspice/process-eligible-orders.ts,
// but keyed on Stripe Price IDs instead of TicketSpice ticket labels).
//
// Read-only. Makes no changes in Stripe or the database.
//
// Usage:
//   npm install stripe          (one-time, if not already installed)
//   node scripts/list-stripe-products.mjs
//
// Needs STRIPE_SECRET_KEY set - either in your shell environment, or in a
// .env / .env.local file in the project root (this script loads dotenv the
// same way the rest of the app does).

import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import Stripe from 'stripe'

// Plain `dotenv/config` only loads `.env`, not `.env.local` - but this
// project (like any Next.js app) keeps local secrets in `.env.local`.
// Load both, in the same priority order Next.js itself uses: `.env.local`
// wins over `.env` when a key is defined in both.
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
loadEnv({ path: path.join(projectRoot, '.env') })
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true })

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  console.error('STRIPE_SECRET_KEY is not set. Add it to your .env / .env.local, or run:')
  console.error('  STRIPE_SECRET_KEY=sk_live_... node scripts/list-stripe-products.mjs')
  process.exit(1)
}

const stripe = new Stripe(secretKey)

async function main() {
  console.log(`Using Stripe key: ${secretKey.startsWith('sk_live') ? 'LIVE MODE' : 'TEST MODE'} (${secretKey.slice(0, 12)}...)\n`)

  const products = await stripe.products.list({ active: true, limit: 100 })

  console.log(`Found ${products.data.length} active product(s).\n`)

  for (const product of products.data) {
    console.log('='.repeat(80))
    console.log(`Product: "${product.name}"`)
    console.log(`  id: ${product.id}`)
    if (product.description) console.log(`  description: ${product.description}`)
    if (Object.keys(product.metadata || {}).length) {
      console.log(`  metadata: ${JSON.stringify(product.metadata)}`)
    }

    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })

    for (const price of prices.data) {
      const amount =
        price.unit_amount !== null ? `$${(price.unit_amount / 100).toFixed(2)}` : '(custom/variable amount)'
      console.log(`  Price: ${price.id}`)
      console.log(`    amount: ${amount}  currency: ${price.currency}  type: ${price.type}`)
      if (Object.keys(price.metadata || {}).length) {
        console.log(`    metadata: ${JSON.stringify(price.metadata)}`)
      }
    }
    console.log('')
  }

  // Also list any active Payment Links, since those are the most likely way
  // tickets are actually being sold right now, and each one ties a specific
  // URL to specific Price ID(s).
  const paymentLinks = await stripe.paymentLinks.list({ active: true, limit: 100 })

  console.log('='.repeat(80))
  console.log(`Found ${paymentLinks.data.length} active Payment Link(s).\n`)

  for (const link of paymentLinks.data) {
    console.log(`Payment Link: ${link.url}`)
    console.log(`  id: ${link.id}`)
    const lineItems = await stripe.paymentLinks.listLineItems(link.id, { limit: 100 })
    for (const item of lineItems.data) {
      console.log(`    price=${item.price?.id}  product=${item.price?.product}  qty=${item.quantity}`)
    }
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
