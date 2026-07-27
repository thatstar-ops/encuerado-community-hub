-- AlterTable
ALTER TABLE "Event" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Initialize existing events
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "startsAt" ASC, "createdAt" ASC) - 1 AS row_num
  FROM "Event"
)
UPDATE "Event"
SET "displayOrder" = numbered.row_num * 10
FROM numbered
WHERE "Event".id = numbered.id;