import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const cleanToken = String(token || '').trim()

  let title = 'Unsubscribe'
  let message = 'We could not find this unsubscribe link.'
  let detail = 'The link may be incomplete or expired.'

  if (cleanToken) {
    const member = await prisma.member.findFirst({
      where: { unsubscribeToken: cleanToken },
      select: {
        id: true,
        email: true,
        promotionalEmailOptOut: true,
      },
    })

    if (member?.promotionalEmailOptOut) {
      title = 'You are already unsubscribed'
      message = 'This email address is already opted out of promotional emails.'
      detail = 'You may still receive direct administrative messages if needed.'
    } else if (member) {
      await prisma.member.update({
        where: { id: member.id },
        data: { promotionalEmailOptOut: true },
      })

      title = 'You are unsubscribed'
      message = 'You have been removed from promotional emails.'
      detail = 'This change is effective immediately for future campaign emails.'
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-xl">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[#B11218]">
          ENCUERADO
        </p>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-4 text-lg text-white">{message}</p>
        <p className="mt-3 text-sm text-[#8F8F8F]">{detail}</p>

        <div className="mt-8 rounded-xl border border-[#2A0E10] bg-black p-4 text-sm text-[#8F8F8F]">
          If this was a mistake, please contact the Encuerado team and we can help update your email preferences.
        </div>
      </div>
    </main>
  )
}