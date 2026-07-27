-- CreateEnum
CREATE TYPE "ParticipationType" AS ENUM ('ATTENDEE', 'VOLUNTEER');

-- CreateTable
CREATE TABLE "ParticipationRecord" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "ParticipationType" NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParticipationRecord_memberId_year_type_key" ON "ParticipationRecord"("memberId", "year", "type");

-- CreateIndex
CREATE INDEX "ParticipationRecord_year_type_idx" ON "ParticipationRecord"("year", "type");

-- AddForeignKey
ALTER TABLE "ParticipationRecord" ADD CONSTRAINT "ParticipationRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
