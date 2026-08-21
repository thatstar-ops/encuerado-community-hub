import Link from 'next/link'
import { redirect } from 'next/navigation'
import { redirectVotingAdminAwayFromGeneralAdmin } from '@/lib/voting-admin-access'
import { getCurrentAdmin, requireNonCheckInAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  archiveOperationsContact,
  restoreOperationsContact,
} from '@/lib/operations-actions'

function phoneHref(phone: string | null | undefined) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

function getNoticeParams(searchParams: {
  actionStatus?: string
  actionMessage?: string
}) {
  const status = searchParams.actionStatus || null
  const message = searchParams.actionMessage || null
  return { status, message }
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ actionStatus?: string; actionMessage?: string }>
}) {
  const admin = await getCurrentAdmin()

  redirectVotingAdminAwayFromGeneralAdmin(admin)
  if (!admin) redirect('/admin/login?redirect=/admin/operations')

  const params = await searchParams
  const { status: noticeStatus, message: noticeMessage } = getNoticeParams(params)

  // Vendor / Contact List (non-crew)
  const nonCrewContacts = await prisma.operationsContact.findMany({
    where: {
      archivedAt: null,
      isCrew: false,
    },
    orderBy: { name: 'asc' },
  })

  // Weekend Crew List (isCrew = true)
  const crewContacts = await prisma.operationsContact.findMany({
    where: {
      archivedAt: null,
      isCrew: true,
    },
    orderBy: { name: 'asc' },
  })

  // Supplies / Packing List
  const supplies = await prisma.operationsSupply.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
  })

  const returnTo = '/admin/operations'

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">Event Operations</h1>
          <Link href="/admin" className="text-sm text-[#B11218] hover:underline">
            Dashboard
          </Link>
        </div>

        {noticeStatus && noticeMessage && (
          <div
            className={`mt-4 rounded-lg p-4 ${
              noticeStatus === 'success'
                ? 'border border-green-500 bg-green-900 text-green-100'
                : 'border border-red-500 bg-red-900 text-red-100'
            }`}
          >
            {noticeMessage}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {/* Vendor / Contact List (non-crew) */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Vendor / Contact List</h2>
              <Link
                href="/admin/operations/contacts/new"
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Contact
              </Link>
            </div>
            {nonCrewContacts.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No contacts yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {nonCrewContacts.map((contact) => {
                  const phoneLink = phoneHref(contact.phone)
                  return (
                    <div
                      key={contact.id}
                      className="rounded-xl border border-[#2A0E10] bg-[#151111] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/admin/operations/contacts/${contact.id}/edit`}
                            className="text-lg font-bold text-[#B11218] hover:underline"
                          >
                            {contact.name}
                          </Link>
                          {contact.company && (
                            <span className="ml-2 text-sm text-[#8F8F8F]">
                              {contact.company}
                            </span>
                          )}
                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            {contact.role && <span>{contact.role} · </span>}
                            {contact.email && <span>{contact.email} · </span>}
                            {phoneLink ? (
                              <a href={phoneLink} className="text-[#B11218] hover:underline">
                                {contact.phone}
                              </a>
                            ) : (
                              <span>{contact.phone}</span>
                            )}
                          </div>
                          {contact.category && (
                            <div className="mt-1 text-xs font-medium text-[#D11A22]">
                              {contact.category}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/operations/contacts/${contact.id}/edit`}
                            className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                          >
                            Edit
                          </Link>
                          <form action={archiveOperationsContact.bind(null, contact.id, returnTo)}>
                            <button
                              type="submit"
                              className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                            >
                              Archive
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Weekend Crew List */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Weekend Crew List</h2>
              <Link
                href="/admin/operations/contacts/new?crew=true"
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Crew Member
              </Link>
            </div>
            {crewContacts.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No crew members yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {crewContacts.map((contact) => {
                  const phoneLink = phoneHref(contact.phone)
                  return (
                    <div
                      key={contact.id}
                      className="rounded-xl border border-[#2A0E10] bg-[#151111] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/admin/operations/contacts/${contact.id}/edit`}
                            className="text-lg font-bold text-[#B11218] hover:underline"
                          >
                            {contact.name}
                          </Link>
                          {contact.company && (
                            <span className="ml-2 text-sm text-[#8F8F8F]">
                              {contact.company}
                            </span>
                          )}
                          <div className="mt-1 text-sm text-[#B7B7B7]">
                            {contact.role && <span>{contact.role} · </span>}
                            {contact.email && <span>{contact.email} · </span>}
                            {phoneLink ? (
                              <a href={phoneLink} className="text-[#B11218] hover:underline">
                                {contact.phone}
                              </a>
                            ) : (
                              <span>{contact.phone}</span>
                            )}
                          </div>
                          {contact.category && (
                            <div className="mt-1 text-xs font-medium text-[#D11A22]">
                              {contact.category}
                            </div>
                          )}
                          <div className="mt-1 text-xs font-medium text-green-300">
                            ? Weekend Crew
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/operations/contacts/${contact.id}/edit`}
                            className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                          >
                            Edit
                          </Link>
                          <form action={archiveOperationsContact.bind(null, contact.id, returnTo)}>
                            <button
                              type="submit"
                              className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                            >
                              Archive
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Supplies / Packing List */}
          <section className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Supplies / Packing List</h2>
              <Link
                href="/admin/operations/supplies/new"
                className="rounded-lg bg-[#B11218] px-4 py-2 text-sm font-bold text-white hover:bg-[#D11A22]"
              >
                + Add Supply
              </Link>
            </div>
            {supplies.length === 0 ? (
              <p className="mt-4 text-[#B7B7B7]">No supplies yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {supplies.map((supply) => (
                  <div
                    key={supply.id}
                    className="rounded-xl border border-[#2A0E10] bg-[#151111] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/admin/operations/supplies/${supply.id}/edit`}
                          className="text-lg font-bold text-[#B11218] hover:underline"
                        >
                          {supply.name}
                        </Link>
                        {supply.quantity && (
                          <span className="ml-2 text-sm text-[#8F8F8F]">
                            ({supply.quantity})
                          </span>
                        )}
                        <div className="mt-1 text-sm text-[#B7B7B7]">
                          {supply.owner && <span>Owner: {supply.owner} · </span>}
                          {supply.category && <span>{supply.category}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          {supply.packed && (
                            <span className="rounded-full bg-green-800 px-2 py-0.5 text-green-200">
                              Packed
                            </span>
                          )}
                          {supply.delivered && (
                            <span className="rounded-full bg-blue-800 px-2 py-0.5 text-blue-200">
                              Delivered
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={`/admin/operations/supplies/${supply.id}/toggle-packed`}>
                          <button
                            type="submit"
                            className="rounded border border-slate-400 px-3 py-1 text-xs font-medium text-[#B7B7B7] hover:bg-[#2A0E10]"
                          >
                            {supply.packed ? 'Unpack' : 'Pack'}
                          </button>
                        </form>
                        <form action={`/admin/operations/supplies/${supply.id}/toggle-delivered`}>
                          <button
                            type="submit"
                            className="rounded border border-slate-400 px-3 py-1 text-xs font-medium text-[#B7B7B7] hover:bg-[#2A0E10]"
                          >
                            {supply.delivered ? 'Undeliver' : 'Deliver'}
                          </button>
                        </form>
                        <Link
                          href={`/admin/operations/supplies/${supply.id}/edit`}
                          className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white"
                        >
                          Edit
                        </Link>
                        <form action={`/admin/operations/supplies/${supply.id}/archive`}>
                          <button
                            type="submit"
                            className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#FFB3B6] hover:bg-[#B11218] hover:text-white"
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    </div>
                    {supply.notes && (
                      <div className="mt-2 text-sm text-[#8F8F8F]">{supply.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
