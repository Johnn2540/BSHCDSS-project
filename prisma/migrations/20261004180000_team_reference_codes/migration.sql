-- Stable, editable references for project key personnel; support profiles may omit them.
ALTER TABLE "TeamMember" ADD COLUMN "referenceCode" TEXT;
CREATE UNIQUE INDEX "TeamMember_referenceCode_key" ON "TeamMember"("referenceCode");
