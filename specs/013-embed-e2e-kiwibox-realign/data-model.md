# Data Model: embed E2E 스위트 kiwibox 재정렬

영속 데이터 없음 — 엔티티는 시나리오 계약과 runner 판정 확장.

## E1. embed 시나리오 (22건)

| 속성 | 규칙 |
|------|------|
| `id` | `EC-{AXIS}-NN` 유지 (축·건수 보존 — FR-006) |
| `axis` | ALLOW/DENY/FILTER — 불변 |
| `embed_config` | 기존 4종 이름 불변 (allow-all/deny/filter-attendance/filter-salary-personnel) |
| `message` | 본인 기준 현행화 — "사번" 문구 금지 (FR-002), `@agent` prefix 없음 |
| `expect` | 정본: [contracts/scenario-mapping.md](./contracts/scenario-mapping.md) — `.do` URL + `cmd=`/`queryId=` body (FR-001) |

## E2. embed runner `expect` 확장

specs/012 [e2e-assertion-schema.md](../012-hr-answer-quality/contracts/e2e-assertion-schema.md)
계약 준용 — `answer_pattern`/`answer_not_pattern`/`max_hr_calls` 옵셔널 3종 +
`hrCallCount` 기록. 차이점:

- mock 대조 필터: `.do`만 (구 `/api/v1` 제거)
- `effectiveToolCall`(mock-hit 근거) 판정은 embed 고유 — 유지

## E3. 공유 mock

- embed 자체 `mock-hr-api.js` 삭제 → runner가 `../e2e-hr-skill/mock-hr-api.js` spawn
- 포트 분리 유지: embed 기본 `8001` (hr-skill `8000`과 병행 충돌 방지)
- fixture 추가 없음 (R4) — FR-004의 "기존 시나리오 무영향"은 무변경으로 자동 충족

## 관계

```text
scenarios.json(E1) → runner 판정(E2) → 공유 mock(E3) 로그 대조
embed_config 4종(helpers — 무수정) → 축별 허용/차단 → tool_call 판정
```
