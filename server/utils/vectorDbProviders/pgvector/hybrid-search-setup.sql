-- ============================================================
-- Hybrid Search Setup for AnythingLLM PGVector
-- ============================================================
-- 목적: 기존 벡터 유사도 검색에 BM25 키워드 검색을 추가하기 위한
--       PostgreSQL 스키마 변경 스크립트
--
-- 실행 대상: anythingllm 데이터베이스
-- 실행 순서: Step 1 → 2 → 3 → 4 순서대로 실행
-- 멱등성: 모든 구문은 IF NOT EXISTS를 사용하여 반복 실행 안전
-- ============================================================

-- Step 0: docker compose 로 실행된 pgvector 접속 방법 
-- 1. 대화형 쉘(psql)로 직접 접속하기
-- docker exec -it <컨테이너_이름> psql -U <사용자명> -d <데이터베이스명>
-- 2. 접속하지 않고 바로 한 줄 쿼리 실행하기 (-c 옵션)
-- docker exec -it <컨테이너_이름> psql -U <사용자명> -d <데이터베이스명> -c "SELECT * FROM my_table LIMIT 5;"

-- Step 1: pg_trgm 확장 설치
-- 트라이그램 기반 유사도 검색 (한국어 포함 모든 언어 지원)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: text_search 컬럼 추가 (tsvector)
-- 풀텍스트 검색용 컬럼, nullable이므로 기존 데이터에 영향 없음
ALTER TABLE "anythingllm_vectors"
  ADD COLUMN IF NOT EXISTS "text_search" tsvector;

-- Step 3: GIN 인덱스 생성 (2개)

-- 3-a: tsvector 풀텍스트 검색 인덱스
CREATE INDEX IF NOT EXISTS "idx_vectors_text_search"
  ON "anythingllm_vectors" USING GIN ("text_search");

-- 3-b: pg_trgm 트라이그램 유사도 인덱스 (metadata JSONB 내 text 필드)
CREATE INDEX IF NOT EXISTS "idx_vectors_text_trgm"
  ON "anythingllm_vectors" USING GIN ((metadata->>'text') gin_trgm_ops);

-- Step 4: 기존 데이터 백필
-- text_search 컬럼이 NULL인 행에 대해 metadata.text로부터 tsvector 생성
-- 'simple' 설정: 공백 기반 토큰화 (한국어 어절 단위 매칭)
UPDATE "anythingllm_vectors"
SET "text_search" = to_tsvector('simple', COALESCE(metadata->>'text', ''))
WHERE "text_search" IS NULL;

-- ============================================================
-- 검증 쿼리 (실행 후 확인용)
-- ============================================================

-- 컬럼 확인
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'anythingllm_vectors' AND column_name = 'text_search';

-- 인덱스 확인
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'anythingllm_vectors'
--   AND indexname IN ('idx_vectors_text_search', 'idx_vectors_text_trgm');

-- 백필 확인 (NULL 남은 행 수)
-- SELECT COUNT(*) FROM "anythingllm_vectors" WHERE "text_search" IS NULL;

-- pg_trgm 동작 확인 (한국어 트라이그램 유사도)
-- SELECT similarity(metadata->>'text', '연차') AS sim, metadata->>'text'
-- FROM "anythingllm_vectors"
-- ORDER BY sim DESC LIMIT 5;

-- 추가된 extention 검색 
-- SELECT * FROM pg_extension WHERE extname = 'pg_trgm';