import { redirect } from 'next/navigation'

export default async function PublicEventRegisterThankYouPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/events/${id}`)
}