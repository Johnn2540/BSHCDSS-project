-- Existing tutors retain read-only access until an administrator promotes them.
ALTER TABLE "User" ADD COLUMN "canManageContent" BOOLEAN NOT NULL DEFAULT false;
