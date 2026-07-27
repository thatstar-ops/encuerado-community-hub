'use client'

import { useEffect, useState } from 'react'
import { mergeMembers } from '@/lib/member-merge-actions'
import type { DuplicateGroup } from '@/lib/duplicate-members'

type SearchResult = {
  id: string
  firstName: string
  lastName: string
  preferredName: string | null
  email: string
  phone: string | null
  city: string | null
  state: string | null
  createdAt: string | Date
  recordCount: number
  counts: {
    registrations: number
    volunteerAssignments: number
    ticketPurchases: number
    sponsorFulfillments: number
    participationRecords: number
  }
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

function useMemberSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [query])

  return { results, loading }
}

function displayName(member: SearchResult) {
  return member.preferredName || `${member.firstName} ${member.lastName}`
}

function SearchPicker({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: SearchResult | null
  onSelect: (member: SearchResult | null) => void
}) {
  const [query, setQuery] = useState('')
  const { results, loading } = useMemberSearch(query)

  return (
    <div className="rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-4">
      <h3 className="font-bold text-white">{label}</h3>

      {selected ? (
        <div className="mt-3 rounded-lg border border-[#B11218] bg-[#151111] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-white">{displayName(selected)}</div>
              <div className="text-sm text-[#B7B7B7]">{selected.email}</div>
              {selected.phone && <div className="text-sm text-[#B7B7B7]">{selected.phone}</div>}
              {(selected.city || selected.state) && (
                <div className="text-sm text-[#B7B7B7]">
                  {[selected.city, selected.state].filter(Boolean).join(', ')}
                </div>
              )}
              <div className="mt-2 text-xs text-[#8F8F8F]">
                {selected.recordCount} related record{selected.recordCount === 1 ? '' : 's'}:{' '}
                {selected.counts.registrations} event registration
                {selected.counts.registrations === 1 ? '' : 's'}, {selected.counts.volunteerAssignments} volunteer
                assignment{selected.counts.volunteerAssignments === 1 ? '' : 's'},{' '}
                {selected.counts.ticketPurchases} ticket purchase{selected.counts.ticketPurchases === 1 ? '' : 's'},{' '}
                {selected.counts.sponsorFulfillments} sponsor record{selected.counts.sponsorFulfillments === 1 ? '' : 's'},{' '}
                {selected.counts.participationRecords} participation record
                {selected.counts.participationRecords === 1 ? '' : 's'}.
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded border border-[#3A1215] px-3 py-1 text-xs font-bold text-white hover:border-[#B11218]"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or phone"
            className={inputClass}
          />

          {loading && <p className="text-sm text-[#8F8F8F]">Searching...</p>}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-[#8F8F8F]">No matches.</p>
          )}

          {results.length > 0 && (
            <div className="grid max-h-64 gap-2 overflow-y-auto">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="rounded-lg border border-[#2A0E10] bg-[#151111] p-3 text-left hover:border-[#B11218]"
                >
                  <div className="font-bold text-white">{displayName(result)}</div>
                  <div className="text-sm text-[#B7B7B7]">{result.email}</div>
                  <div className="text-xs text-[#8F8F8F]">{result.recordCount} related records</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DuplicateGroupsList({
  groups,
  onReview,
}: {
  groups: DuplicateGroup[]
  onReview: (a: SearchResult, b: SearchResult) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
        <h3 className="font-bold text-white">Possible duplicates</h3>
        <p className="mt-1 text-sm text-[#8F8F8F]">
          None found automatically right now (matched by identical name or identical phone
          number). You can still search and merge any two records manually below.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
      <h3 className="font-bold text-white">Possible duplicates found automatically</h3>
      <p className="mt-1 text-sm text-[#8F8F8F]">
        Matched by identical name or identical phone number - these always have different
        email addresses, which is exactly the case nothing else catches automatically. A
        shared name is a strong hint, not proof: check both records before merging.
      </p>

      <div className="mt-3 grid gap-2">
        {groups.map((group, groupIndex) => (
          <div
            key={groupIndex}
            className="grid gap-2 rounded-lg border border-[#2A0E10] bg-[#0B0B0B] p-3 md:flex md:items-center md:justify-between"
          >
            <div className="grid gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#B11218]">
                Matched by {group.matchedBy === 'name' ? 'name' : 'phone number'}
              </span>
              <div className="text-sm text-[#B7B7B7]">
                {group.members.map((member, i) => (
                  <span key={member.id}>
                    {i > 0 && ' · '}
                    <span className="font-bold text-white">
                      {member.preferredName || `${member.firstName} ${member.lastName}`}
                    </span>{' '}
                    ({member.email})
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onReview(
                  { ...group.members[0] },
                  { ...group.members[1] }
                )
              }
              className="rounded-lg border border-[#B11218] px-4 py-2 text-sm font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Review these two
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MemberMergeForm({ duplicateGroups = [] }: { duplicateGroups?: DuplicateGroup[] }) {
  const [selectedA, setSelectedA] = useState<SearchResult | null>(null)
  const [selectedB, setSelectedB] = useState<SearchResult | null>(null)
  const [keepSide, setKeepSide] = useState<'A' | 'B'>('A')
  const [confirmPhrase, setConfirmPhrase] = useState('')

  // Default to keeping whichever record has more history once both are picked.
  useEffect(() => {
    if (selectedA && selectedB) {
      setKeepSide(selectedA.recordCount >= selectedB.recordCount ? 'A' : 'B')
    }
  }, [selectedA, selectedB])

  const bothSelected = Boolean(selectedA && selectedB)
  const keeper = keepSide === 'A' ? selectedA : selectedB
  const loser = keepSide === 'A' ? selectedB : selectedA
  const canSubmit = bothSelected && confirmPhrase.trim() === 'MERGE'

  return (
    <div className="grid gap-6">
      <DuplicateGroupsList
        groups={duplicateGroups}
        onReview={(a, b) => {
          setSelectedA(a)
          setSelectedB(b)
        }}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SearchPicker label="Record A" selected={selectedA} onSelect={setSelectedA} />
        <SearchPicker label="Record B" selected={selectedB} onSelect={setSelectedB} />
      </div>

      {bothSelected && keeper && loser && (
        <div className="rounded-lg border border-[#2A0E10] bg-black p-4">
          <h3 className="font-bold text-white">Which record should survive?</h3>
          <p className="mt-1 text-sm text-[#8F8F8F]">
            The other record's history (registrations, tickets, volunteer shifts, sponsor
            records, participation records) will be moved onto the one you keep, then the
            other record will be archived - not deleted.
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label
              className={
                keepSide === 'A'
                  ? 'flex items-center gap-3 rounded-lg border border-[#B11218] bg-[#151111] p-3'
                  : 'flex items-center gap-3 rounded-lg border border-[#2A0E10] bg-[#151111] p-3'
              }
            >
              <input type="radio" checked={keepSide === 'A'} onChange={() => setKeepSide('A')} />
              <span className="font-bold text-white">Keep Record A ({displayName(selectedA!)})</span>
            </label>

            <label
              className={
                keepSide === 'B'
                  ? 'flex items-center gap-3 rounded-lg border border-[#B11218] bg-[#151111] p-3'
                  : 'flex items-center gap-3 rounded-lg border border-[#2A0E10] bg-[#151111] p-3'
              }
            >
              <input type="radio" checked={keepSide === 'B'} onChange={() => setKeepSide('B')} />
              <span className="font-bold text-white">Keep Record B ({displayName(selectedB!)})</span>
            </label>
          </div>

          <p className="mt-3 text-sm text-[#B7B7B7]">
            <span className="font-bold text-white">{displayName(loser)}</span> ({loser.email}) will
            be archived and its history moved onto{' '}
            <span className="font-bold text-white">{displayName(keeper)}</span> ({keeper.email}).
          </p>

          <form action={mergeMembers} className="mt-4 grid gap-3">
            <input type="hidden" name="keepId" value={keeper.id} />
            <input type="hidden" name="mergeId" value={loser.id} />

            <label className="grid gap-2">
              <span className="font-bold text-white">Type MERGE to confirm</span>
              <input
                value={confirmPhrase}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                name="confirmPhrase"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-[#B11218] px-5 py-3 font-bold text-white hover:bg-[#D11A22] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Merge Records
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
