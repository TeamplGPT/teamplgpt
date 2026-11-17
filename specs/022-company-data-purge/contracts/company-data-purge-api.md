# Contract: 회사 데이터 파기 API

Base: `{TEAMPLGPT_BASE_URL}/api`

## POST `/v1/company-data/purge`

- 미들웨어: `validApiKey` (기존 Developer API 키, `Authorization: Bearer …`)
  - 키 없음·틀림 → `403 { "error": "No valid api key found." }` (기존 validApiKey와 동일)
- Body JSON:
  - `companyName` (string, 필수) — trim 후 매칭. 빈 값 → `400 { "error": "COMPANY_REQUIRED" }`
  - `reason` (string, 선택) — `contract_expired` | `admin_terminated` | `other`. 그 외·없으면 로그에만 기록
- 성공 `200`:
```json
{
  "success": true,
  "companyName": "오이사공",
  "purged": true,
  "details": {
    "companyDocuments": 3,
    "vectorNamespaces": 2
  }
}
```
- 문서가 0건이어도 `200` + `companyDocuments: 0` (멱등)
- 처리 중 예외 → `500 { "success": false, "error": "PURGE_FAILED" }`

## 파기 대상

`company_hash`가 같은 `embed_company_documents` 전 embed:
1. 벡터·DocumentVectors·JSON 파일 제거
2. DB 행 삭제
3. 빈 company namespace drop
4. `storage/company-documents/<hash>/` 폴더 정리

## Non-goals (v1)

- embed_chats: 세션에 회사명 없음 → 회사별 삭제 불가
- 워크스페이스 공통 문서
