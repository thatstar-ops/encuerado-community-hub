'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar({
  isSuperAdmin,
  isCheckIn,
}: {
  isSuperAdmin: boolean
  isCheckIn: boolean
}) {
  const pathname = usePathname()

  // Hide the normal admin banner on contest voting pages.
  // Voting admin should only see the voting screens, not the full admin nav.
  if (pathname?.startsWith('/admin/contest-voting')) {
    return null
  }

  // Links for CHECK_IN role – only check-in essentials
  const checkInLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/event-check-in', label: 'Event Check-in' },
    { href: '/shifts', label: 'Volunteer Shifts' },
  ]

  // Full links for ADMIN / SUPER_ADMIN
  const fullLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/events', label: 'Events' },
    { href: '/event-check-in', label: 'Event Check-in' },
    { href: '/members', label: 'Attendees' },
    { href: '/admin/volunteers', label: 'Volunteers' },
    { href: '/shifts', label: 'Volunteer Shifts' },
    { href: '/admin/operations', label: 'Event Operations' },
    { href: '/admin/campaigns', label: 'Email Campaigns' },
    { href: '/admin/contest-voting', label: 'Voting' },
    ...(isSuperAdmin ? [{ href: '/admin/admin-users', label: 'Admin Users' }] : []),
  ]

  const links = isCheckIn ? checkInLinks : fullLinks

  return (
    <nav className="border-b border-[#2A0E10] bg-[#0B0B0B] px-6 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/admin"
            className="text-xl font-black uppercase tracking-wide text-[#B11218] hover:text-[#D11A22]"
          >
            Encuerado
          </Link>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {links.map((link) => {
              const isActive =
                pathname === link.href || pathname?.startsWith(link.href + '/')

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-medium transition-colors hover:text-[#B11218] ${
                    isActive ? 'text-[#B11218]' : 'text-[#B7B7B7]'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
          >
            Logout
          </button>
        </form>
      </div>
    </nav>
  )
}