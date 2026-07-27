import { parse } from 'csv-parse/sync'
import { ParticipationType } from '@prisma/client'
import { prisma } from './prisma'

type ImportOverrideOptions = {
  superAdminImportOverride?: boolean
  overrideUsedByEmail?: string | null
}

function importOverrideUsed(options?: ImportOverrideOptions) {
  return Boolean(options?.superAdminImportOverride)
}

function overrideNote(options?: ImportOverrideOptions) {
  if (!importOverrideUsed(options)) return null

  return options?.overrideUsedByEmail
    ? 'Super admin import override used by ' + options.overrideUsedByEmail + '.'
    : 'Super admin import override used.'
}

function appendOverrideNote(
  notes: string | null | undefined,
  options?: ImportOverrideOptions,
) {
  const note = overrideNote(options)
  if (!note) return notes || null

  const existing = String(notes || '').trim()
  return existing ? existing + '\n' + note : note
}

export const IMPORT_CATEGORIES = [
  'ATTENDEES',
  'VOLUNTEERS',
  'CONTACTS',
] as const

export type ImportCategory = (typeof IMPORT_CATEGORIES)[number]

type ParsedRow = {
  rowNumber: number
  firstName: string
  lastName: string
  email: string
  phone: string
  notes: string | null
}

export type ImportPreviewRow = {
  rowNumber: number
  name: string
  email: string
  phone: string
  memberStatus: string
  matchMethod: string
  participation: string
  volunteerProfile: string
  registration: string
  duplicateStatus: string
  errors: string[]
  action: 'create' | 'update' | 'skip' | 'error'
}

export type ImportPreview = {
  rows: ImportPreviewRow[]
  summary: Record<string, number>
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, '')
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase()
}

function valueFor(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[normalizedHeader(name)]
    if (value) return value.trim().replace(/\s+/g, ' ')
  }
  return ''
}

function parseRows(csvText: string): ParsedRow[] {
  const records = parse(csvText, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][]

  if (records.length < 2) {
    throw new Error(
      'The CSV must include a header row and at least one data row.',
    )
  }

  const headers = records[0].map(normalizedHeader)

  return records.slice(1).map((values, index) => {
    const row = Object.fromEntries(
      headers.map((header, column) => [
        header,
        String(values[column] || ''),
      ]),
    )

    const fullName = valueFor(row, ['full name', 'name'])
    let firstName = valueFor(row, [
      'first name',
      'firstname',
      'given name',
      'billing name first name',
    ])
    let lastName = valueFor(row, [
      'last name',
      'lastname',
      'surname',
      'billing name last name',
    ])

    if (!firstName && !lastName && fullName) {
      const parts = fullName.split(/\s+/)
      firstName = parts.shift() || ''
      lastName = parts.join(' ')
    }

    return {
      rowNumber: index + 2,
      firstName,
      lastName,
      email: normalizedEmail(
        valueFor(row, [
          'email',
          'email address',
          'billing email address',
          'e-mail',
        ]),
      ),
      phone: valueFor(row, [
        'phone',
        'phone number',
        'billing phone number',
        'mobile',
        'telephone',
      ]),
      notes: valueFor(row, ['notes', 'note', 'comments']) || null,
    }
  })
}

export type ImportOptions = ImportOverrideOptions & {
  category: ImportCategory
  year: number
  eventId: string
  sourceLabel?: string
}

export function readImportOptions(values: {
  category: string
  year: string
  eventId: string
  sourceLabel?: string
}): ImportOptions {
  if (!IMPORT_CATEGORIES.includes(values.category as ImportCategory)) {
    throw new Error('Choose a valid import category.')
  }

  const year = Number(values.year)

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(
      'Participation year must be a valid four-digit year.',
    )
  }

  const category = values.category as ImportCategory

  if (category !== 'ATTENDEES' && values.eventId) {
    throw new Error(
      'Only attendee imports can create event registrations.',
    )
  }

  return {
    category,
    year,
    eventId: values.eventId.trim(),
    sourceLabel: values.sourceLabel?.trim() || undefined,
  }
}

