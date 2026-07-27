import { jwtVerify, SignJWT } from 'jose'

export const SESSION_COOKIE_NAME = 'encuerado_admin_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

type VerifyAdminSessionResult =
  | {
      ok: true
      adminUserId: string
      email: string
    }
  | {
      ok: false
      reason: string
    }

export function getSessionSecretKey() {
  const secret = process.env.SESSION_SECRET

  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.')
  }

  return new TextEncoder().encode(secret)
}

export async function signAdminSessionToken(adminUserId: string, email: string) {
  return new SignJWT({
    adminUserId,
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSessionSecretKey())
}

export async function verifyAdminSessionTokenWithReason(
  token: string
): Promise<VerifyAdminSessionResult> {
  try {
    const verified = await jwtVerify(token, getSessionSecretKey(), {
      algorithms: ['HS256'],
    })
    const adminUserId = String(verified.payload.adminUserId || '')
    const email = String(verified.payload.email || '')

    if (!adminUserId) {
      return { ok: false, reason: 'missing_admin_user_id' }
    }

    return {
      ok: true,
      adminUserId,
      email,
    }
  } catch (error) {
    const reason =
      error instanceof Error && error.name ? error.name : 'verification_failed'

    return { ok: false, reason }
  }
}

export async function verifyAdminSessionToken(token: string) {
  const result = await verifyAdminSessionTokenWithReason(token)

  if (!result.ok) {
    return null
  }

  return {
    adminUserId: result.adminUserId,
    email: result.email,
  }
}
