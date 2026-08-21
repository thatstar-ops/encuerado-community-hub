// Checks what customer info each active Stripe Payment Link actually
// collects at checkout (name, phone, custom fields) - needed to know
// whether the Stripe order processor can build a real Member record the
// same way the TicketSpice pipeline does, or needs a fallback.
//
// Read-only. No changes made.
//
// Usage:
//   node scripts/inspect-stripe-payment-links.mjs

import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import Stripe from 'stripe'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
loadEnv({ path: path.join(projectRoot, '.env') })
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true })

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY is not set.')
  process.exit(1)
}

const stripe = new Stripe(secretKey)

async function main() {
  const links = await stripe.paymentLinks.list({ active: true, limit: 100 })

  // Group by underlying price so we only print each distinct configuration once.
  const seenPriceIds = new Set()

  for (const link of links.data) {
    const lineItems = await stripe.paymentLinks.listLineItems(link.id, { limit: 100 })
    const priceId = lineItems.data[0]?.price?.id || 'unknown'

    if (seenPriceIds.has(priceId)) continue
    seenPriceIds.add(priceId)

    const full = await stripe.paymentLinks.retrieve(link.id)

    console.log('='.repeat(80))
    console.log(`Payment Link: ${full.url}`)
    console.log(`  price: ${priceId}`)
    console.log(`  phone_number_collection.enabled: ${full.phone_number_collection?.enabled}`)
    console.log(`  billing_address_collection: ${full.billing_address_collection}`)
    console.log(`  custom_fields: ${JSON.stringify(full.custom_fields, null, 2)}`)
    console.log(`  submit_type: ${full.submit_type}`)
    console.log(`  allow_promotion_codes: ${full.allow_promotion_codes}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
