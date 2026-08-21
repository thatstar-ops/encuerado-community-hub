'use server'

import { processEligibleOrders } from '@/lib/ticketspice/process-eligible-orders'
import { cleanupIrrelevantWebhookLogs } from '@/lib/ticketspice/cleanup-webhook-logs'
import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/auth'

export async function dryRunAction() {
  // These reprocess/delete real ticket + member records. The admin pages
  // that render them already require SUPER_ADMIN, but a server action is
  // reachable as its own endpoint regardless of what the UI shows, so the
  // real check has to live here too.
  await requireSuperAdmin()

  const summary = await processEligibleOrders(true)
  const params = new URLSearchParams({
    dryRunResult: JSON.stringify(summary),
  })
  redirect(`/admin/ticketspice-webhooks?${params.toString()}`)
}

export async function processEligibleOrdersAction(formData: FormData) {
  // These reprocess/delete real ticket + member records. The admin pages
  // that render them already require SUPER_ADMIN, but a server action is
  // reachable as its own endpoint regardless of what the UI shows, so the
  // real check has to live here too.
  await requireSuperAdmin()

  const confirmed = formData.get('confirmProcess')
  if (confirmed !== 'yes') {
    redirect(
      '/admin/ticketspice-webhooks?message=' +
        encodeURIComponent('Please confirm before processing eligible orders.')
    )
  }

  const summary = await processEligibleOrders(false)
  const params = new URLSearchParams({
    processResult: JSON.stringify(summary),
  })
  redirect(`/admin/ticketspice-webhooks?${params.toString()}`)
}


export async function cleanupIrrelevantWebhookLogsAction(formData: FormData) {
  // These reprocess/delete real ticket + member records. The admin pages
  // that render them already require SUPER_ADMIN, but a server action is
  // reachable as its own endpoint regardless of what the UI shows, so the
  // real check has to live here too.
  await requireSuperAdmin()

  const confirmed = formData.get('confirmCleanup')
  if (confirmed !== 'yes') {
    redirect('/admin/ticketspice-webhooks?message=' + encodeURIComponent('Please confirm before deleting old irrelevant webhook logs.'))
  }

  const summary = await cleanupIrrelevantWebhookLogs(30, false)
  const params = new URLSearchParams({
    cleanupResult: JSON.stringify(summary),
  })
  redirect(`/admin/ticketspice-webhooks?${params.toString()}`)
}
