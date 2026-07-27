-- Indexes for EmailLog lookups by member / campaign (previously unindexed).
CREATE INDEX IF NOT EXISTS "EmailLog_memberId_idx" ON "EmailLog"("memberId");
CREATE INDEX IF NOT EXISTS "EmailLog_campaignId_idx" ON "EmailLog"("campaignId");

-- ContestVotingResultArchive already exists in production (created ad hoc via
-- src/lib/contest-voting-archive.ts raw SQL, outside Prisma's schema). This
-- is declared IF NOT EXISTS so this migration is safe to run whether or not
-- the table is already there, and brings it under schema-drift detection
-- going forward.
CREATE TABLE IF NOT EXISTS "ContestVotingResultArchive" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalVotes" INTEGER NOT NULL,
    "winnerName" TEXT,
    "winnerVotes" INTEGER,
    "snapshotJson" JSONB,
    "createdByEmail" TEXT,
    "createdByName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestVotingResultArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContestVotingResultArchive_sessionId_idx" ON "ContestVotingResultArchive"("sessionId");
CREATE INDEX IF NOT EXISTS "ContestVotingResultArchive_createdAt_idx" ON "ContestVotingResultArchive"("createdAt");

-- New table backing the DB-based login / public-form rate limiting.
CREATE TABLE IF NOT EXISTS "RateLimitAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RateLimitAttempt_key_createdAt_idx" ON "RateLimitAttempt"("key", "createdAt");
