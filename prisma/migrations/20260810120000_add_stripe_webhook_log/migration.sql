-- Raw capture table for Stripe webhook events, mirroring
-- TicketSpiceWebhookLog. Stripe events are signature-verified before being
-- logged (see src/app/api/webhooks/stripe/route.ts). stripeEventId is
-- unique so Stripe's documented at-least-once delivery / retry behavior
-- can't create duplicate rows for the same event.
CREATE TABLE IF NOT EXISTS "StripeWebhookLog" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT,
    "eventType" TEXT,
    "headersJson" JSONB,
    "payloadJson" JSONB,
    "lineItemsJson" JSONB,
    "rawBody" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'captured',
    "error" TEXT,

    CONSTRAINT "StripeWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookLog_stripeEventId_key" ON "StripeWebhookLog"("stripeEventId");
