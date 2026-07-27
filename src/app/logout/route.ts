import { NextResponse } from 'next/server'
import { clearAdminSession } from '@/lib/auth'

export async function POST(request: Request) {
  await clearAdminSession()

  return NextResponse.redirect(new URL('/', request.url))
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/admin', request.url))
}
