-- Search metadata is optional; existing content and URLs remain valid.
ALTER TABLE "Activity" ADD COLUMN "seoTitle" TEXT, ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "Album" ADD COLUMN "seoTitle" TEXT, ADD COLUMN "seoDescription" TEXT;
