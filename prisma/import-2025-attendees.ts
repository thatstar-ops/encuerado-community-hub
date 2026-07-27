import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const csvPath = path.join(process.cwd(), 'imports', 'encuerado-2025-attendees.csv')

type CsvRow = {
  'Billing Name (First Name)': string
  'Billing Name (Last Name)': string
  'Billing Address (Address 1)': string
  'Billing Address (City)': string
  'Billing Address (State/Province)': string
  'Billing Address (Country)': string
  'Billing Address (Postal Code)': string
  'Billing Email Address': string
  'Billing Phone Number': string
}

function clean(value: unknown) {
  return String(value || '').trim()
}

async function main() {
  console.log('Importing Encuerado 2025 attendees...')

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`)
  }

  const file = fs.readFileSync(csvPath, 'utf8')

  const rows = parse(file, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as CsvRow[]

  let created = 0
  let updated = 0
  let skipped = 0

  const seenEmails = new Set<string>()

  for (const row of rows) {
    const firstName = clean(row['Billing Name (First Name)'])
    const lastName = clean(row['Billing Name (Last Name)'])
    const email = clean(row['Billing Email Address']).toLowerCase()

    if (!firstName || !lastName || !email) {
      skipped++
      continue
    }

    if (seenEmails.has(email)) {
      skipped++
      continue
    }

    seenEmails.add(email)

    const existing = await prisma.member.findUnique({
      where: { email },
    })

    const data = {
      firstName,
      lastName,
      preferredName: null,
      phone: clean(row['Billing Phone Number']) || null,
      addressLine1: clean(row['Billing Address (Address 1)']) || null,
      city: clean(row['Billing Address (City)']) || null,
      state: clean(row['Billing Address (State/Province)']) || null,
      country: clean(row['Billing Address (Country)']) || 'US',
      postalCode: clean(row['Billing Address (Postal Code)']) || null,
      firstYearAttended: 2025,
      notes: 'Imported from Encuerado 2025 attendee list.',
    }

    if (existing) {
      await prisma.member.update({
        where: { email },
        data,
      })
      updated++
    } else {
      await prisma.member.create({
        data: {
          ...data,
          email,
        },
      })
      created++
    }
  }

  console.log('Import complete.')
  console.log(`Rows read: ${rows.length}`)
  console.log(`Created: ${created}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped duplicates/incomplete: ${skipped}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })