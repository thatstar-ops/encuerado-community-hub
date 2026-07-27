-- Tracks whether a "your shift is tomorrow" reminder email has already been
-- sent for this assignment, so the daily reminder cron never double-sends.
ALTER TABLE "VolunteerAssignment" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
