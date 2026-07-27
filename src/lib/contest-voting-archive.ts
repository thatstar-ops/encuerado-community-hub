import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getContestVotingResults } from '@/lib/contest-voting'

export async function saveContestVotingSnapshot({
  sessionId,
  createdByEmail,
  createdByName,
  reason,
}: {
  sessionId: string
  createdByEmail?: string | null
  createdByName?: string | null
  reason?: string | null
}) {
  const results = await getContestVotingResults()

  const sortedContestants = [...results.contestants].sort(
    (a, b) => b.voteCount - a.voteCount
  )

  const winner = sortedContestants[0] || null

  const snapshot = {
    session: results.session,
    totalVotes: results.totalVotes,
    contestants: sortedContestants,
    savedAt: new Date().toISOString(),
  }

  await prisma.$executeRaw`
    INSERT INTO "ContestVotingResultArchive" (
      "id",
      "sessionId",
      "title",
      "totalVotes",
      "winnerName",
      "winnerVotes",
      "snapshotJson",
      "createdByEmail",
      "createdByName",
      "reason",
      "createdAt"
    )
    VALUES (
      ${randomUUID()},
      ${sessionId},
      ${results.session.title},
      ${results.totalVotes},
      ${winner?.name || null},
      ${winner?.voteCount ?? null},
      ${snapshot},
      ${createdByEmail || null},
      ${createdByName || null},
      ${reason || null},
      CURRENT_TIMESTAMP
    )
  `
}

export type ContestVotingArchiveRow = {
  id: string
  sessionId: string
  title: string
  totalVotes: number
  winnerName: string | null
  winnerVotes: number | null
  snapshotJson: any
  createdByEmail: string | null
  createdByName: string | null
  reason: string | null
  createdAt: Date
}

export async function getContestVotingArchives() {
  return prisma.$queryRaw<ContestVotingArchiveRow[]>`
    SELECT
      "id",
      "sessionId",
      "title",
      "totalVotes",
      "winnerName",
      "winnerVotes",
      "snapshotJson",
      "createdByEmail",
      "createdByName",
      "reason",
      "createdAt"
    FROM "ContestVotingResultArchive"
    ORDER BY "createdAt" DESC
  `
}

export async function deleteContestVotingArchive(id: string) {
  await prisma.$executeRaw`
    DELETE FROM "ContestVotingResultArchive"
    WHERE "id" = ${id}
  `
}