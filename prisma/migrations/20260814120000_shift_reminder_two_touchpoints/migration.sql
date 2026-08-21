-- Two automatic reminder touchpoints (default 7 days out + 1 day out)
-- instead of a single configurable one, each tracked independently so an
-- assignment can get both without either suppressing the other.
ALTER TABLE "ShiftReminderSettings" ADD COLUMN IF NOT EXISTS "secondDaysBefore" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShiftReminderSettings" ALTER COLUMN "daysBefore" SET DEFAULT 7;

ALTER TABLE "VolunteerAssignment" ADD COLUMN IF NOT EXISTS "secondReminderSentAt" TIMESTAMP(3);

-- Actually apply the new 7-day default to the existing settings row (schema
-- defaults only affect brand-new rows, not this app's existing singleton).
-- Only touches it if still at the old default (1) - won't clobber a value
-- someone deliberately customized to something else.
UPDATE "ShiftReminderSettings" SET "daysBefore" = 7 WHERE "daysBefore" = 1;
