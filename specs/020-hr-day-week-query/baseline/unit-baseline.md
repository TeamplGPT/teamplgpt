# 020 기준선 (2026-10-23, 구현 전)

## 단위 (T001)

`npx jest __tests__/storage __tests__/utils __tests__/extras utils`

- 통과 1667 / 실패 74 / 전체 1741
- 실패 suite(기존): hr-api-mock.integration, hr-attendance-handler, hr-personnel-search-handler, hr-salary-handler, hr-year-end-tax-handler(레거시 handler 테스트 74건), plugin-json-schema(로드 실패, 기존)
- date-range.test.js는 T003 RED(모듈 없음) — 기준선 수치에 포함되지 않음

## 라우팅 평가 (T002)

`node evals/hr-routing/run.js` — 95.5% (168/176)

실패 ID: att-ts-date-02, per-sd-01, per-sd-02, per-cd-01, amb-sch-02, prod-att-06, prod-per-05, mix-oth-01
