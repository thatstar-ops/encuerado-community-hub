import { NextResponse } from 'next/server'
import { requireNonCheckInAdmin } from '@/lib/auth'
import { buildVolunteerBibleDocx, type VolunteerBibleScope } from '@/lib/volunteer-bible-export'

export async function GET(request: Request) {
  await requireNonCheckInAdmin()

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')

  let scope: VolunteerBibleScope

  if (mode === 'event') {
    const eventId = String(searchParams.get('eventId') || '').trim()
    if (!eventId) {
      return NextResponse.json({ error: 'Choose an event.' }, { status: 400 })
    }
    scope = { mode: 'event', eventId }
  } else {
    const year = Number(searchParams.get('year'))
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return NextResponse.json({ error: 'Choose a valid year.' }, { status: 400 })
    }
    scope = { mode: 'year', year }
  }

  try {
    const { buffer, filename } = await buildVolunteerBibleDocx(scope)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate the volunteer bible.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
