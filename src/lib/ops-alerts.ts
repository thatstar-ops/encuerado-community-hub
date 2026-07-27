import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'

// Fallback only used if OPS_ALERT_EMAIL isn't set in the environment.
const DEFAULT_ALERT_EMAIL = 'hosingfung@gmail.com'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getAlertEmail() {
  return process.env.OPS_ALERT_EMAIL?.trim() || DEFAULT_ALERT_EMAIL
}

/**
 * Best-effort internal ops notification (not member-facing). Used for
 * things like "a TicketSpice webhook failed to process" or "an order is
 * stuck unprocessed" - operational problems a human needs to notice without
 * having to remember to check an admin page.
 *
 * Never throws - a failure to send an alert should never crash whatever
 * background job or webhook handler triggered it.
 */
export async function sendOpsAlert(subject: string, bodyLines: string[]) {
  try {
    const fromEmail = getFromEmail()
    const to = getAlertEmail()

    const html =
      `<h2>${escapeHtml(subject)}</h2>` +
      bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')

    await withRetry(async () => {
      const { error } = await getResendClient().emails.send({
        from: fromEmail,
        to: [to],
        subject: `[Encuerado Ops] ${subject}`,
        html,
      })

      if (error) throw error
    })
  } catch (error) {
    console.error('[sendOpsAlert] failed to send alert email', error)
  }
}
