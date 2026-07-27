import { redirect } from 'next/navigation'

export default async function LegacyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>
}) {
  const params = await searchParams
  const query = new URLSearchParams()

  if (params.error) query.set('error', params.error)
  if (params.redirect) query.set('redirect', params.redirect)

  const suffix = query.size ? `?${query.toString()}` : ''
  redirect(`/admin/login${suffix}`)
}
