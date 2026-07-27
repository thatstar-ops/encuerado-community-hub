'use server'

import { processEligibleOrders } from '@/lib/ticketspice/process-eligible-orders'
import { cleanupIrrelevantWebhookLogs } from '@/lib/ticketspice/cleanup-webhook-logs'
import { redirect } from 'next/navigation'

export async function dryRunAction() {
  const summary = await processEligibleOrders(true)
  const params = new URLSearchParams({
    dryRunResult: JSON.stringify(summary),
  })
  redirect(`/admin/ticketspice-webhooks?${params.toString()}`)
}

export async function processEligibleOrdersAction(formData: FormData) {
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
