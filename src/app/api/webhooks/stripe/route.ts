import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { processStripeEligibleOrders } from '@/lib/stripe/process-eligible-orders'
import { sendOpsAlert } from '@/lib/ops-alerts'

// Stripe's signature verification needs the Node crypto module and the raw
// (unparsed) request body - must run on the Node runtime, not Edge.
export const runtime = 'nodejs'

function headersToObject(request: NextRequest) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }
  return new Stripe(secretKey)
}

// checkout.session.completed fires for card payments; async_payment_succeeded
// covers delayed-notification methods (ACH, etc.) that don't confirm
// instantly. Both mean "this order is paid, go process it."
const RELEVANT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const headersJson = headersToObject(request)
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured.')
    return NextResponse.json(
      { ok: false, error: 'Webhook not configured' },
      { status: 500 }
    )
  }

  if (!signature) {
    return NextResponse.json(
      { ok: false, error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    const stripe = getStripeClient()
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
  }

  // Stripe explicitly documents at-least-once delivery - the same event can
  // (and will) arrive more than once. stripeEventId has a unique constraint
  // as the real guard; this check just avoids a noisy failed insert.
  const existing = await prisma.stripeWebhookLog.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  })

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
  }

  // The webhook payload for checkout.session.completed only has a session
  // summary (amount_total, customer_details, metadata) - not what was
  // actually purchased. Line items have to be fetched separately.
  let lineItemsJson: unknown = null

  if (RELEVANT_EVENT_TYPES.has(event.type)) {
    try {
      const session = event.data.object as Stripe.Checkout.Session
      const stripe = getStripeClient()
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price.product'],
        limit: 100,
      })
      lineItemsJson = lineItems.data as unknown as object
    } catch (lineItemError) {
      console.error('Failed to fetch Stripe checkout line items:', lineItemError)
    }
  }

  const webhookLog = await prisma.stripeWebhookLog.create({
    data: {
      stripeEventId: event.id,
      eventType: event.type,
      headersJson,
      payloadJson: event as unknown as object,
      lineItemsJson: lineItemsJson === null ? undefined : (lineItemsJson as object),
      rawBody,
      status: 'captured',
    },
  })

  let processingSummary = null

  try {
    processingSummary = await processStripeEligibleOrders(false, webhookLog.id)
  } catch (processingError) {
    const errorMessage =
      processingError instanceof Error ? processingError.message : 'Automatic processing failed.'

    console.error('Stripe webhook processing error:', processingError)

    await prisma.stripeWebhookLog.update({
      where: { id: webhookLog.id },
      data: { status: 'failed', error: errorMessage },
    })

    // Awaited on purpose: Vercel can freeze/kill the function once the
    // response is sent, so a fire-and-forget call here risks the alert
    // never actually going out. sendOpsAlert never throws, so this can't
    // fail the webhook response.
    await sendOpsAlert('Stripe webhook processing failed', [
      `Webhook log ID: ${webhookLog.id}`,
      `Event type: ${event.type}`,
      `Error: ${errorMessage}`,
      'The raw order was captured but never turned into a member/ticket record. Check /admin/stripe-webhooks to review and reprocess.',
    ])
  }

  return NextResponse.json(
    {
      ok: true,
      captured: true,
      eventType: event.type,
      automaticallyProcessed: Boolean(processingSummary && processingSummary.logsMarkedProcessed > 0),
    },
    { status: 200 }
  )
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: 'Stripe webhook endpoint is active' },
    { status: 200 }
  )
}
