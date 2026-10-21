# 019 기준선 (2026-10-21, 구현 전)

## T001 서버 단위 (`npx jest __tests__/storage __tests__/utils __tests__/extras utils`)

- 통과 1483 / 실패 74 (실패 스위트 6 — 018 기준선 `specs/018-hr-table-passthrough/baseline/unit-baseline-failed.txt`와 같은 레거시 handler 테스트 목록)

## T002 위젯 (`npx jest client/messenger/components/chatbot client/messenger/widget`)

- 통과 228 / 실패 7
  - 6건: 이번에 먼저 추가한 019 브리지 테스트(T004, RED — 측정 중 추가됨)
  - 1건: `VizBlockRenderer › workstatus 블록을 막대 차트로 렌더한다` — 병렬 실행 시 recharts 렌더 시간 초과(단독 실행 6/6 통과, 2026-10-20 확인). 기존 흔들림.

## T003 라우팅 평가 (`node evals/hr-routing/run.js`)

- 163/169 (96.4%)
- 실패: per-sd-01, per-sd-02, per-cd-01, amb-sch-02, prod-per-05, mix-oth-01 (모두 이전 기준선과 같은 계열 — 일정·연락처·혼합 질의). att-ts-date-02는 이번 회차 통과(흔들림).
