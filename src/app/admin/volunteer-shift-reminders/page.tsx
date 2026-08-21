import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireNonCheckInAdmin } from '@/lib/auth'
import ActionNotice from '@/components/admin/ActionNotice'
import {
  updateShiftReminderSettings,
  sendShiftRemindersNowAction,
} from '@/lib/shift-reminder-settings-actions'
import {
  ensureShiftReminderSettings,
  renderReminderBodyHtml,
  renderReminderSubject,
  SHIFT_REMINDER_TOKENS,
} from '@/lib/shift-reminder-settings'

const LOG_TIME_ZONE = 'America/Los_Angeles'

function formatLogDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOG_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

function relativeTimeFor(daysBefore: number) {
  if (daysBefore === 0) return 'today'
  if (daysBefore === 1) return 'tomorrow'
  return `in ${daysBefore} days`
}

const SAMPLE_VALUES_BASE = {
  firstName: 'Alex',
  shiftTitle: 'Check-in Desk',
  eventTitle: 'Primer Impacto',
  shiftTime: 'Friday, September 4 at 5:00 PM PDT',
  location: 'Main Hall',
  roleDescription:
    'Greet arriving guests, scan tickets, and direct volunteers who need shirts to the merch table.',
}

export default async function VolunteerShiftRemindersPage({
  searchParams,
}: {
  searchParams?: Promise<{ actionMessage?: string; actionStatus?: string }>
}) {
  await requireNonCheckInAdmin()

  const queryParams = searchParams ? await searchParams : {}
  const settings = await ensureShiftReminderSettings()

  const sampleValues = {
    ...SAMPLE_VALUES_BASE,
    relativeTime: relativeTimeFor(settings.daysBefore),
  }

  const previewSubject = renderReminderSubject(settings.subjectTemplate, sampleValues)
  const previewBodyHtml = renderReminderBodyHtml(settings.bodyTemplate, sampleValues)

  // Ground truth for "did this actually send": every successful send (both
  // automatic touchpoints AND manual blasts) writes an EmailLog row with
  // source: 'ShiftReminder', status: 'Sent' - this is the only record type
  // that stays complete now that manual sends deliberately don't stamp
  // reminderSentAt/secondReminderSentAt on the assignment.
  const confirmedSends = await prisma.emailLog.findMany({
    where: { status: 'Sent', source: 'ShiftReminder' },
    orderBy: { sentAt: 'desc' },
    take: 100,
    select: {
      id: true,
      sentAt: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  // Failure diagnostics - only reliably scoped to shift reminders for sends
  // after the `source` column shipped. Older failures (if any) won't be
  // tagged and won't show up here.
  const failedSends = await prisma.emailLog.findMany({
    where: { status: 'Failed', source: 'ShiftReminder' },
    orderBy: { sentAt: 'desc' },
    take: 50,
    select: {
      id: true,
      sentAt: true,
      error: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <ActionNotice message={queryParams.actionMessage} status={queryParams.actionStatus} />

        <div className="mb-6">
          <Link
            href="/admin/volunteer-roles"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            ← Back to volunteer roles
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Shift Reminder Email
          </h1>
          <p className="mt-3 text-lg text-[#B7B7B7]">
            This is the automatic email sent to volunteers before their shift starts. It runs
            once a day and checks two independent touchpoints - a first reminder and a second,
            closer-in reminder - each controlled separately below.
          </p>

          <form action={updateShiftReminderSettings} className="mt-8 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-base font-bold text-white">First reminder: days before shift</span>
                <input
                  name="daysBefore"
                  type="number"
                  min={0}
                  max={30}
                  required
                  defaultValue={settings.daysBefore}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Second reminder: days before shift</span>
                <input
                  name="secondDaysBefore"
                  type="number"
                  min={0}
                  max={30}
                  required
                  defaultValue={settings.secondDaysBefore}
                  className={inputClass}
                />
              </label>
            </div>
            <span className="text-sm text-[#8F8F8F]">
              The automatic cron runs once a day and checks both touchpoints independently, so a
              volunteer gets a reminder at each one (e.g. 7 days out, then again 1 day out) - one
              firing doesn't cancel or replace the other. Same email template both times.
            </span>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Subject line</span>
              <input
                name="subjectTemplate"
                required
                defaultValue={settings.subjectTemplate}
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-bold text-white">Email body</span>
              <textarea
                name="bodyTemplate"
                rows={12}
                required
                defaultValue={settings.bodyTemplate}
                className={inputClass + ' font-mono text-sm'}
              />
            </label>

            <div className="rounded-xl border border-[#3A1215] bg-[#151111] p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-white/70">
                Available tokens
              </h3>
              <p className="mt-1 text-sm text-[#8F8F8F]">
                Use these anywhere in the subject or body. Anything else you type is sent as-is.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SHIFT_REMINDER_TOKENS.map((item) => (
                  <div key={item.token} className="text-sm">
                    <code className="rounded bg-black/50 px-1.5 py-0.5 text-[#D11A22]">
                      {'{{' + item.token + '}}'}
                    </code>{' '}
                    <span className="text-[#B7B7B7]">— {item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Save Reminder Settings
            </button>
          </form>

          {settings.updatedByEmail && (
            <p className="mt-4 text-sm text-[#8F8F8F]">
              Last edited by {settings.updatedByEmail} on{' '}
              {new Date(settings.updatedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white">Send Reminders Now</h2>
          <p className="mt-2 text-sm text-[#8F8F8F]">
            Sends immediately to every volunteer with an active assignment on any upcoming shift,
            no matter how far away. There is no dedup: this will re-send to volunteers who already
            got a reminder, including duplicates on the same day. It never marks the automatic
            touchpoints as done, so it can't cause the daily cron to skip anyone later.
          </p>

          <form action={sendShiftRemindersNowAction} className="mt-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="confirmSendNow"
                name="confirmSendNow"
                value="yes"
                className="h-5 w-5 rounded border-[#3A1215] bg-[#0B0B0B] text-yellow-400 focus:ring-[#B11218]"
              />
              <label htmlFor="confirmSendNow" className="text-sm font-medium text-[#B7B7B7]">
                I understand this sends real emails to every upcoming-shift volunteer right now,
                even if they've already been reminded.
              </label>
            </div>
            <button
              type="submit"
              className="w-fit rounded-lg border border-red-500 bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
            >
              Send Reminders Now
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white">Confirmed Sends ({confirmedSends.length})</h2>
          <p className="mt-2 text-sm text-[#8F8F8F]">
            Every reminder that actually went out successfully - both automatic touchpoints and
            manual "Send Now" blasts - most recent first. Duplicates (e.g. from repeated manual
            sends) show up here as separate rows on purpose. Only covers sends after the shift
            reminder log started tracking a source, so it won't include anything from before then.
          </p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-[#3A1215]">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-[#151111] text-white">
                <tr>
                  <th className="p-3 font-bold">Sent</th>
                  <th className="p-3 font-bold">Volunteer</th>
                </tr>
              </thead>
              <tbody>
                {confirmedSends.map((log) => (
                  <tr key={log.id} className="border-t border-[#2A0E10] bg-[#0B0B0B]">
                    <td className="p-3 text-[#B7B7B7]">{formatLogDate(log.sentAt)}</td>
                    <td className="p-3 text-[#B7B7B7]">
                      {log.member.firstName} {log.member.lastName}
                      <br />
                      <span className="text-xs text-[#777777]">{log.member.email}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {confirmedSends.length === 0 && (
              <div className="border-t border-[#2A0E10] bg-[#0B0B0B] p-5 text-[#B7B7B7]">
                No reminders have ever been sent yet - nothing has gone out.
              </div>
            )}
          </div>

          {failedSends.length > 0 && (
            <>
              <h3 className="mt-8 text-lg font-bold text-white">Failed Sends ({failedSends.length})</h3>
              <p className="mt-2 text-sm text-[#8F8F8F]">
                Only tracks failures since this log was added - older failures (if any) won't show
                here.
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-orange-500/30">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-[#151111] text-white">
                    <tr>
                      <th className="p-3 font-bold">Attempted</th>
                      <th className="p-3 font-bold">Volunteer</th>
                      <th className="p-3 font-bold">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedSends.map((log) => (
                      <tr key={log.id} className="border-t border-orange-500/20 bg-[#0B0B0B]">
                        <td className="p-3 text-[#B7B7B7]">{formatLogDate(log.sentAt)}</td>
                        <td className="p-3 text-[#B7B7B7]">
                          {log.member.firstName} {log.member.lastName}
                          <br />
                          <span className="text-xs text-[#777777]">{log.member.email}</span>
                        </td>
                        <td className="p-3 text-[#FFB3B6]">{log.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white">Preview with sample data</h2>
          <p className="mt-2 text-sm text-[#8F8F8F]">
            Shown with a made-up volunteer and shift, using the settings currently saved above
            (not whatever you're mid-typing).
          </p>

          <div className="mt-5 rounded-xl border border-[#3A1215] bg-white p-6 text-black">
            <div className="border-b border-black/10 pb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-black/50">Subject</span>
              <p className="mt-1 font-bold">{previewSubject}</p>
            </div>
            <div
              className="mt-4 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
