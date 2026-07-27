import { prisma } from './prisma'
import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendRegistrationConfirmation(
  memberId: string,
  eventTitle: string,
  eventDate: string,
  eventLocation?: string
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, firstName: true },
  })
  if (!member) return

  const subject = `Registration Confirmed: ${eventTitle}`

  const safeFirstName = escapeHtml(member.firstName)
  const safeEventTitle = escapeHtml(eventTitle)
  const safeEventDate = escapeHtml(eventDate)
  const safeEventLocation = eventLocation ? escapeHtml(eventLocation) : null

  const html = `
    <h2>Hello ${safeFirstName},</h2>
    <p>You have been registered for <strong>${safeEventTitle}</strong>.</p>
    <p><strong>Date:</strong> ${safeEventDate}</p>
    ${safeEventLocation ? `<p><strong>Location:</strong> ${safeEventLocation}</p>` : ''}
    <p>We look forward to seeing you there!</p>
    <p>— Encuerado Team</p>
  `

  try {
    const fromEmail = getFromEmail()
    await withRetry(async () => {
      const { error } = await getResendClient().emails.send({
        from: fromEmail,
        to: [member.email],
        subject,
        html,
      })

      // Resend's SDK doesn't throw on API-level errors (invalid recipient,
      // rate limit, etc.) — it returns them on `error` instead. Without this
      // check, a failed send was previously logged as "Sent" below.
      if (error) throw error
    })

    await prisma.emailLog.create({
      data: {
        memberId,
        status: 'Sent',
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Registration confirmation failed.'
    console.error('[sendRegistrationConfirmation]', errorMessage, { memberId })
    await prisma.emailLog.create({
      data: {
        memberId,
        status: 'Failed',
        error: errorMessage,
      },
    })
  }
}