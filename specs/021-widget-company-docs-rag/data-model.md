# Data Model: 위젯 회사별 사규 문서 RAG

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## 1. `embed_configs` (기존, 컬럼 추가)

| 컬럼 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `allow_company_documents` | Boolean | `false` | 이 embed에서 회사 문서 업로드·검색 허용 (opt-in, R4) |

`EmbedConfig` 모델의 writable 필드 목록과 validation(`server/models/embedConfig.js`, `client_tool_execution`과 같은 위치)에 추가한다.

## 2. `embed_company_documents` (신규)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `embed_id` | Int | FK → `embed_configs.id`, `onDelete: Cascade` | 소속 embed(= 워크스페이스) |
| `company_key` | String | not null | `companyData.name.trim()` 원문 (D4) |
| `company_hash` | String | not null | `sha256(company_key)` 앞 16 hex |
| `filename` | String | not null | 사용자가 올린 원래 파일 이름(표시용) |
| `uploader_name` | String | nullable | 올린 사람 표시명 (D13) |
| `status` | String | not null, 기본 `processing` | `processing` / `ready` / `failed` |
| `error` | String | nullable | 실패 사유 코드(`DRM`·`ENCRYPTED`·`NO_TEXT`·`GENERIC`·`INTERRUPTED`) — 문구는 위젯 i18n |
| `doc_id` | String | nullable, unique | 벡터 docId(uuid). `ready`일 때만 채워짐 |
| `location` | String | nullable | 변환 JSON 상대 경로 `<hash>/<file>.json` (`company-documents/` 기준). `doc_id`와 함께 **임베딩 전에** 기록해, 처리 중 재시작돼도 부팅 복구가 남은 벡터·JSON을 지운다 |
| `createdAt` | DateTime | `now()` | 올린 시각 |
| `lastUpdatedAt` | DateTime | `now()` | |

인덱스: `(embed_id, company_hash)`.

마이그레이션: `server/prisma/migrations/20261110000000_add_embed_company_documents/migration.sql` (PostgreSQL, 기존 네이밍 규칙). 컬럼 추가와 테이블 생성을 한 마이그레이션에 둔다.

### 상태 전이

```text
(업로드) → processing ──변환·임베딩 성공──→ ready
                     └─변환 실패/임베딩 실패/서버 재시작──→ failed
ready | failed ──삭제──→ (행 삭제 + 벡터·JSON 삭제)
processing ──삭제──→ (행 삭제) → 큐 작업 완료 시점에 행이 없으면 방금 만든 벡터·JSON을 지움
```

## 3. 파생 값 (저장하지 않음)

| 이름 | 규칙 |
|---|---|
| 회사 namespace | `${embed.workspace.slug}-co-${embed.id}-${company_hash}` — 목록·삭제와 같은 embed 단위(같은 워크스페이스를 쓰는 다른 embed와 섞이지 않음) |
| 저장 폴더 | `<STORAGE_DIR>/company-documents/${company_hash}/` — `documents/` 밖(관리자 문서 선택기 비노출) |
| hotdir 파일 이름 | `${uuid8}-${정규화된 원래 파일 이름}` (동시 업로드 충돌 방지) |

## 4. 검증 규칙

- `company_key`: trim 후 1~200자. 비면 400 (FR-002).
- 파일: 1개/요청, ≤ 50MB(50 × 1024 × 1024 bytes), 확장자 ∈ collector `ACCEPTED_MIMES` 전체(+ `.hwp`, `.hwpx`). 위반 시 400/413 + 사유 코드.
- `uploader_name`: trim 후 최대 100자, 비면 null.
- 조회·삭제: `embed_id`와 `company_hash`가 모두 일치하는 행만 대상. 불일치는 404.

## 5. 기존 테이블 영향

- `document_vectors`: 회사 문서 청크도 `{docId, vectorId}`로 기록된다(기존 `addDocumentToNamespace` 동작). 삭제 시 `docId`로 정리.
- `workspace_documents`: **사용하지 않는다**. 회사 문서는 관리자 화면 워크스페이스 문서 목록에 나타나지 않는다(Out of Scope와 일치).
