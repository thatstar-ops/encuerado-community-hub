import { Resend } from 'resend'

let resend: Resend | null = null

export function getFromEmail(): string {
  const value = process.env.FROM_EMAIL?.trim()
  if (!value) {
    throw new Error('FROM_EMAIL is missing.')
  }
  return value
}

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing.')
  }

  // Detect common placeholder values
  if (
    apiKey === 'PASTE_YOUR_RESEND_API_KEY_HERE' ||
    apiKey === 'PASTE_REAL_RESEND_KEY_HERE' ||
    apiKey === 're_xxxxxxxx' ||
    apiKey.startsWith('re_') === false
  ) {
    throw new Error('RESEND_API_KEY is still a placeholder. Replace it with the real Resend key.')
  }

  resend ??= new Resend(apiKey)
  return resend
}