CREATE TYPE "OperationsStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TABLE "EventRunSheetItem" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "time" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "owner" TEXT,
  "location" TEXT,
  "notes" TEXT,
  "status" "OperationsStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventRunSheetItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventStaffTask" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "assignedTo" TEXT,
  "dueAt" TIMESTAMP(3),
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventStaffTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsContact" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "role" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "websiteUrl" TEXT,
  "notes" TEXT,
  "category" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationsContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsSupply" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" TEXT,
  "owner" TEXT,
  "category" TEXT,
  "packed" BOOLEAN NOT NULL DEFAULT false,
  "delivered" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationsSupply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventRunSheetItem_eventId_sortOrder_idx" ON "EventRunSheetItem"("eventId", "sortOrder");
CREATE INDEX "EventRunSheetItem_eventId_time_idx" ON "EventRunSheetItem"("eventId", "time");
CREATE INDEX "EventStaffTask_eventId_status_idx" ON "EventStaffTask"("eventId", "status");
CREATE INDEX "EventStaffTask_eventId_dueAt_idx" ON "EventStaffTask"("eventId", "dueAt");
CREATE INDEX "OperationsContact_archivedAt_idx" ON "OperationsContact"("archivedAt");
CREATE INDEX "OperationsContact_category_idx" ON "OperationsContact"("category");
CREATE INDEX "OperationsSupply_archivedAt_idx" ON "OperationsSupply"("archivedAt");
CREATE INDEX "OperationsSupply_category_idx" ON "OperationsSupply"("category");

ALTER TABLE "EventRunSheetItem"
  ADD CONSTRAINT "EventRunSheetItem_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventStaffTask"
  ADD CONSTRAINT "EventStaffTask_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
