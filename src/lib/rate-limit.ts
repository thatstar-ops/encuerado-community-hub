import { headers } from 'next/headers'
import { prisma } from './prisma'

// Lightweight DB-backed rate limiting: one row per attempt, keyed by
// whatever the caller passes in (IP, email, a combination, etc.). No new
// external dependencies (Redis/Upstash) — just a small indexed table
// (`RateLimitAttempt`, see prisma/schema.prisma) that we count against a
// rolling time window.
//
// Not built for high QPS abuse-at-scale — it's meant to stop the easy case
// (a script hammering /admin/login or the volunteer signup form), not a
// distributed attack. If this app ever needs that, reach for Upstash/Vercel
// KV instead.

export async function getClientIp(): Promise<string> {
  const h = await headers()

  // Vercel sets x-forwarded-for on every request; take the first (client) hop.
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}

/**
 * Checks whether `key` has hit `max` attempts within the last `windowMinutes`.
 * If not limited, records this attempt. Call this once per request you want
 * to gate (e.g. once per login POST, once per form submission).
 */
export async function checkRateLimit(
  key: string,
  { max, windowMinutes }: { max: number; windowMinutes: number }
): Promise<{ limited: boolean }> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const count = await prisma.rateLimitAttempt.count({
    where: { key, createdAt: { gte: since } },
  })

  if (count >= max) {
    return { limited: true }
  }

  await prisma.rateLimitAttempt.create({ data: { key } })

  return { limited: false }
}
