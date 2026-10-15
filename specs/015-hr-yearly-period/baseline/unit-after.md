# 단위 테스트 변경 후 비교 (T032·T033, 코드 리뷰·실서버 확인 반영 후 최종)

- 실행: `cd server && npx jest --json` (Node v18.19.0), 구현 + 코드 리뷰(T038) 반영 완료 후
- 비교 대상: `unit-baseline.md`, `unit-baseline-passed.txt` (T002, 변경 전 HEAD)

| 항목 | 기준선 | 변경 후 | 차이 |
|---|---|---|---|
| 스위트 (통과/실패/전체) | 62 / 11 / 74 | 67 / 11 / 79 | 신규 5 스위트 전부 통과 |
| 테스트 (통과/실패/건너뜀/전체) | 824 / 98 / 9 / 931 | 1161 / 98 / 9 / 1268 | 통과 +337 = 신규 테스트 수 |
| 기준선 통과 → 변경 후 미통과 | — | **0건** | `comm -23 unit-baseline-passed.txt <변경 후 통과 목록>` 빈 결과 |
| 새로 생긴 실패 | — | **0건** | 실패 이름 목록 98건 동일 |
| node:test `_shared/__tests__` | 30/30 | 30/30 | dateResolver·hrSession 무수정 |

기존 실패 98건은 6개 스위트(hr-attendance/salary/year-end-tax/personnel-search handler, hr-api-mock.integration, workspaceLlmMessageLogs, hybrid-search e2e) + 수집 실패 4개(plugin-json-schema ENOENT, node:test 형식 3개)다. 스펙의 "레거시 4개 파일"보다 많지만 전부 변경 전부터 실패하던 것이다(코드 리뷰도 HEAD와 실패 이름 동일 확인).

## 신규 테스트 (337건)

| 파일 | 건수 | 내용 |
|---|---|---|
| `period-golden.test.js` | 107 | 월 단위·기간 없음 입력의 요청·결과 골든 (18종×4 + 연말정산 9종×3 + 연차 잔여 대조군 8) |
| `period-golden-extra.test.js` | 81 | 리뷰 L-10 보강 골든 — "2026년 3월"·"올해 3월"·"2026-03"·"3"·숫자 3·"202512"·빈 값·"다음달"·"3월 전체" × 8종 + payslip 계열 9 |
| `period-resolver.test.js` | 63 | 계약 테스트 벡터 + 경계 날짜 + 흔한 변형·범위 접미사 |
| `year-query.test.js` | 32 | runMonthly(첫 달 실패·중간 실패·예외·연속 실패 중단·60초 예산)·머리 줄·월 단위 표기·합계 |
| `period-year-mode.test.js` | 54 | US1~US3 + 리뷰·실서버 확인 반영 handler 연도 모드 요청·결과 |

## 골든 스냅샷 (T032)

- `period-golden.test.js.snap`: 생성 18:53:50(T004, handler 수정 전) = 최종 수정 18:53:50 — **이후 재기록 없음**
- `period-golden-extra.test.js.snap`: 변경 전 HEAD(a7473cfe)를 별도 worktree로 띄워 캡처한 뒤 현재 코드에 `--ci`로 대조 — 81/81 일치
- 두 파일 합계 `--ci` Snapshots 188 passed, 불일치 0, 신규 0, 갱신 0
