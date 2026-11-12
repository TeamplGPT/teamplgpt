-- 회사 문서 허용을 기본 켜짐으로 전환 (운영 초기 — 나중에 기본 꺼짐으로 되돌릴 예정)
ALTER TABLE "embed_configs" ALTER COLUMN "allow_company_documents" SET DEFAULT true;

-- 기존 embed도 켬
UPDATE "embed_configs" SET "allow_company_documents" = true;
