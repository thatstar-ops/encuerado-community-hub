import type { ParticipationRecord } from '@prisma/client'

function isImported(source: string | null, year: number) {
  return Boolean(source && source.toLowerCase().includes('import'))
}

export function ParticipationBadges({ records }: { records: ParticipationRecord[] }) {
  if (!records.length) return <span className="text-[#8F8F8F]">None</span>

  return (
    <div className="flex flex-wrap gap-2">
      {records.map((record) => {
        const imported = isImported(record.source, record.year)

        return (
          <span
            key={record.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white"
          >
            {record.year} {record.type === 'ATTENDEE' ? 'Attendee' : 'Volunteer'}
            {imported && (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold text-slate-900">
                Imported
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export default function ParticipationHistory({ records }: { records: ParticipationRecord[] }) {
  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[#3A1215]">
      <div className="border-b border-[#2A0E10] bg-[#151111] p-4">
        <h2 className="text-2xl font-bold text-white">Participation History</h2>
        <p className="mt-1 text-[#B7B7B7]">
          Imported participation history. This is separate from event registrations and shift assignments.
        </p>
      </div>
      <div className="grid gap-3 bg-[#0B0B0B] p-5">
        {records.length ? (
          records.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between rounded-lg border border-[#2A0E10] bg-[#151111] p-4"
            >
              <span className="font-bold text-white">
                {record.year} {record.type === 'ATTENDEE' ? 'Attendee' : 'Volunteer'}
              </span>
              <span className="text-sm text-[#8F8F8F]">
                {record.source || '—'}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[#B7B7B7]">No participation history recorded.</p>
        )}
      </div>
    </section>
  )
}