import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import {
  commitExternalContactListImport,
  readExternalContactOverride,
} from '@/lib/external-contact-list-import'

export async function POST(request: Request) {
  const admin = await requireSuperAdmin()

  try {
    const formData = await request.formData()
    const file = formData.get('csvFile')

    if (!(file instanceof File) || !file.size) {
      throw new Error('Choose a CSV file.')
    }

    const csvText = await file.text()
    const listLabel = String(
      formData.get('listLabel') || '',
    ).trim()
    const sourceLabel =
      String(formData.get('sourceLabel') || '').trim() ||
      undefined

    if (!listLabel) {
      throw new Error('A list label is required.')
    }

    const overrideOptions = readExternalContactOverride(
      formData,
      admin,
    )

    const result = await commitExternalContactListImport(
      csvText,
      listLabel,
      sourceLabel,
      overrideOptions,
    )

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Import failed.',
      },
      { status: 400 },
    )
  }
}
