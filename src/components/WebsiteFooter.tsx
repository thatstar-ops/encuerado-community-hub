import Link from 'next/link'

const footerLinks = [
  { href: '/events', label: 'Events' },
  { href: '/volunteer-shifts', label: 'Volunteer' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/admin/login', label: 'Admin Login' },
]

export default function WebsiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-black px-6 py-8 text-[#B7B7B7]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-6">
        <div>
          <Link
            href="/"
            className="text-lg font-bold text-[#B11218] hover:text-[#D11A22]"
          >
            Encuerado
          </Link>
          <p className="mt-2 max-w-xl text-sm text-[#8F8F8F]">
            LOS ANGELES LATIN FETISH WEEKEND.
          </p>
        </div>

        <nav className="flex flex-wrap gap-4 text-sm font-semibold">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[#B7B7B7] hover:text-[#B11218]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
