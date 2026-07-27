import { prisma } from './prisma'
import { getFromEmail, getResendClient } from './resend-client'
import { withRetry } from './with-retry'

export async function sendPromotionalEmail({
  to,
  subject,
  html,
  memberId,
  campaignId,
}: {
  to: string
  subject: string
  html: string
  memberId: string
  campaignId: string
}) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { unsubscribeToken: true, promotionalEmailOptOut: true },
  })

  if (!member || member.promotionalEmailOptOut) {
    return { status: 'Skipped', reason: 'Opted out or not found' }
  }

  let token = member.unsubscribeToken
  if (!token) {
    token = crypto.randomUUID()
    await prisma.member.update({
      where: { id: memberId },
      data: { unsubscribeToken: token },
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const unsubscribeLink = `${baseUrl}/unsubscribe/${token}`
  const htmlWithUnsubscribe = html.replace('{{unsubscribe_link}}', unsubscribeLink)

  try {
    const fromEmail = getFromEmail()
    await withRetry(async () => {
      const { error } = await getResendClient().emails.send({
        from: fromEmail,
        to: [to],
        subject,
        html: htmlWithUnsubscribe,
      })

      if (error) throw error
    })

    await prisma.emailLog.create({
      data: {
        campaignId,
        memberId,
        status: 'Sent',
      },
    })

    return { status: 'Sent' }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Email sending failed. Please try again later.'

    console.error('[sendPromotionalEmail]', errorMessage, { to, campaignId })

    await prisma.emailLog.create({
      data: {
        campaignId,
        memberId,
        status: 'Failed',
        error: errorMessage,
      },
    })

    return { status: 'Failed', error: errorMessage }
  }
}