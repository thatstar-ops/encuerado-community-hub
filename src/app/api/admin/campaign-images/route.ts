import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/auth'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(request: Request) {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
    if (!token) {
      return NextResponse.json(
        { error: 'Picture upload is not configured. BLOB_READ_WRITE_TOKEN is missing.' },
        { status: 503 }
      )
    }
    if (token === 'PASTE_YOUR_BLOB_TOKEN_HERE' || token === 'PASTE_REAL_BLOB_TOKEN_HERE' || token === '') {
      return NextResponse.json(
        { error: 'Picture upload is not configured. Replace the placeholder BLOB_READ_WRITE_TOKEN.' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Please choose a picture to upload.' },
        { status: 400 }
      )
    }

    if (!MIME_EXTENSIONS[file.type]) {
      return NextResponse.json(
        { error: 'Pictures must be JPG, PNG, or WebP.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Pictures must be 5 MB or smaller.' },
        { status: 400 }
      )
    }

    const pathname = 'campaign-images/' + crypto.randomUUID() + '.' + MIME_EXTENSIONS[file.type]
    const blob = await put(pathname, file, { access: 'public', addRandomSuffix: false })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Campaign image upload failed:', error)
    return NextResponse.json(
      { error: 'Picture upload provider rejected the file. Check BLOB_READ_WRITE_TOKEN and Vercel Blob setup.' },
      { status: 500 }
    )
  }
}
