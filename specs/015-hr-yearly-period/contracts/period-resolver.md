# Contract: 공용 연도 기간 해석 (`_shared/periodResolver.js`)

## 인터페이스

```text
resolveYearPeriod(raw, { kind, now? }) → YearPeriod | null
```

- `raw`: LLM이 넘긴 기간 값(`year_month` 또는 `cal_yy`). 문자열·숫자·`undefined` 모두 받는다.
- `kind`: `"record"` | `"schedule"` (data-model §2).
- `now`: 기준 시각. 생략하면 현재 시각. 계산은 서울 날짜 기준.
- 반환: data-model §1 `YearPeriod` 또는 `null`.
- 순수 함수다. 네트워크·전역 상태를 쓰지 않는다.
- 기존 `_shared/dateResolver.js`의 `resolveDateParam`을 호출하지도 수정하지도 않는다.

## 호출 규약 (각 handler)

1. 기간 값을 받으면 먼저 `resolveYearPeriod`를 부른다.
2. `null`이면 **기존 코드 경로를 한 줄도 바꾸지 않고** 그대로 실행한다(FR-002).
3. 객체면 해당 query_type의 `YearQueryMode`(data-model §3)에 따라 처리한다.

## 테스트 벡터 (now = 2026-10-15 서울)

| raw | kind | 결과 |
|---|---|---|
| `"2026"` | record | `{ year:"2026", start:"20260101", end:"20261015", months: 202601~202610 (10개) }` |
| `"2026"` | schedule | `{ year:"2026", start:"20260101", end:"20261231", months: 12개 }` |
| `"2026년"`, `"2026년도"` | record | `"2026"`과 동일 |
| `"올해"`, `"금년"`, `"이번년도"`, `"이번 년도"`, `"이번해"`, `"당해"` | record | `"2026"` record와 동일 |
| `"작년"`, `"지난해"`, `"전년도"` | record | `{ year:"2025", start:"20250101", end:"20251231", months: 12개 }` |
| `"재작년"` | schedule | `{ year:"2024", end:"20241231", … }` |
| `"내년"` | record | `{ year:"2027", end:"20271231", … }` (미래 연도는 kind 무관 12/31) |
| `"내후년"` | schedule | `{ year:"2028", … }` |
| `" 2 0 2 5 년 "` | record | 공백 제거 후 `"2025년"` → 2025 전체 |
| `"2026년 3월"`, `"올해 3월"`, `"3월"`, `"지난달"`, `"202503"`, `"2026-03"` | 무관 | `null` |
| `undefined`, `null`, `""`, `"   "` | 무관 | `null` |
| `"0315"`, `"1234"`, `"9999"` | 무관 | `null` (1900~2999 밖 또는 연도 아님) |
| `2026` (number) | record | `"2026"`과 동일 |

경계 날짜:

| now | raw | kind | end | months 개수 |
|---|---|---|---|---|
| 2026-01-01 | 올해 | record | `20260101` | 1 |
| 2026-12-31 | 올해 | record | `20261231` | 12 |
| 2026-01-01 00:30 서울 (= 2025-12-31 15:30 UTC) | 올해 | record | `20260101` | 1 (서울 기준이라 2026년) |
