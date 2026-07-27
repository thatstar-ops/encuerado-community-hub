-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ATTENDEE', 'VIP_ATTENDEE', 'STAFF', 'SPONSOR');

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "role" "MemberRole" NOT NULL DEFAULT 'ATTENDEE';
