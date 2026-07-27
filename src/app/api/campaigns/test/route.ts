import { NextRequest, NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { getFromEmail, getResendClient } from '@/lib/resend-client'
import { renderCampaignHtml } from '@/lib/campaign-content'

function readableError(error: unknown) {
  if (error instanceof Error) return error.message

  if (error && typeof error === 'object') {
    const anyError = error as any

    return (
      anyError.message ||
      anyError.error ||
      anyError.name ||
      JSON.stringify(anyError)
    )
  }

  return String(error || 'Test email could not be sent.')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildFallbackHtml(subject: string, body: string) {
  const safeSubject = escapeHtml(subject || 'Campaign Test')
  const safeBody = escapeHtml(body || 'This is a test email from ENCUERADO.').replaceAll(
    '\n',
    '<br />'
  )

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1>${safeSubject}</h1>
      <p>${safeBody}</p>
      <hr />
      <p style="font-size: 12px; color: #6b7280;">This is a test email.</p>
    </div>
  `
}

export async function POST(req: NextRequest) {
  try {
    await requireNonCheckInAdmin()

    const { to, subject, body, content } = await req.json()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) {
      return NextResponse.json(
        { error: 'Enter a valid test email address.' },
        { status: 400 }
      )
    }

    const fromEmail = getFromEmail()
    const subjectText = String(subject || 'Campaign Test')
    const bodyText = String(body || '')

    let html = renderCampaignHtml(content, bodyText).replace(
      '{{unsubscribe_link}}',
      '#'
    )

    if (!html || !html.trim()) {
      html = buildFallbackHtml(subjectText, bodyText)
    }

    const result = await getResendClient().emails.send({
      from: fromEmail,
      to: [String(to)],
      subject: '[TEST] ' + subjectText,
      html,
      text: bodyText || 'This is a test email from ENCUERADO.',
    })

    if (result.error) {
      const message = readableError(result.error)

      console.error('[test-email][resend-error]', {
        message,
        resendError: result.error,
        fromEmail,
        to,
      })

      return NextResponse.json(
        {
          error: message,
          fromEmail,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: 'Sent',
      id: result.data?.id || null,
      fromEmail,
    })
  } catch (error) {
    const message = readableError(error)

    console.error('[test-email][catch]', {
      message,
      error,
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}