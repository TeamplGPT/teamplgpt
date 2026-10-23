# Tasks: HR 챗봇 하루·주 단위 조회

**Input**: `specs/020-hr-day-week-query/` — spec.md, plan.md, research.md, data-model.md, contracts/date-param.md, quickstart.md

**Tests**: 필수(헌장 III, TDD). 테스트·시나리오를 먼저 쓰고 FAIL 확인 후 구현.

**약어**: `SK` = `server/storage/plugins/agent-skills`, `T` = `server/__tests__/storage/plugins/agent-skills`, `E2E` = `server/scripts/e2e-hr-skill`, `EMB` = `server/scripts/e2e-embed-hr-skill`

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — 기준선

- [X] T001 [P] 단위 기준선(`npx jest __tests__/storage __tests__/utils __tests__/extras utils` 통과/실패 수) → `specs/020-hr-day-week-query/baseline/unit-baseline.md`
- [X] T002 [P] 라우팅 평가 기준선 1회(실패 ID) → 같은 파일

---

## Phase 2: Foundational — 범위 해석·검사·연도 가드·mock

### Tests (먼저 → FAIL 확인) ⚠️

- [X] T003 [P] `T/date-range.test.js` 신규: contracts §3 표 전부(오늘 2026-10-23 고정), 연도 없는 날짜는 올해, 주 월~일, 두 달에 걸친 주(9/28~10/4), 지정 없음(undefined)·해석 실패(null), `monthsOf(range)`·`inRange(ymd, range)` 헬퍼
- [X] T004 [P] `T/period-check.test.js`에 `rangeProblem`(date) 케이스, `server/__tests__/utils/hrYearGuard.test.js`에 `date` 인자의 말하지 않은 연도 제거 케이스 추가

### Implementation

- [X] T005 `SK/_shared/dateRange.js` 신규(research R2·R3) → T003 PASS
- [X] T006 `SK/_shared/periodCheck.js` `rangeProblem`, `server/utils/hrYearGuard.js` YEAR_PARAMS에 `date` → T004 PASS
- [X] T007 `E2E/mock-hr-api.js`: 근태(`TAAWrkTimeStatusMgr`) 요청 범위 ≤7일이면 그 날짜 행을 실서버 형식으로 생성(오늘 행 포함, 정해진 날 지각 1건 — 날짜 규칙을 주석에), 월 요청은 기존 고정 행. 근무캘린더·연장 내역·일정도 하루·주 시험용 행(요청 달의 날짜로)

**Checkpoint**: 기준선 외 새 실패 0, `date` 없는 골든 변화 0.

---

## Phase 3: User Story 1 — 하루 출퇴근·근무현황 (P1) 🎯

### Tests (먼저 → FAIL 확인) ⚠️

- [X] T008 [P] [US1] `server/evals/hr-routing/dataset.jsonl`: 하루 질문 4건(오늘 출근시각·어제 퇴근·10월 15일 지각·오늘 근무현황) `date` params_regex(서버 수용 형식 전체), 월·연 질문 경계 2건(`date` 없어야 — 기존 케이스 활용). 패러프레이즈(examples와 다른 문장). `--grep` FAIL 확인
- [X] T009 [P] [US1] `EMB/scenarios.json`: "오늘 출근시각 알려줘"(표 날짜 행이 오늘 하나뿐 — `answer_not_pattern` 다른 날짜 행, `answer_pattern` 오늘 MM-DD 행), "어제 지각했어?"(어제 행 + 범위 요약 줄, 근무시간 표 없음), 기존 EC-ALLOW-11 기대값을 오늘 한 줄로 변경. FAIL 확인
- [X] T010 [P] [US1] `E2E/scenarios.json`: @agent 판(tool 인자 `date`, 요청 본문 `searchBaseSYmd=오늘`·`searchBaseEYmd=오늘`), "내일 출근 기록"(조회 없음 + 지나지 않은 날 안내). FAIL 확인
- [X] T011 [P] [US1] `T/day-week-query.test.js` 신규(harness): timesheet·work_status `date: "오늘"/"어제"/"10월 15일"` — 요청 form 범위, 표 행 = 그 날, 요약 줄 범위, 근무시간 블록 없음, 기록 0행 안내, 오늘 이후 안내, `date` 해석 실패 안내, `date`+`year_month` → date 우선, `date` 없음 → 기존과 같은 요청

### Implementation

