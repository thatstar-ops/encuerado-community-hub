import { redirect } from 'next/navigation'

// Volunteer check-in was merged into one page: /shifts/volunteer-check-in
// It handles both name search (?q=) and a single shift's roster (?shift=).
// This route stays only so old links and bookmarks keep working.
export default async function LegacyShiftCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/shifts/volunteer-check-in?shift=${encodeURIComponent(id)}`)
}
