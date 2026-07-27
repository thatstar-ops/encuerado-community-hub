'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function PublicHeader() {
  const pathname = usePathname()
  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
    { href: '/volunteer-shifts', label: 'Volunteer' },
  ]

  return (
    <header className="border-b border-slate-800 bg-black/95 px-6 py-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/"
            className="text-xl font-black uppercase tracking-wide text-[#B11218] hover:text-[#D11A22]"
          >
            Encuerado
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname?.startsWith(link.href)

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive
                      ? 'text-[#B11218]'
                      : 'text-[#B7B7B7] hover:text-[#B11218]'
                  }
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <Link
          href="/admin/login"
          className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
        >
          Admin Login
        </Link>
      </div>
    </header>
  )
}
