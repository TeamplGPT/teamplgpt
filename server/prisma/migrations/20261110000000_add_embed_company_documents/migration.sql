-- AlterTable
ALTER TABLE "embed_configs"
  ADD COLUMN "allow_company_documents" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "embed_company_documents" (
    "id" SERIAL NOT NULL,
    "embed_id" INTEGER NOT NULL,
    "company_key" TEXT NOT NULL,
    "company_hash" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploader_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "doc_id" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embed_company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "embed_company_documents_doc_id_key" ON "embed_company_documents"("doc_id");

-- CreateIndex
CREATE INDEX "embed_company_documents_embed_id_company_hash_idx" ON "embed_company_documents"("embed_id", "company_hash");

-- AddForeignKey
ALTER TABLE "embed_company_documents" ADD CONSTRAINT "embed_company_documents_embed_id_fkey" FOREIGN KEY ("embed_id") REFERENCES "embed_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
