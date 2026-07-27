-- AlterTable
ALTER TABLE "Event" ADD COLUMN "flyerImageUrl" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "externalKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_externalKey_key" ON "Event"("externalKey");
