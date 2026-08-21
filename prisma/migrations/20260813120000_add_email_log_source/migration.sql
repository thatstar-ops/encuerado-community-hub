-- Tags each EmailLog row with which code path sent it (ShiftReminder,
-- RegistrationConfirmation, Campaign), so shift reminder sends can be
-- filtered and reviewed on /admin/volunteer-shift-reminders without mixing
-- in unrelated transactional email.
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "EmailLog_source_idx" ON "EmailLog"("source");
