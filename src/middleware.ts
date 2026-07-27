import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  verifyAdminSessionTokenWithReason,
} from '@/lib/admin-session'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  const publicPaths = [
    '/login',
    '/admin/login',
    '/api/email/unsubscribe',
    '/_next',
    '/favicon.ico',
  ]
  if (publicPaths.some(p => path.startsWith(p)) || path === '/') {
    return NextResponse.next()
  }

  if (path.startsWith('/admin')) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = token ? await verifyAdminSessionTokenWithReason(token) : null

    if (!session?.ok) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('redirect', `${path}${request.nextUrl.search}`)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