export function readImportForm(
  formData: FormData,
  admin?: { role?: string; email?: string | null },
) {
  const file = formData.get('csvFile')

  if (!(file instanceof File) || !file.size) {
    throw new Error('Choose a CSV file.')
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('CSV files must be 5 MB or smaller.')
  }

  if (
    file.type &&
    ![
      'text/csv',
      'application/vnd.ms-excel',
      'text/plain',
    ].includes(file.type)
  ) {
    throw new Error('Choose a CSV file.')
  }

  const overrideRequested =
    String(formData.get('superAdminImportOverride') || '') === 'yes'
  const overrideAllowed =
    overrideRequested && admin?.role === 'SUPER_ADMIN'

  return {
    file,
    options: {
      ...readImportOptions({
        category: String(formData.get('category') || ''),
        year: String(formData.get('year') || ''),
        eventId: String(formData.get('eventId') || ''),
        sourceLabel: String(formData.get('sourceLabel') || ''),
      }),
      superAdminImportOverride: overrideAllowed,
      overrideUsedByEmail: overrideAllowed
        ? admin?.email ||
          String(formData.get('overrideUsedByEmail') || '') ||
          null
        : null,
    },
  }
}

async function membersFor(rows: ParsedRow[]) {
  const emails = [
    ...new Set(rows.map((row) => row.email).filter(Boolean)),
  ]

  const members = await prisma.member.findMany({
    where: {
      OR: [
        ...(emails.length ? [{ email: { in: emails } }] : []),
        { phone: { not: null } },
      ],
    },
    include: {
      volunteerProfile: true,
      participationRecords: true,
      registrations: true,
    },
  })

  return {
    byEmail: new Map(
      members.map((member) => [
        normalizedEmail(member.email),
        member,
      ]),
    ),
    byPhone: new Map(
      members.reduce((map, member) => {
        const phone = normalizedPhone(member.phone || '')
        if (phone.length >= 10) {
          map.set(phone, [...(map.get(phone) || []), member])
        }
        return map
      }, new Map<string, typeof members>()),
    ),
  }
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function placeholderEmailFor(row: ParsedRow) {
  const phone = normalizedPhone(row.phone)
  return `missing-email+${phone}@import.encuerado.invalid`
}

function addIssue(
  errors: string[],
  message: string,
  options: ImportOptions,
  overrideable: boolean,
) {
  if (overrideable && importOverrideUsed(options)) {
    errors.push(`Override accepted: ${message}`)
    return false
  }

  errors.push(message)
  return true
}

export async function previewImport(
  csvText: string,
  options: ImportOptions,
): Promise<ImportPreview> {
  const rows = parseRows(csvText)
  const matches = await membersFor(rows)

  if (
    options.eventId &&
    !(await prisma.event.findUnique({
      where: { id: options.eventId },
      select: { id: true },
    }))
  ) {
    throw new Error('The selected event no longer exists.')
  }

  const seen = new Set<string>()

  const previewRows = rows.map((row) => {
    const errors: string[] = []
    let hasBlockingError = false

    const phone = normalizedPhone(row.phone)
    const key = row.email || phone
    const duplicateInCsv = Boolean(key && seen.has(key))

    if (duplicateInCsv) {
      errors.push('Duplicate row in this CSV.')
      hasBlockingError = true
    }

    if (key) seen.add(key)

    if (row.email && !validEmail(row.email)) {
      errors.push('Invalid email address.')
      hasBlockingError = true
    }

    const emailMember = row.email
      ? matches.byEmail.get(row.email)
      : undefined

    const phoneMembers =
      phone.length >= 10 ? matches.byPhone.get(phone) || [] : []

    const phoneMember =
      phoneMembers.length === 1 ? phoneMembers[0] : undefined

    if (!row.email && !phoneMember) {
      if (phone.length >= 10) {
        hasBlockingError =
          addIssue(
            errors,
            'New member has no email. A private placeholder email will be created from the phone number.',
            options,
            true,
          ) || hasBlockingError
      } else {
        errors.push(
          'A new member requires a valid email address or a usable phone number.',
        )
        hasBlockingError = true
      }
    }

    if (phoneMembers.length > 1) {
      errors.push('Phone number matches more than one member.')
      hasBlockingError = true
    }

    if (
      emailMember &&
      phoneMember &&
      emailMember.id !== phoneMember.id
    ) {
      errors.push('Email and phone match different members.')
      hasBlockingError = true
    }

    const member = emailMember || phoneMember

    if (
      member &&
      row.firstName &&
      member.firstName !== row.firstName
    ) {
      hasBlockingError =
        addIssue(
          errors,
          'First name conflicts with the matched member.',
          options,
          true,
        ) || hasBlockingError
    }

    if (
      member &&
      row.lastName &&
      member.lastName !== row.lastName
    ) {
      hasBlockingError =
        addIssue(
          errors,
          'Last name conflicts with the matched member.',
          options,
          true,
        ) || hasBlockingError
    }

    if (
      member &&
      row.phone &&
      member.phone &&
      normalizedPhone(member.phone) !== phone
    ) {
      hasBlockingError =
        addIssue(
          errors,
          'Phone conflicts with the matched member.',
          options,
          true,
        ) || hasBlockingError
    }

    const type =
      options.category === 'ATTENDEES'
        ? ParticipationType.ATTENDEE
        : options.category === 'VOLUNTEERS'
          ? ParticipationType.VOLUNTEER
          : null

    const hasParticipation = Boolean(
      member &&
        type &&
        member.participationRecords.some(
          (record) =>
            record.year === options.year &&
            record.type === type,
        ),
    )

    const hasRegistration = Boolean(
      member &&
        options.eventId &&
        member.registrations.some(
          (record) => record.eventId === options.eventId,
        ),
    )

    const hasChange =
      !member ||
      (Boolean(type) && !hasParticipation) ||
      (options.category === 'VOLUNTEERS' &&
        !member?.volunteerProfile) ||
      (options.category === 'ATTENDEES' &&
        Boolean(options.eventId) &&
        !hasRegistration)

    const action: ImportPreviewRow['action'] =
      hasBlockingError
        ? 'error'
        : hasChange
          ? member
            ? 'update'
            : 'create'
          : 'skip'

    return {
      rowNumber: row.rowNumber,
      name:
        [row.firstName, row.lastName]
          .filter(Boolean)
          .join(' ') || 'Unnamed contact',
      email:
        row.email ||
        (importOverrideUsed(options) && phone.length >= 10
          ? 'Placeholder email will be created'
          : '—'),
      phone: row.phone || '—',
      memberStatus: hasBlockingError
        ? 'invalid'
        : member
          ? 'matched member'
          : 'new member',
      matchMethod: emailMember
        ? 'email'
        : phoneMember
          ? 'phone'
          : 'none',
      participation: type
        ? hasParticipation
          ? 'already exists'
          : String(options.year) +
            ' ' +
            (type === ParticipationType.ATTENDEE
              ? 'Attendee'
              : 'Volunteer') +
            ' will be added'
        : 'not applicable',
      volunteerProfile:
        options.category === 'VOLUNTEERS'
          ? member?.volunteerProfile
            ? 'already exists'
            : 'will be created'
          : 'not applicable',
      registration:
        options.category === 'ATTENDEES' && options.eventId
          ? hasRegistration
            ? 'already exists'
            : 'will be created'
          : 'not applicable',
      duplicateStatus: duplicateInCsv
        ? 'duplicate in CSV'
        : 'none',
      errors,
      action,
    }
  })

  return {
    rows: previewRows,
    summary: {
      totalRows: previewRows.length,
      newMembers: previewRows.filter(
        (row) => row.memberStatus === 'new member',
      ).length,
      existingMembers: previewRows.filter(
        (row) => row.memberStatus === 'matched member',
      ).length,
      duplicates: previewRows.filter((row) =>
        row.errors.some((error) => error.includes('Duplicate')),
      ).length,
      invalidRows: previewRows.filter(
        (row) => row.action === 'error',
      ).length,
      overriddenRows: previewRows.filter((row) =>
        row.errors.some((error) =>
          error.startsWith('Override accepted:'),
        ),
      ).length,
      participationRecords: previewRows.filter((row) =>
        row.participation.includes('will be added'),
      ).length,
      volunteerProfiles: previewRows.filter(
        (row) => row.volunteerProfile === 'will be created',
      ).length,
      registrations: previewRows.filter(
        (row) => row.registration === 'will be created',
      ).length,
      skippedRows: previewRows.filter(
        (row) => row.action === 'skip',
      ).length,
    },
  }
}

export async function commitImport(
  csvText: string,
  options: ImportOptions,
) {
  const preview = await previewImport(csvText, options)
  const rows = parseRows(csvText)
  const results: Array<{
    rowNumber: number
    result: string
    error?: string
  }> = []

  for (const item of preview.rows) {
    if (item.action !== 'create' && item.action !== 'update') {
      results.push({
        rowNumber: item.rowNumber,
        result: item.action,
        error: item.errors.join(' ') || undefined,
      })
      continue
    }

    const row = rows.find(
      (candidate) => candidate.rowNumber === item.rowNumber,
    )

    if (!row) continue

    try {
      await prisma.$transaction(async (tx) => {
        const resolvedEmail =
          row.email ||
          (importOverrideUsed(options)
            ? placeholderEmailFor(row)
            : '')

        const emailMember = resolvedEmail
          ? await tx.member.findUnique({
              where: { email: resolvedEmail },
            })
          : null

        const matchingPhones = row.phone
          ? (
              await tx.member.findMany({
                where: { phone: { not: null } },
              })
            ).filter(
              (candidate) =>
                normalizedPhone(candidate.phone || '') ===
                normalizedPhone(row.phone),
            )
          : []

        const existing =
          emailMember ||
          (matchingPhones.length === 1
            ? matchingPhones[0]
            : null)

        const member = existing
          ? await tx.member.update({
              where: { id: existing.id },
              data: {
                phone: existing.phone || row.phone || null,
                notes: appendOverrideNote(
                  existing.notes || row.notes || null,
                  options,
                ),
              },
            })
          : await tx.member.create({
              data: {
                email: resolvedEmail,
                firstName: row.firstName || 'Unknown',
                lastName: row.lastName || 'Contact',
                phone: row.phone || null,
                notes: appendOverrideNote(
                  row.notes || null,
                  options,
                ),
                firstYearAttended:
                  options.category === 'ATTENDEES'
                    ? options.year
                    : 2025,
              },
            })

        if (options.category !== 'CONTACTS') {
          const type =
            options.category === 'ATTENDEES'
              ? ParticipationType.ATTENDEE
              : ParticipationType.VOLUNTEER

          const source =
            options.sourceLabel || `import-${options.year}`

          const existingPart =
            await tx.participationRecord.findUnique({
              where: {
                memberId_year_type: {
                  memberId: member.id,
                  year: options.year,
                  type,
                },
              },
              select: { id: true, source: true },
            })

          if (!existingPart) {
            await tx.participationRecord.create({
              data: {
                memberId: member.id,
                year: options.year,
                type,
                source,
              },
            })
          } else if (
            !existingPart.source &&
            options.sourceLabel
          ) {
            await tx.participationRecord.update({
              where: { id: existingPart.id },
              data: { source: options.sourceLabel },
            })
          }
        }

        if (options.category === 'VOLUNTEERS') {
          await tx.volunteerProfile.upsert({
            where: { memberId: member.id },
            create: { memberId: member.id },
            update: {},
          })
        }

        if (
          options.category === 'ATTENDEES' &&
          options.eventId
        ) {
          await tx.eventRegistration.upsert({
            where: {
              memberId_eventId: {
                memberId: member.id,
                eventId: options.eventId,
              },
            },
            create: {
              memberId: member.id,
              eventId: options.eventId,
              status: 'Registered',
            },
            update: {},
          })
        }
      })

      results.push({
        rowNumber: item.rowNumber,
        result: 'imported',
      })
    } catch {
      results.push({
        rowNumber: item.rowNumber,
        result: 'error',
        error: 'Unable to import this row safely.',
      })
    }
  }

  return { preview, results }
}
