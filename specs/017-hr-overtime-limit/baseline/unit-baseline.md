# 단위 테스트 기준선 (017 T001·T002)

2026-10-19, Node v18.19.0. 작업 트리 = 7f001778 + 016 후속 미커밋 보강.

## teamplgpt

- 실행: `cd server && npx jest __tests__/storage __tests__/utils utils`
- 스위트: 통과 61 · 실패 6 · 전체 67
- 테스트: 통과 1128 · 실패 74 · 전체 1202
- 실패 목록: `unit-baseline-failed.txt`(74건). 016 기준선의 HR handler 레거시 실패(hr-attendance 16, hr-personnel-search 19, hr-salary 14, hr-year-end-tax 19, hr-api-mock 6)와 plugin-json-schema 로드 실패(ENOENT)로, 같은 집합이다.
- 판정 규칙: 구현 후 실패 목록이 이 파일의 부분집합이면 회귀가 없는 것으로 본다(연장근무 관련 레거시 실패가 사라지는 것은 허용).

## okrservice

- 실행: `cd widgets && npx jest client/messenger/widget/__tests__/hrBridge.test.ts`
- 26 / 26 통과
