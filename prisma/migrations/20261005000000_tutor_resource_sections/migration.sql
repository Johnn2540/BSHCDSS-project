CREATE TYPE "ResourceSection" AS ENUM ('DOCUMENTS', 'REPORTS', 'PLANS_ACTIVITIES');
ALTER TABLE "Document" ADD COLUMN "portalSection" "ResourceSection" NOT NULL DEFAULT 'DOCUMENTS';
CREATE INDEX "Document_portalSection_audience_isPublished_idx" ON "Document"("portalSection", "audience", "isPublished");
