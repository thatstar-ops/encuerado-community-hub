import { parse } from 'csv-parse/sync'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type ExternalContactOverrideOptions = {
  superAdminImportOverride?: boolean
  overrideUsedByEmail?: string | null
}

export function readExternalContactOverride(
  formData: FormData,
  admin: { role?: string; email?: string | null },
): ExternalContactOverrideOptions {
  const overrideRequested =
    String(formData.get('superAdminImportOverride') || '') === 'yes'
  const overrideAllowed =
    overrideRequested && admin.role === 'SUPER_ADMIN'

  return {
    superAdminImportOverride: overrideAllowed,
    overrideUsedByEmail: overrideAllowed
      ? admin.email ||
        String(formData.get('overrideUsedByEmail') || '') ||
        null
      : null,
  }
}

function overrideUsed(options?: ExternalContactOverrideOptions) {
  return Boolean(options?.superAdminImportOverride)
}

function overrideAuditNote(
  options?: ExternalContactOverrideOptions,
) {
  if (!overrideUsed(options)) return null

  return options?.overrideUsedByEmail
    ? 'Super admin external contact import override used by ' +
        options.overrideUsedByEmail +
        '.'
    : 'Super admin external contact import override used.'
}

function appendOverrideNote(
  notes: string | null | undefined,
  options?: ExternalContactOverrideOptions,
) {
  const note = overrideAuditNote(options)
  if (!note) return notes || null

  const existing = String(notes || '').trim()
  return existing ? existing + '\n' + note : note
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

function valueFor(
  row: Record<string, string>,
  names: string[],
) {
  for (const name of names) {
    const value = row[normalizedHeader(name)]
    if (value) return value.trim().replace(/\s+/g, ' ')
  }
  return ''
}

type ParsedContactRow = {
  rowNumber: number
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  address2: string
  city: string
  state: string
  postalCode: string
  country: string
  notes: string
}

export type ExternalContactImportPreviewRow = {
  rowNumber: number
  name: string
  email: string
  phone: string
  memberStatus: string
  matchMethod: string
  alreadyInList: boolean
  errors: string[]
  action: 'create' | 'update' | 'link' | 'skip' | 'error'
  // The exact Member this row was matched to at preview time (or null for
  // "will create a new member"). Commit uses this directly instead of
  // re-deriving a match, so two new rows that happen to share a phone number
  // can't get silently merged into one record mid-batch (see
  // commitExternalContactListImport).
  matchedMemberId: string | null
}

export type ExternalContactImportPreview = {
  rows: ExternalContactImportPreviewRow[]
  summary: Record<string, number>
}

function parseRows(csvText: string): ParsedContactRow[] {
  let records: string[][] = []

  try {
    records = parse(csvText, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][]
  } catch {
    throw new Error(
      'This file does not look like a valid CSV. Please export it as CSV UTF-8 from Excel or Google Sheets and try again.',
    )
  }

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

    const fullName = valueFor(row, [
      'full name',
      'name',
      'contact name',
      'customer name',
      'attendee name',
      'person',
      'person name',
    ])

    let firstName = valueFor(row, [
      'first name',
      'firstname',
      'given name',
      'billing first name',
      'billing name first name',
    ])

    let lastName = valueFor(row, [
      'last name',
      'lastname',
      'surname',
      'family name',
      'billing last name',
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
          'e-mail',
          'e mail',
          'contact email',
          'primary email',
          'billing email',
          'billing email address',
        ]),
      ),
      phone: valueFor(row, [
        'phone',
        'phone number',
        'mobile',
        'mobile phone',
        'cell',
        'cell phone',
        'telephone',
        'contact phone',
        'billing phone',
        'billing phone number',
      ]),
      address: valueFor(row, [
        'address',
        'street address',
        'address 1',
        'address line 1',
        'mailing address',
        'billing address',
        'billing address 1',
      ]),
      address2: valueFor(row, [
        'address 2',
        'address line 2',
        'apartment',
        'apt',
        'suite',
        'unit',
      ]),
      city: valueFor(row, [
        'city',
        'town',
        'billing city',
      ]),
      state: valueFor(row, [
        'state',
        'province',
        'region',
        'billing state',
      ]),
      postalCode: valueFor(row, [
        'zip',
        'zipcode',
        'zip code',
        'postal code',
        'billing zip',
        'billing postal code',
      ]),
      country: valueFor(row, [
        'country',
        'billing country',
      ]),
      notes: valueFor(row, [
        'notes',
        'note',
        'comments',
        'comment',
        'memo',
      ]),
    }
  })
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function placeholderEmailFor(row: ParsedContactRow) {
  const phone = normalizedPhone(row.phone)
  return `missing-email+${phone}@import.encuerado.invalid`
}

