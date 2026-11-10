# Contract: TeamplGPT embed 회사 문서 API

Base: `{TEAMPLGPT_BASE_URL}/api/embed/:embedId`
신규 파일: `server/endpoints/embedCompanyDocuments.js` (등록은 `server/index.js`에서 `embeddedEndpoints` 옆 한 줄 — embed/index.js에 넣으면 기존 테스트가 utils/files 로드로 깨짐)

## 공통

- 미들웨어: `validEmbedConfig` → `companyDocsAllowed`
  - embed `enabled=false` 또는 `allow_company_documents=false` → `403 { error: "COMPANY_DOCS_DISABLED" }`
  - `allowlist_domains`가 설정됐고 `Origin` 불일치 → `401 { error: "ORIGIN_NOT_ALLOWED" }`
  - `companyName` 누락·공백 → `400 { error: "COMPANY_REQUIRED" }`
- `companyName` 위치: GET·DELETE는 쿼리스트링 `?companyName=`, POST는 multipart 필드.
- 응답 `Access-Control-Allow-Origin: *` (기존 stream-chat과 동일).

### Document 객체

```json
{
  "id": 12,
  "filename": "2026 취업규칙.hwp",
  "uploaderName": "홍길동",
  "status": "processing | ready | failed",
  "error": null,
  "createdAt": "2026-11-10T01:23:45.000Z"
}
```

`company_key`, `company_hash`, `doc_id`, `location`은 응답에 넣지 않는다.

## GET `/company-documents?companyName=오이사공`

- 200 `{ "documents": Document[] }` — 해당 embed × 회사의 문서, `createdAt` 내림차순.

## POST `/company-documents`

- `Content-Type: multipart/form-data`
- 필드: `file`(파일 1개, 필수), `companyName`(필수), `uploaderName`(선택)
- 검증 실패:
  - 파일 없음 → `400 { error: "FILE_REQUIRED" }`
  - 50MB 초과 → `413 { error: "FILE_TOO_LARGE" }` (multer `limits.fileSize`)
  - 확장자 미지원, 또는 정리 후 이름이 비는 파일명(` . ` 등) → `400 { error: "UNSUPPORTED_TYPE" }`
  - 처리 대기열 20건 초과 → `429 { error: "QUEUE_FULL" }` (파일 저장 전)
- 파일명: bidi 제어문자(U+200E·U+200F·U+202A–202E·U+2066–2069) 제거, 확장자를 뺀 이름 70자로 자름
- 성공: `202 { "document": Document }` (`status: "processing"`). 변환·임베딩은 서버 큐에서 진행.

## DELETE `/company-documents/:id?companyName=오이사공`

- 행의 `embed_id`·`company_hash`가 요청과 같으면 삭제 → `200 { "success": true }`
- 그 외(없음·다른 회사·다른 embed) → `404 { error: "NOT_FOUND" }`
- `processing` 상태 삭제 허용(data-model §2 상태 전이).

## 실패 사유 코드 → 위젯 표시 문구 (Document.error)

| 서버 원인 | `error` 코드 | 위젯 문구 (en key → ko) |
|---|---|---|
| kordoc `DRM_PROTECTED` | `DRM` | This document is DRM-protected and cannot be read → 보안(DRM)이 걸린 문서라 읽을 수 없습니다 |
| 암호 문서 (`ENCRYPTED`, PDF 암호) | `ENCRYPTED` | This document is password-protected and cannot be read → 암호가 걸린 문서라 읽을 수 없습니다 |
| 텍스트 없음 | `NO_TEXT` | No text was found in this document → 문서에서 글자를 찾지 못했습니다 |
| 기타 변환·임베딩 오류, 작업 시간 초과 | `GENERIC` | This document could not be processed → 문서를 처리하지 못했습니다 |
| 서버 재시작 중단 | `INTERRUPTED` | Processing was interrupted. Please upload it again → 처리 중 중단되었습니다. 다시 올려 주세요 |

`error`는 서버가 코드로 저장하고, 위젯이 locale에 맞춰 번역한다. 모르는 코드는 `GENERIC` 문구로 보여 준다.

## stream-chat 확장 (기존 라우트)

`POST /stream-chat` 요청 본문에 선택 필드 `companyName` 추가.
`embed.allow_company_documents=true`이고 값이 비어 있지 않을 때만 회사 검색을 수행한다. 그 외는 기존과 동일.
