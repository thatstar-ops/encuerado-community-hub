'use server'

import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processStripeEligibleOrders } from '@/lib/stripe/process-eligible-orders'

export async function dryRunStripeAction() {
  // These reprocess/delete real ticket + member records. The admin pages
  // that render them already require SUPER_ADMIN, but a server action is
  // reachable as its own endpoint regardless of what the UI shows, so the
  // real check has to live here too.
  await requireSuperAdmin()

  const summary = await processStripeEligibleOrders(true)
  const params = new URLSearchParams({ dryRunResult: JSON.stringify(summary) })
  redirect(`/admin/stripe-webhooks?${params.toString()}`)
}

// Every Stripe event is auto-processed the moment it's captured (see
// /api/webhooks/stripe), so "process" here really means "retry" - clear the
// failed/stuck logs' processedAt so they're picked up again. Only logs that
// aren't already marked processed are touched.
export async function reprocessStripeFailedAction(formData: FormData) {
  // These reprocess/delete real ticket + member records. The admin pages
  // that render them already require SUPER_ADMIN, but a server action is
  // reachable as its own endpoint regardless of what the UI shows, so the
  // real check has to live here too.
  await requireSuperAdmin()

  const confirmed = formData.get('confirmProcess')
  if (confirmed !== 'yes') {
    redirect(
      '/admin/stripe-webhooks?message=' +
        encodeURIComponent('Please confirm before reprocessing.')
    )
  }

  await prisma.stripeWebhookLog.updateMany({
    where: { processedAt: null, status: 'failed' },
    data: { status: 'captured', error: null },
  })

  const summary = await processStripeEligibleOrders(false)
  const params = new URLSearchParams({ processResult: JSON.stringify(summary) })
  redirect(`/admin/stripe-webhooks?${params.toString()}`)
}
