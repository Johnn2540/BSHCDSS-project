-- Optional public contact details for editable team profiles.
ALTER TABLE "TeamMember"
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT;

