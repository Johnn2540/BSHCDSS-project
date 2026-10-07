-- Visitors request a tutor account; an administrator reviews each request. Purely additive.
-- CreateEnum
CREATE TYPE "TutorRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "TutorRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "institution" TEXT NOT NULL,
    "message" TEXT,
    "status" "TutorRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "approvedUserId" TEXT,

    CONSTRAINT "TutorRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorRequest_status_createdAt_idx" ON "TutorRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TutorRequest_email_idx" ON "TutorRequest"("email");