function addOverrideableIssue(
  issues: string[],
  message: string,
  options?: ExternalContactOverrideOptions,
) {
  if (overrideUsed(options)) {
    issues.push('Override accepted: ' + message)
    return false
  }

  issues.push(message)
  return true
}

export async function previewExternalContactListImport(
  csvText: string,
  listLabel: string,
  options?: ExternalContactOverrideOptions,
): Promise<ExternalContactImportPreview> {
  const rows = parseRows(csvText)

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
      externalContactLists: true,
    },
  })

  const byEmail = new Map(
    members.map((member) => [
      normalizedEmail(member.email),
      member,
    ]),
  )

  const byPhone = new Map<string, typeof members>()

  members.forEach((member) => {
    const phone = normalizedPhone(member.phone || '')
    if (phone.length >= 10) {
      byPhone.set(phone, [
        ...(byPhone.get(phone) || []),
        member,
      ])
    }
  })

  const contactList =
    await prisma.externalContactList.findFirst({
      where: { label: listLabel },
    })

  const contactListId = contactList?.id
  const seen = new Set<string>()

  const previewRows = rows.map((row) => {
    const issues: string[] = []
    let hasBlockingError = false

    const phone = normalizedPhone(row.phone)
    const key = row.email || phone
    const duplicateInCsv = Boolean(key && seen.has(key))

    if (duplicateInCsv) {
      issues.push('Duplicate row in this CSV.')
      hasBlockingError = true
    }

    if (key) seen.add(key)

    if (row.email && !validEmail(row.email)) {
      issues.push('Invalid email address.')
      hasBlockingError = true
    }

    const emailMember = row.email
      ? byEmail.get(row.email)
      : undefined

    const phoneMembers =
      phone.length >= 10 ? byPhone.get(phone) || [] : []

    const phoneMember =
      phoneMembers.length === 1
        ? phoneMembers[0]
        : undefined

    if (!row.email && !phoneMember) {
      if (phone.length >= 10) {
        hasBlockingError =
          addOverrideableIssue(
            issues,
            'New member has no email. A private placeholder email will be created from the phone number.',
            options,
          ) || hasBlockingError
      } else {
        issues.push(
          'A new member requires a valid email address or a usable phone number.',
        )
        hasBlockingError = true
      }
    }

    if (phoneMembers.length > 1) {
      issues.push('Phone number matches more than one member.')
      hasBlockingError = true
    }

    if (
      emailMember &&
      phoneMember &&
      emailMember.id !== phoneMember.id
    ) {
      issues.push('Email and phone match different members.')
      hasBlockingError = true
    }

    const member = emailMember || phoneMember

    let alreadyInList = false

    if (member && contactListId) {
      alreadyInList = member.externalContactLists.some(
        (contactListMember) =>
          contactListMember.externalContactListId ===
          contactListId,
      )
    }

    if (
      member &&
      row.firstName &&
      member.firstName !== row.firstName
    ) {
      hasBlockingError =
        addOverrideableIssue(
          issues,
          'First name conflicts with the matched member.',
          options,
        ) || hasBlockingError
    }

    if (
      member &&
      row.lastName &&
      member.lastName !== row.lastName
    ) {
      hasBlockingError =
        addOverrideableIssue(
          issues,
          'Last name conflicts with the matched member.',
          options,
        ) || hasBlockingError
    }

    if (
      member &&
      row.phone &&
      member.phone &&
      normalizedPhone(member.phone) !== phone
    ) {
      hasBlockingError =
        addOverrideableIssue(
          issues,
          'Phone conflicts with the matched member.',
          options,
        ) || hasBlockingError
    }

    let action: ExternalContactImportPreviewRow['action'] =
      'error'

    if (!hasBlockingError) {
      if (!member) {
        action = 'create'
      } else if (!alreadyInList) {
        action = 'link'
      } else {
        const hasNewData =
          Boolean(row.phone && !member.phone) ||
          Boolean(row.notes && !member.notes) ||
          Boolean(row.address && !member.addressLine1) ||
          Boolean(row.city && !member.city) ||
          Boolean(row.state && !member.state) ||
          Boolean(row.postalCode && !member.postalCode) ||
          Boolean(row.country && !member.country)

        action = hasNewData ? 'update' : 'skip'
      }
    }

    return {
      rowNumber: row.rowNumber,
      name:
        [row.firstName, row.lastName]
          .filter(Boolean)
          .join(' ') || 'Unnamed',
      email:
        row.email ||
        (overrideUsed(options) && phone.length >= 10
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
      alreadyInList,
      errors: issues,
      action,
      matchedMemberId: member?.id || null,
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
      alreadyLinked: previewRows.filter(
        (row) => row.alreadyInList,
      ).length,
      willBeLinked: previewRows.filter((row) =>
        ['create', 'link'].includes(row.action),
      ).length,
      duplicates: previewRows.filter((row) =>
        row.errors.some((error) =>
          error.includes('Duplicate'),
        ),
      ).length,
      invalidRows: previewRows.filter(
        (row) => row.action === 'error',
      ).length,
      overriddenRows: previewRows.filter((row) =>
        row.errors.some((error) =>
          error.startsWith('Override accepted:'),
        ),
      ).length,
      skipped: previewRows.filter(
        (row) => row.action === 'skip',
      ).length,
    },
  }
}

export async function commitExternalContactListImport(
  csvText: string,
  listLabel: string,
  sourceLabel?: string,
  options?: ExternalContactOverrideOptions,
) {
  const preview = await previewExternalContactListImport(
    csvText,
    listLabel,
    options,
  )

  const rows = parseRows(csvText)

  let contactList =
    await prisma.externalContactList.findFirst({
      where: { label: listLabel },
    })

  if (!contactList) {
    contactList = await prisma.externalContactList.create({
      data: { label: listLabel },
    })
  }

  const results: Array<{
    rowNumber: number
    result: string
    error?: string
  }> = []

  for (const item of preview.rows) {
    if (item.action === 'error' || item.action === 'skip') {
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
          (overrideUsed(options)
            ? placeholderEmailFor(row)
            : '')

        // Use the exact match (or "no match, create new") the preview above
        // already decided for this row. Re-deriving the match here against
        // the live DB would let two different new people who share a phone
        // number get silently merged: row 2's transaction would "find" row
        // 1's brand-new record (just created a moment ago in this same
        // batch) and merge into it, discarding row 2's own name/email, even
        // though the preview the admin approved said both would be created
        // separately.
        const existing = item.matchedMemberId
          ? await tx.member.findUnique({
              where: { id: item.matchedMemberId },
            })
          : null

        let member

        if (existing) {
          const updateData: Prisma.MemberUpdateInput = {}

          if (row.phone && !existing.phone) {
            updateData.phone = row.phone
          }
          if (row.address && !existing.addressLine1) {
            updateData.addressLine1 = row.address
          }
          if (row.city && !existing.city) {
            updateData.city = row.city
          }
          if (row.state && !existing.state) {
            updateData.state = row.state
          }
          if (row.postalCode && !existing.postalCode) {
            updateData.postalCode = row.postalCode
          }
          if (row.country && !existing.country) {
            updateData.country = row.country
          }

          const mergedNotes = appendOverrideNote(
            existing.notes || row.notes || null,
            options,
          )

          if (mergedNotes !== existing.notes) {
            updateData.notes = mergedNotes
          }

          member = Object.keys(updateData).length
            ? await tx.member.update({
                where: { id: existing.id },
                data: updateData,
              })
            : existing
        } else {
          member = await tx.member.create({
            data: {
              email: resolvedEmail,
              firstName: row.firstName || 'Unknown',
              lastName: row.lastName || 'Contact',
              phone: row.phone || null,
              addressLine1: row.address || null,
              city: row.city || null,
              state: row.state || null,
              postalCode: row.postalCode || null,
              country: row.country || 'USA',
              notes: appendOverrideNote(
                row.notes || null,
                options,
              ),
            },
          })
        }

        await tx.externalContactListMember.upsert({
          where: {
            externalContactListId_memberId: {
              externalContactListId: contactList.id,
              memberId: member.id,
            },
          },
          create: {
            externalContactListId: contactList.id,
            memberId: member.id,
            sourceLabel: sourceLabel || null,
          },
          update: {
            sourceLabel: sourceLabel || undefined,
          },
        })
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