- [X] T012 [US1] `SK/hr-attendance/plugin.json`: `date` param(contracts §1, §5.2 형식), query_type 설명은 그대로, examples(하루·주·기존 "2월 27일자" → `date`)
- [X] T013 [US1] `server/utils/hrSkillGuard.js` `[HR_SKILL_COMMON]` 4항(contracts §2) — 기존 가드 테스트(`hrSkillGuard` 관련) 갱신
- [X] T014 [US1] `SK/hr-attendance/handler.js`: `date` 해석·검사, range-both 요청 범위(끝 = min(end, 오늘)), start>오늘 안내, 0행 안내, 머리 정보 줄, yearPeriod·근무시간 블록 생략 → T009~T011 PASS
- [X] T015 [US1] 라우팅 `--grep`·`--tags boundary,ambiguous` → T008 PASS(실패 시 설명 문구만 조정, §7.4)

**Checkpoint**: US1 위젯 3회 반복 PASS.

---

## Phase 4: User Story 2 — 한 주 (P2)

- [X] T016 [P] [US2] 평가 2건(이번 주 근무현황·지난주 출퇴근) + `EMB`·`E2E` 시나리오(표 날짜가 그 주 월~일 안, 이번 주는 오늘까지). FAIL 확인
- [X] T017 [US2] T011에 주 케이스(이번 주·지난주·두 달에 걸친 주) 추가 → handler가 이미 범위로 처리하면 PASS 기록, 아니면 수정

---

## Phase 5: User Story 3 — 근무캘린더·연장근무·일정 (P2)

### Tests (먼저 → FAIL 확인) ⚠️

- [X] T018 [P] [US3] `T/day-week-query.test.js`: work_calendar(`date: "내일"` 행 하나, 걸친 달 조회), overtime(`date: "어제"` 한도 표 유지 + 내역 어제만, 0건 안내, 오늘 이후), personnel schedule_day·schedule_titles(staYmd/endYmd = 범위)
- [X] T019 [P] [US3] 평가 3건(내일 근무 시작·어제 연장근무·오늘 회사 일정) + `EMB`·`E2E` 시나리오. FAIL 확인

### Implementation

- [X] T020 [US3] `SK/hr-attendance/handler.js` 근무캘린더 범위 거르기(걸친 달 조회·`rowYmd`)
- [X] T021 [US3] `SK/_shared/overtimeStatus.js` `runOvertime(plan, fetch, { range })` 내역 범위 거르기·걸친 달 Person 조회, handler 연결
- [X] T022 [US3] `SK/hr-personnel/handler.js`·`plugin.json`: month-range에 `date` 범위, `date` param·examples → T018·T019 PASS

---

## Phase 6: Polish

- [X] T023 [P] `docs/conventions/hr-skill-description-pattern.md` v1.11(§6 매트릭스·§7.2 적용 기록·가드 4항 변경), `HR-SKILL-GUIDE.md` 문제 해결 행
- [X] T024 전체 회귀: 단위(기준선 외 새 실패 0, `date` 없는 골든 0변화), 라우팅 평가 2회 연속, 위젯·@agent E2E 전체(묶음별 감시 `run-chunks.sh`)
- [X] T025 코드 리뷰(code-reviewer) — CRITICAL·HIGH 수정
- [X] T026 실서버 대조(quickstart §4, 세션은 env로만) — "오늘 출근시각"·"이번 주 근무현황" handler 직접 연결 결과
- [X] T027 report `docs/04-report/features/020-hr-day-week-query.report.md`

---

## Dependencies

```text
Phase 1 ─▶ Phase 2 ─▶ US1(Phase 3) ─▶ US2(Phase 4)
                    └▶ US3(Phase 5, T020~T022는 T014 뒤 — 같은 handler)
Phase 3~5 ─▶ Phase 6
```

## Parallel Examples

- Phase 2 테스트 T003·T004 동시, US1 테스트 T008~T011 동시, US3 테스트 T018·T019 동시

## Implementation Strategy

MVP = Phase 2 + US1("오늘 출근시각" 한 줄). 그다음 US2(주), US3(캘린더·연장·일정), Polish.

## Phase 7: 사용자 결정 반영 (2026-10-23, D12~D14)

- [X] T028 [P] `T/date-range.test.js`: 요일 표현(D14)·먼 미래 날짜 작년(D12) 케이스, `T/day-week-query.test.js`: 지난주 연장근무 주간 줄 없음(D13). FAIL 확인
- [X] T029 [P] 평가 1건(요일) + 위젯 시나리오 1건(이번 주 수요일). FAIL 확인
- [X] T030 `SK/_shared/dateRange.js` D12·D14, `SK/_shared/overtimeStatus.js` D13, plugin.json date 설명에 요일 예 → T028·T029 PASS
- [X] T031 회귀(단위·관련 E2E·라우팅 date 태그), 계약·리포트 갱신

