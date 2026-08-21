-- Reusable volunteer role library: define a job title + description once,
-- reuse it across any number of shifts, and include it automatically in the
-- shift reminder email. See src/lib/volunteer-role-actions.ts and
-- /admin/volunteer-roles.
CREATE TABLE IF NOT EXISTS "VolunteerRole" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerRole_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VolunteerRole_archivedAt_idx" ON "VolunteerRole"("archivedAt");

-- Link shifts to an (optional) role.
ALTER TABLE "VolunteerShift" ADD COLUMN IF NOT EXISTS "roleId" TEXT;

CREATE INDEX IF NOT EXISTS "VolunteerShift_roleId_idx" ON "VolunteerShift"("roleId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VolunteerShift_roleId_fkey'
  ) THEN
    ALTER TABLE "VolunteerShift"
      ADD CONSTRAINT "VolunteerShift_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "VolunteerRole"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Editable settings for the shift reminder email (subject/body wording plus
-- how many days before the shift it goes out). Singleton row, created with
-- defaults on first read by getShiftReminderSettings() in
-- src/lib/volunteer-reminders.ts.
CREATE TABLE IF NOT EXISTS "ShiftReminderSettings" (
    "id" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL DEFAULT 1,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByEmail" TEXT,

    CONSTRAINT "ShiftReminderSettings_pkey" PRIMARY KEY ("id")
);
