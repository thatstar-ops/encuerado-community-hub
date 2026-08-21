import { prisma } from './prisma'

// Plain-text templates with {{token}} placeholders. Kept intentionally simple
// (no HTML block editor) since this is a short transactional reminder, not a
// marketing email - admins edit subject/body as text, tokens get swapped in
// and HTML-escaped at send time, and everything else (header, footer,
// unsubscribe-free since this is transactional) is handled by the wrapper.
export const SHIFT_REMINDER_TOKENS = [
  { token: 'firstName', label: "Volunteer's first name" },
  { token: 'shiftTitle', label: 'Shift title' },
  { token: 'eventTitle', label: 'Event name' },
  { token: 'shiftTime', label: 'Shift date/time (e.g. "Friday, September 4 at 5:00 PM PDT")' },
  { token: 'location', label: 'Shift location (blank if none set)' },
  { token: 'roleDescription', label: "The shift's role job description (blank if no role is linked)" },
  { token: 'relativeTime', label: 'How far out the shift is (e.g. "tomorrow" or "in 3 days"), based on the timing setting below' },
] as const

export const DEFAULT_SUBJECT_TEMPLATE = 'Reminder: your volunteer shift on {{shiftTime}} - {{shiftTitle}}'

export const DEFAULT_BODY_TEMPLATE = `Hello {{firstName}},

Just a reminder that you're signed up for a volunteer shift:

{{shiftTitle}} ({{eventTitle}})
When: {{shiftTime}}
Where: {{location}}

{{roleDescription}}

Thank you for volunteering - we couldn't do this without you!

- Encuerado Team`

export type ShiftReminderSettings = {
  id: string
  daysBefore: number
  secondDaysBefore: number
  subjectTemplate: string
  bodyTemplate: string
  updatedAt: Date
  updatedByEmail: string | null
}

/**
 * Returns the single settings row, creating it with the defaults above the
 * first time anything asks for it. This keeps the reminder email's wording
 * and timing exactly as they always were until an admin actually edits them
 * on /admin/volunteer-shift-reminders.
 */
export async function ensureShiftReminderSettings(): Promise<ShiftReminderSettings> {
  const existing = await prisma.shiftReminderSettings.findFirst()
  if (existing) return existing

  return prisma.shiftReminderSettings.create({
    data: {
      daysBefore: 7,
      secondDaysBefore: 1,
      subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
      bodyTemplate: DEFAULT_BODY_TEMPLATE,
    },
  })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

/**
 * Renders the HTML email body: escapes the admin's own template text (so a
 * stray "&" or "<" in their wording can't break the email), substitutes
 * {{token}} placeholders with escaped values, then turns newlines into <br>
 * so paragraph breaks the admin typed show up in the sent email. Unknown
 * tokens (e.g. a typo) are left as literal text rather than silently
 * dropped, so the mistake is visible in the sent email instead of vanishing.
 */
export function renderReminderBodyHtml(
  template: string,
  values: Record<string, string>
): string {
  const escapedTemplate = escapeHtml(template)

  const substituted = escapedTemplate.replace(TOKEN_PATTERN, (match, key: string) => {
    if (!(key in values)) return match
    return escapeHtml(values[key])
  })

  return substituted.replace(/\r\n|\n/g, '<br>')
}

/**
 * Renders the plain-text subject line: no HTML escaping (it's an email
 * header, not markup), and any newline in the template/values is collapsed
 * to a space so a stray line break can't create a second header line.
 */
export function renderReminderSubject(
  template: string,
  values: Record<string, string>
): string {
  const substituted = template.replace(TOKEN_PATTERN, (match, key: string) => {
    if (!(key in values)) return match
    return values[key]
  })

  return substituted.replace(/\r\n|\n/g, ' ').trim()
}
