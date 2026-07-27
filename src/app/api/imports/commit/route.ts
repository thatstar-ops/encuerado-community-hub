import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/auth'
import { commitImport, readImportForm } from '@/lib/participation-import'

export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { file, options } = readImportForm(await request.formData(), admin)
    return NextResponse.json(await commitImport(await file.text(), options))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to import this CSV.' }, { status: 400 })
  }
}
