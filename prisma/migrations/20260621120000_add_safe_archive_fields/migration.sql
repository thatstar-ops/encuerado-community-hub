ALTER TABLE "Event"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Member"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "VolunteerProfile"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "VolunteerShift"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
