import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processEligibleOrders } from '@/lib/ticketspice/process-eligible-orders'
import { sendOpsAlert } from '@/lib/ops-alerts'

function headersToObject(request: NextRequest) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}

function queryParamsToObject(request: NextRequest) {
  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}

function extractEventType(payloadJson: unknown, headers: Record<string, string>) {
  if (headers['x-ticketspice-event']) return headers['x-ticketspice-event']
  if (headers['x-event-type']) return headers['x-event-type']

  if (typeof payloadJson === 'object' && payloadJson !== null) {
    const payload = payloadJson as Record<string, unknown>

    const possibleFields = [
      'event',
      'eventType',
      'event_type',
      'type',
      'action',
      'trigger',
    ]

    for (const field of possibleFields) {
      if (payload[field]) return String(payload[field])
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  // TicketSpice ticket sales are finished, so this endpoint is CLOSED by
  // default. It has no signature verification (unlike the Stripe webhook)
  // and it auto-creates real TicketPurchase and Member rows from whatever
  // is posted - leaving it open let anyone manufacture paid tickets.
  // To re-open it, set TICKETSPICE_WEBHOOK_ENABLED=true in Vercel.
  if (process.env.TICKETSPICE_WEBHOOK_ENABLED !== 'true') {
    console.warn('[ticketspice] rejected inbound webhook - endpoint disabled', {
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json(
      { ok: false, error: 'This endpoint is no longer accepting webhooks.' },
      { status: 403 }
    )
  }

  try {
    const headersJson = headersToObject(request)
    const queryParamsJson = queryParamsToObject(request)
    const rawBody = await request.text()

    let payloadJson: unknown = null
    let status = 'captured_raw'

    try {
      payloadJson = JSON.parse(rawBody)
      status = 'captured'
    } catch {
      payloadJson = null
    }

    const eventType = extractEventType(payloadJson, headersJson)

    const webhookLog = await prisma.ticketSpiceWebhookLog.create({
      data: {
        eventType,
        headersJson,
        queryParamsJson,
        payloadJson: payloadJson === null ? undefined : (payloadJson as object),
        rawBody,
        status,
      },
    })

    let processingSummary = null

    try {
      processingSummary = await processEligibleOrders(false, webhookLog.id)
    } catch (processingError) {
      const errorMessage =
        processingError instanceof Error
          ? processingError.message
          : 'Automatic processing failed.'

      console.error('TicketSpice automatic processing error:', processingError)

      await prisma.ticketSpiceWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      })

      // Awaited on purpose: Vercel can freeze/kill the function once the
      // response is sent, so a fire-and-forget call here risks the alert
      // never actually going out. sendOpsAlert never throws, so this can't
      // fail the webhook response.
      await sendOpsAlert('TicketSpice webhook processing failed', [
        `Webhook log ID: ${webhookLog.id}`,
        `Error: ${errorMessage}`,
        'The raw order was captured but never turned into a member/ticket record. Check /admin/ticketspice-webhooks to review and reprocess.',
      ])
    }

    return NextResponse.json(
      {
        ok: true,
        captured: true,
        automaticallyProcessed: Boolean(
          processingSummary && processingSummary.logsMarkedProcessed > 0
        ),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('TicketSpice webhook capture error:', error)

    return NextResponse.json(
      { ok: false, captured: false, error: 'Webhook capture failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: 'TicketSpice webhook endpoint is active' },
    { status: 200 }
  )
}
