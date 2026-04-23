-- AlterTable
ALTER TABLE "embed_configs"
  ADD COLUMN "allow_tool_calling" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowed_skill_hashes" TEXT;
