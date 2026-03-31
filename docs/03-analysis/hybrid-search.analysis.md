# Gap Analysis Report: hybrid-search

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | hybrid-search (PGVector + BM25 하이브리드 검색) |
| Analysis Date | 2026-03-31 |
| Match Rate | **100% (22/22)** |
| Files Analyzed | 12 |
| Gaps Found | 0 |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | PGVector 코사인 유사도만으로는 정확한 키워드 매칭 부족 |
| Solution | tsvector + pg_trgm + RRF 하이브리드 검색 구현 |
| Function UX Effect | 의미 검색 + 키워드 검색 결합으로 한국어 HR 쿼리 정확도 향상 |
| Core Value | RAG 검색 품질 개선 → LLM 응답 정확도 향상 |

---

## Analysis Results

| Category | Items | Score | Status |
|----------|:-----:|:-----:|:------:|
| SQL Schema | 5 | 100% | PASS |
| Core Logic (3 new methods + INSERT + branch) | 6 | 100% | PASS |
| Model Validation | 1 | 100% | PASS |
| Search Orchestration | 2 | 100% | PASS |
| Chat Handler Flags (8 locations) | 8 | 100% | PASS |
| Frontend UI | 1 | 100% | PASS |
| **Overall** | **22** | **100%** | **PASS** |

---

## Verified Items

### 1. SQL File (`hybrid-search-setup.sql`)

| # | Item | Status |
|---|------|:------:|
| 1 | `CREATE EXTENSION IF NOT EXISTS pg_trgm` | OK |
| 2 | `ALTER TABLE ADD COLUMN text_search tsvector` | OK |
| 3 | GIN index: `idx_vectors_text_search` (tsvector) | OK |
| 4 | GIN index: `idx_vectors_text_trgm` (trigram) | OK |
| 5 | Backfill: `UPDATE ... SET text_search = to_tsvector(...)` | OK |

All statements idempotent (IF NOT EXISTS / WHERE NULL).

### 2. PGVector Core Logic (`pgvector/index.js`)

| # | Item | Status | Detail |
|---|------|:------:|--------|
| 6 | INSERT query includes `text_search` | OK | `to_tsvector('simple', $5)` |
| 7 | `keywordSearchResponse()` | OK | ts_rank(0.4) + similarity(0.6) |
| 8 | `rrfFusion()` | OK | k=60, docId+chunkIndex dedup |
| 9 | `hybridSearchResponse()` | OK | Promise.all 병렬 실행 |
| 10 | `performSimilaritySearch()` 분기 | OK | hybridSearch param 추가 |
| 11 | candidateCount = topN * 3 | OK | RRF 품질을 위한 over-fetch |

### 3. Model Validation (`workspace.js`)

| # | Item | Status | Detail |
|---|------|:------:|--------|
| 12 | vectorSearchMode에 "hybrid" 허용 | OK | `["default", "rerank", "hybrid"]` |

### 4. Search Orchestration (`mergeSharedResults.js`)

| # | Item | Status | Detail |
|---|------|:------:|--------|
| 13 | hybridSearch 파라미터 추가 | OK | default: false |
| 14 | shared search에도 hybridSearch 전달 | OK | local + shared 양쪽 |

### 5. Chat Handler Flags (8 locations)

| # | File | Status |
|---|------|:------:|
| 15 | `chats/stream.js` | OK |
| 16 | `chats/apiChatHandler.js` (1st) | OK |
| 17 | `chats/apiChatHandler.js` (2nd) | OK |
| 18 | `chats/openaiCompatible.js` (1st) | OK |
| 19 | `chats/openaiCompatible.js` (2nd) | OK |
| 20 | `chats/embed.js` | OK |
| 21 | `chats/react/index.js` | OK |
| 22 | `agents/aibitat/plugins/memory.js` | OK |

All use pattern: `hybridSearch: workspace?.vectorSearchMode === "hybrid"`

Note: `endpoints/api/workspace/index.js`도 수정되었으나, 이 파일은 `performSimilaritySearch`를 직접 호출하여 Plan의 8곳 항목에 이미 포함됨.

### 6. Frontend UI (`VectorSearchMode/index.jsx`)

| # | Item | Status |
|---|------|:------:|
| - | supportedVectorDBs에 "pgvector" 포함 | OK |
| - | hint.hybrid 객체 정의 | OK |
| - | pgvector → hybrid, lancedb → rerank 조건부 렌더링 | OK |

---

## Gaps Found

**없음.** 계획서의 모든 항목이 구현됨.

---

## Plan 대비 추가 구현 (긍정적)

| 추가 사항 | 위치 | 목적 |
|-----------|------|------|
| `sanitizeForJsonb()` 적용 | index.js INSERT | Postgres NUL 문자 방지 |
| `candidateCount = topN * 3` | hybridSearchResponse | RRF 융합 품질 향상 |
| 디버그 로그 출력 | hybridSearchResponse | vector/keyword 후보 수 관찰 |

---

## Verdict

Match Rate **100%**. 수정 조치 불필요. `/pdca report hybrid-search`로 진행 가능.
