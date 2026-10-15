---
description: "HR 챗봇 연도 단위 기간 질의 지원 — 작업 목록"
---

# Tasks: HR 챗봇 연도 단위 기간 질의 지원

**Input**: `specs/015-hr-yearly-period/`의 spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 포함한다. 근거는 세 가지다.
- 헌장 §III E2E-First: 코드 전에 시나리오 추가 → FAIL 확인
- spec 사용자 시나리오 4(기존 질문 무변경)
- 전역 TDD 규칙

**경로 기준**: 리포 루트(`/Users/shin-yeji/teamplgpt`). skill 디렉토리는 `server/storage/plugins/agent-skills/`를 `SK/`로 줄여 쓴다.

**실행 환경**: `export PATH="$HOME/.nvm/versions/node/v18.19.0/bin:$PATH"`, 테스트는 `server/`에서 실행한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 미완료 선행 작업에 의존하지 않아 병렬 가능
- **[Story]**: US1~US4 (spec.md 사용자 시나리오)

---

## Phase 1: Setup — 기준선 고정

**Purpose**: 코드 수정 전 상태를 증거로 남긴다. 이후 모든 "영향 없음" 판정의 비교 대상이다.

- [X] T001 미커밋 근태 변경을 되돌린다(spec D8).
  - `git diff --stat`으로 대상이 `SK/hr-attendance/handler.js`뿐인지 확인한다. 이 세션에서 만든 미커밋 변경이다.
  - 확인되면 `git restore server/storage/plugins/agent-skills/hr-attendance/handler.js`, `rm server/__tests__/storage/plugins/agent-skills/hr-attendance-year-range.test.js`
  - 다른 미커밋 파일(`embed`, `.mcp.json`, ssh 키, `.worktrees/`)은 건드리지 않는다.
- [X] T002 [P] 기존 단위 테스트 기준선을 기록한다 → `specs/015-hr-yearly-period/baseline/unit-baseline.md`
  - `npx jest 2>&1 | tail -40`: 스위트·테스트 통과/실패 수 + 실패 테스트 이름 목록
  - `node --test storage/plugins/agent-skills/_shared/__tests__/`: 통과 수
- [X] T003 [P] 라우팅 평가 기준선을 기록한다 → `specs/015-hr-yearly-period/baseline/routing-baseline.md`
  - `node evals/hr-routing/run.js`를 조건 변경 없이 2회 실행한다(OpenAI만 호출).
  - 회차별 정확도와 실패 케이스 id·기대→실제를 적는다.
  - 원본 리포트는 `server/evals/hr-routing/reports/`(gitignore)라 요약만 옮긴다.

---

## Phase 2: Foundational — 골든 스냅샷과 공용 모듈

**⚠️ CRITICAL**: T004는 handler를 한 줄이라도 고치기 **전에** 끝나야 한다. 이후 모든 스토리가 이 스냅샷으로 "기존 질문 무변경"을 증명한다(US4).

- [X] T004 골든 테스트를 HEAD 코드로 작성·캡처한다 → `server/__tests__/storage/plugins/agent-skills/period-golden.test.js` (+ `__snapshots__/period-golden.test.js.snap`)
  - **대상**
    - `year_month` 18종(근태: timesheet·work_status·work_calendar·vacation_calendar·overtime·overtime_limit·leave_requests / 인사: schedule_day·birthday·schedule_titles / 급여: pay_periods·salary_statement·daylabor / 결재: pending·drafted·completed·rejected·referenced) × 입력 4종(`"3월"`, `"지난달"`, `"202503"`, `undefined`)
    - 연말정산 9종 × 입력 3종(`"2024"`, `"작년"`, `undefined`)
  - **전송**: handler `this`에 `clientToolTransport` mock을 주입한다. 매 호출의 `{path, form}`을 기록하고 path별 고정 JSON(`{DATA:[…]}` 또는 `{codeList:[…]}`) 본문을 돌려준다.
  - **시계**: `jest.useFakeTimers().setSystemTime(new Date("2026-10-15T12:00:00+09:00"))`
  - **스냅샷**: `{ calls: [{path, form}…], output }`. `output`은 handler 반환 문자열이다.
  - `npx jest period-golden`을 2회 실행해 두 번째가 `--ci`로 통과하는지(결정적인지) 확인한다.
- [X] T005 [P] 공용 함수 계약 테스트를 쓰고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/period-resolver.test.js`
  - `contracts/period-resolver.md`의 테스트 벡터 전부와 경계 날짜 3건(1/1, 12/31, 서울 자정 직후)
  - 이 시점엔 모듈이 없어 FAIL이 정상이다.
- [X] T006 `resolveYearPeriod`를 구현해 T005를 통과시킨다 → `SK/_shared/periodResolver.js`
  - data-model §1 규칙: 공백 제거, 표현 표, 1900~2999, `kind`별 `end`, 서울 날짜, `months`, `label`
  - `require`는 Node 내장만 쓴다. `dateResolver`를 import하지 않는다.
- [X] T007 [P] 조회 도우미 테스트를 쓰고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/year-query.test.js`
  - `runMonthly(months, fetchMonth, { budgetMs, now })`
    - 첫 달 실패 시 그 `errorMessage`를 그대로 반환(나머지 미호출)
    - 2번째 달부터 실패는 `failedMonths`에 기록
    - 예산 초과 시 남은 달 미호출 + 사유 "시간 초과"
    - 빈 달은 `emptyMonths`
  - `formatPeriodHeader(period, failedMonths)` → contracts/tool-output-year.md §1 문자열
  - `sumHHMM(values)` → 전부 `H:MM`/`HH:MM`이면 합계 `HH:MM`, 하나라도 아니면 `null`
- [X] T008 조회 도우미를 구현해 T007을 통과시킨다 → `SK/_shared/yearQuery.js`
  - 순차 실행. 시간 예산은 주입 가능한 `now()`로 측정한다.
  - `hrFetch`를 직접 import하지 않고 `fetchMonth` 콜백으로 받는다. 그래야 테스트에서 네트워크 없이 검증된다.

**Checkpoint**: 골든 스냅샷이 HEAD 기준으로 고정됐고, 공용 모듈 2개가 계약 테스트를 통과한다. 아직 handler는 무수정이다.

---

## Phase 3: User Story 1 — 올해 실적은 1/1~오늘 (Priority: P1) 🎯 MVP

**Goal**: 근무현황·출퇴근 기록·연장근무·연장근무 한도·급여 지급 회차·일용직 급여·결재함에서 "올해/이번년도/2026년"을 2026-01-01~오늘로 조회한다.

**Independent Test**: "올해 근무현황 알려줘" → 요청 `searchBaseSYmd=20260101`·`searchBaseEYmd=<오늘>`, 결과 머리 줄 기간 일치.

### Tests for User Story 1 (먼저 작성 → FAIL 확인) ⚠️

- [X] T009 [P] [US1] 라우팅 평가 케이스를 추가한다 → `server/evals/hr-routing/dataset.jsonl`
  - id `*-year-NN` 6건 이상: 근무현황·출퇴근 기록·연장근무·급여 지급 회차·결재 기안함·결재 기결함
  - 태그 `date` + `normalized`/`colloquial`. 패러프레이즈한다(기존 발화 복사 금지).
  - `params_regex`: `{"year_month":"^(올해|금년|이번 ?년도|이번해|2026년?)$"}`
  - 호출 1회 기대
  - `node evals/hr-routing/run.js --grep year`로 FAIL(생략·`2026` 외 변환)을 기록한다.
- [X] T010 [P] [US1] E2E runner를 확장한다 → `server/scripts/e2e-hr-skill/runner.js`
  - `expect.min_hr_calls`: `relevantMock.length` 하한
  - `expect.mock_body_pattern_any[]`: 시나리오 중 기록된 **모든** `.do` mock 요청 body 중 하나라도 맞으면 패턴 충족, 패턴마다 독립 판정
  - 기존 필드 동작은 그대로다. `server/scripts/e2e-hr-skill/README.md` 판정 필드 표에 두 줄을 추가한다.
- [X] T011 [P] [US1] E2E mock fixture를 추가한다 → `server/scripts/e2e-hr-skill/mock-hr-api.js`
  - `FIXTURES_BY_CMD.getTAADclzWorkOtSchdulList2`(`otWeekSum:"05:00"` 등 `HH:MM`)
  - `FIXTURES_BY_CMD.getTAADclzWorkOtSchdulList`(`sumOt:"03:30"`)
  - `CommonCode.do`는 요청 `searchYm`(YYYY-MM)에서 `CODE=YYYYMM25NN`, `CODE_NM="YYYY-MM-25 정기급여"`를 만들어 응답한다.
  - 기존 시나리오(K9~K12)의 `mock_body_pattern`이 여전히 맞는지 확인한다.
- [X] T012 [US1] @agent E2E 시나리오를 추가한다 — K65·K66·K67 추가, 스키마 검증 통과. **서버 미기동이라 수정 전 FAIL 확인은 사용자 환경 대기**. K66 `min_hr_calls`는 달력 무관하게 2로 둠(note 참조). T011 `CommonCode.do` 월별 코드화는 기존 체인 시나리오(`searchItem=20260619P` 고정 기대)를 깨서 보류 — pay_periods 연도 모드는 단위 테스트로 검증 → `server/scripts/e2e-hr-skill/scenarios.json`
  - 근무현황 연도: `mock_body_pattern`에 `searchBaseSYmd=20\d\d0101`
  - 연장근무 연도: `min_hr_calls` = 이번 달 수, `mock_body_pattern_any`에 `searchYm=\d{4}01`, `answer_not_pattern`에 1월만 조회한 확언
  - 결재 기안함 연도: `sdt=20\d\d0101`
  - 오늘 기준으로 날짜가 바뀌므로 정규식은 관대하게 쓴다.
  - 서버가 있으면 `--only`로 FAIL을 확인하고, 없으면 "사용자 환경 FAIL 확인 대기"로 남긴다.
- [X] T013 [P] [US1] 임베드 E2E 시나리오를 추가한다 → `server/scripts/e2e-embed-hr-skill/scenarios.json`
  - EC-ALLOW 축 1건: "올해 근무현황", cmd 검증 + `answer_not_pattern`
- [X] T014 [US1] 연도 모드 단위 테스트(US1 범위)를 쓰고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/period-year-mode.test.js`
  - T004와 같은 mock 전송·시계
  - timesheet·work_status·daylabor·approval 5종: 기간 `20260101`~`20261015`
  - work_status: 결과 머리 줄 + 특이사항 있는 날만 표 + "그 외 N일은 특이사항 없음"
  - overtime·overtime_limit·pay_periods: 월 10회 순차 요청(`searchYm` 202601~202610). 표 형식, 연간 합계, 3번째 달 실패 시 "조회되지 않은 달" + "조회된 달 합계", 첫 달 실패 시 기존 오류 문구 그대로, pay_periods 코드 중복 제거.

### Implementation for User Story 1

- [X] T015 [US1] 근태 range(record)와 하루 단위 축약을 구현한다 → `SK/hr-attendance/handler.js`
  - 기존 `ym` 계산 직후 `const yp = resolveYearPeriod(year_month, { kind })`
  - range 대상(timesheet·work_status)이면 `yp`의 start/end로 기존 파라미터 이름(searchBaseSYmd/EYmd·searchSYmd/EYmd)을 채운다.
  - `yp`가 `null`이면 기존 코드 그대로다.
  - 결과에 머리 줄을 붙이고, contracts §2 축약을 적용한다(집계 줄은 원본 전체로 계산).
  - query_type별 `kind`·모드는 ENDPOINT_MAP 옆 정적 표로 둔다.
- [X] T016 [US1] 근태 monthly(overtime·overtime_limit)를 구현한다 → `SK/hr-attendance/handler.js`
  - `runMonthly`로 월마다 기존 월 단위 form을 만들어 `hrFetch`
  - contracts §3 월별 표: `otWeekSum`/`sumOt`, `sumHHMM`, 실패·빈 달 표시
- [X] T017 [P] [US1] 결재함 range(record)를 구현한다 → `SK/hr-approval/handler.js`
  - `yp`가 있으면 `sdt/edt = yp.start/yp.end`, 결과 머리 줄
  - 없으면 기존(월 또는 최근 3개월)
- [X] T018 [P] [US1] 급여 range·monthly를 구현한다 → `SK/hr-salary/handler.js`
  - daylabor: `searchDateSYmd/EYmd = yp.start/end`
  - pay_periods: `yp`가 있으면 기존 3개월 소급 루프 대신 `runMonthly`로 대체하고, 월별 행을 병합해 렌더한다(contracts §3, 코드 중복 제거, "지급 건이 없는 달")
  - 기존 월 지정·미지정 경로는 그대로다.
- [X] T019 [US1] 시스템 지시 4번 규칙을 교체한다 → `server/utils/hrSkillGuard.js`
  - `contracts/guard-rule.md` 변경 후 문구 그대로. 다른 줄은 무변경이다.
- [X] T020 [US1] US1 검증
  - `npx jest --ci period-resolver year-query period-year-mode period-golden` 전부 통과. 골든은 **불일치 0건**이어야 한다.
  - `node evals/hr-routing/run.js --grep year`에서 US1 케이스가 통과한다.

**Checkpoint**: US1 단독으로 시연 가능하다(MVP). 월 단위 질의는 골든과 완전 일치한다.

---

## Phase 4: User Story 2 — 일정은 1/1~12/31 (Priority: P2)

**Goal**: 근무 캘린더·휴가 캘린더·회사 일정 건수·일정 제목·생일자에서 "올해"를 2026-01-01~2026-12-31로 조회한다.

**Independent Test**: "올해 회사 일정 알려줘" → `staYmd=20260101`·`endYmd=20261231`.

### Tests for User Story 2 ⚠️

- [X] T021 [P] [US2] 라우팅 평가 케이스를 추가한다 → `server/evals/hr-routing/dataset.jsonl`
  - 일정 3건 이상: 회사 일정 제목·생일자·휴가 캘린더
  - `params_regex` year_month 연도 표현, 호출 1회 기대
- [X] T022 [US2] 연도 모드 단위 테스트(US2 범위)를 추가하고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/period-year-mode.test.js`
  - 5종 기간 `20260101`~`20261231`
  - schedule_day: 건수 1 이상인 날만 표 + "그 외 N일은 일정 없음"
  - work_calendar: `searchYm`·`searchSYmd/EYmd` 값 고정 검증

### Implementation for User Story 2

- [X] T023 [US2] 근태 일정 range를 구현한다 → `SK/hr-attendance/handler.js`
  - vacation_calendar: `searchSYmd/EYmd`
  - work_calendar: spec D7, `searchYm=YYYY01` + `searchSYmd/EYmd` 1년. `rangeAltToo` 경로에 연도 분기
  - 모드 표에서 work_calendar를 `monthly`로 바꿀 수 있게 둔다(실서버 확인 후 전환 대비).
- [X] T024 [P] [US2] 인사 일정 range와 축약을 구현한다 → `SK/hr-personnel/handler.js`
  - `dateParam === "month-range"` 분기에서 `yp`(kind=schedule)가 있으면 `staYmd/endYmd = yp.start/end`
  - schedule_day 축약(contracts §2), 머리 줄
- [X] T025 [US2] US2 검증 — T020과 같은 명령 + `--grep year`에서 US2 케이스 통과

**Checkpoint**: US1·US2가 각각 독립 동작한다.

---

## Phase 5: User Story 3 — 지난해·특정 연도는 그해 전체 (Priority: P2)

**Goal**: "작년/재작년/2025년"을 그해 1/1~12/31로 조회한다. 휴가 신청 내역·급여대장·연말정산의 연도 해석 오류를 고친다.

**Independent Test**: "재작년 연말정산 요약" → 경로 `/YTASummaryMgr2024.do`, `searchCalYy=2024`.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] 라우팅 평가 케이스를 추가한다 → `server/evals/hr-routing/dataset.jsonl`
  - 3건 이상: 작년 근무현황, 2025년 급여대장, 재작년 연말정산
  - 연말정산은 `params_regex` `{"cal_yy":"^(재작년|2024년?)$"}`
- [X] T027 [US3] 연도 모드 단위 테스트(US3 범위)를 추가하고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/period-year-mode.test.js`
  - "작년" work_status → `20250101`~`20251231`(과거 연도는 record도 12/31)
  - leave_requests "재작년" → Lv/Fy `2024`
  - salary_statement "재작년" → `findText=2024`
  - year-end-tax: "재작년" → 2024, "이번년도" → 2026이라 기존 미지원 안내 문구, "2025년" → 2025

### Implementation for User Story 3

- [X] T028 [US3] 근태 leave_requests의 연도를 고친다 → `SK/hr-attendance/handler.js`
  - `leaveBody` 블록의 `y`를 `yp ? yp.year : ym.slice(0,4)`로 바꾼다.
  - annual_leave_balance는 모드 없음이라 대상에서 제외한다(FR-009).
- [X] T029 [P] [US3] 급여대장 연도를 고친다 → `SK/hr-salary/handler.js`
  - `period === "year"`에서 `findText = yp ? yp.year : ym.slice(0,4)`, 머리 줄
- [X] T030 [P] [US3] 연말정산 연도를 고친다 → `SK/hr-year-end-tax/handler.js`
  - `const yp = resolveYearPeriod(cal_yy, { kind: "record" })`. 있으면 `resolved = yp.year`, 없으면 기존 `resolveDateParam(cal_yy,"year")`
  - 지원 연도 검사·안내 문구는 그대로다.
- [X] T031 [US3] US3 검증 — T020과 같은 명령 + `--grep year`에서 US3 케이스 통과

**Checkpoint**: 네 그룹(range·monthly·yearOnly·무관) 전부 구현 완료.

---

## Phase 6: User Story 4 — 기존 질문 무변경 확인 (Priority: P1)

**Goal**: SC-002·SC-003·SC-005 증명.

- [X] T032 [US4] 골든 최종 확인: `npx jest --ci period-golden` 불일치 0건. 스냅샷 파일이 T004 이후 수정되지 않았는지 `git diff --stat` 확인.
- [X] T033 [US4] 단위 테스트 전체를 T002 기준선과 비교한다 → `specs/015-hr-yearly-period/baseline/unit-after.md`
  - 기존 통과 감소 0, 실패 항목 증가 0
  - `node --test` dateResolver·hrSession 통과 수 동일
- [X] T034 [US4] 라우팅 평가 전체 2회를 T003 기준선과 비교한다 → `specs/015-hr-yearly-period/baseline/routing-after.md`
  - 신규 실패 0건. 새 연도 케이스 전부 통과.
  - 차이가 있으면 혼동 페어를 기록하고 원인을 조사한다(무시 금지).
- [X] T035 [US4] E2E 두 스위트 전건 PASS — **사용자 환경**
  - quickstart.md §4 명령. 서버 재기동 후 실행.
  - 결과 파일 경로(`runs/{timestamp}/result.json`)를 받아 PASS 수를 기록한다.
  - 결과(`baseline/e2e-and-live.md`): 최종 가드로 hr-skill 64/67, embed 27/28. 신규 시나리오 5건은 전 회차 PASS. 실패 4건(K64·KB48·K58·EC-FILTER-03)은 HEAD 가드 반복 비교로 기존 불안정·기존 실패임을 확인했다
  - 이 과정에서 EC-FILTER-03 회귀(1차 가드 문구)를 찾아 4번 규칙에 범위 단서를 넣어 고쳤다(`contracts/guard-rule.md` 최종본). 전건 PASS는 아님 — 남은 실패는 이번 변경과 무관

---

## Phase 7: Polish & Cross-Cutting

- [X] T036 [P] 컨벤션 문서를 갱신한다 → `docs/conventions/hr-skill-description-pattern.md`
  - §2 Location E 표 `[HR_SKILL_COMMON]` 행에 4항(연도만 말하면 그대로 전달)을 반영한다.
  - 변경 이력에 v1.5 한 줄을 추가한다.
- [X] T037 [P] 인수인계 가이드를 갱신한다 → `HR-SKILL-GUIDE.md`
  - §3.1 `_shared` 표에 `periodResolver.js`·`yearQuery.js` 행
  - §8 사고 사례에 "연도 질문이 한 달로 수렴" 1행
- [X] T038 code-reviewer 에이전트로 변경 전체를 리뷰한다. CRITICAL·HIGH는 수정하고 골든·단위 테스트를 재실행한다.
  - 결과: CRITICAL 0 · HIGH 2 · MEDIUM 6 · LOW 11. HIGH 2건 + MEDIUM 1~4·5(일부)·LOW 1·2·3·4·6·10 수정. 상세는 `contracts/tool-output-year.md` §5, 보고서
  - 미수정(사용자 판단·범위 밖): M-5 휴가 캘린더·생일자 1년치 분량(2026-10-15 사용자 결정: 현행 유지), M-6 기존 OT 시나리오 재실행(T035에서 확인), L-5 서버 TZ, L-7·L-8·L-9, L-11 `embed` 서브모듈 포인터 분리
  - 대상: `SK/_shared/periodResolver.js`, `SK/_shared/yearQuery.js`, handler 5개(`SK/hr-{attendance,personnel,salary,approval,year-end-tax}/handler.js`), `server/utils/hrSkillGuard.js`, `server/scripts/e2e-hr-skill/{runner,mock-hr-api}.js`
- [X] T039 실서버 확인 — quickstart.md §5 표 6항목. **사용자 위젯 직접 확인 또는 사용자 허용 하에 실행.**
  - work_calendar 1년 범위가 실패하면 T023의 모드를 `monthly`로 바꾸고 T022·T025를 재실행한다.
  - `otWeekSum`이 `HH:MM`이 아니면 결과 그대로 둔다(합계 생략이 계약상 정상).
  - 결과(`baseline/e2e-and-live.md`): 사용자 제공 세션으로 서버 폴백 실행. 5항목 통과, 응답 행 전부 본인. work_calendar 1년 범위 365행·12개월 → range 유지. HH:MM 형식 확인
  - 반영: 근무캘린더 평일·주말 분리 축약, 연장근무 없는 계정 "기록 없음" 문구(`contracts/tool-output-year.md` §6)
  - 미확인: 위젯(R1) 경유 — 사용자 위젯에서 직접 확인 권장
- [X] T040 완료 보고서를 작성한다 → `docs/04-report/features/015-hr-yearly-period.report.md`
  - 기준선 대비 결과, E2E·실서버 확인 여부, 남은 한계(R1 위젯 경로는 E2E 미검증)

---

## Dependencies & Execution Order

### Phase 순서

- Phase 1(T001~T003) → **Phase 2(T004 골든은 handler 수정 전 필수)** → Phase 3~5 → Phase 6 → Phase 7
- T001이 끝나야 T004를 캡처할 수 있다. 골든은 HEAD 기준이다.

### 스토리 간 의존

- US1·US2·US3는 Phase 2 이후 서로 독립적으로 테스트할 수 있다.
- 다만 `SK/hr-attendance/handler.js`를 셋이 같이 고친다(T015·T016·T023·T028). 이 파일 작업은 순차로 한다.
- US4(Phase 6)는 US1~US3이 모두 끝난 뒤 최종 확인이다. 골든 비교 자체는 각 스토리 검증(T020·T025·T031)에서 매번 돌린다.

### 스토리 내부 순서

- 테스트·평가 케이스·E2E 시나리오 작성 → FAIL 확인 → 구현 → 검증

## Parallel Opportunities

| 묶음 | 병렬 가능한 작업 |
|---|---|
| Phase 1 | T002 ∥ T003 |
| Phase 2 | T005 ∥ T007 (T004 다음) |
| US1 테스트 | T009 ∥ T010 ∥ T011 ∥ T013 |
| US1 구현 | T017(결재) ∥ T018(급여) ∥ T015→T016(근태 순차) |
| US2 구현 | T024(인사) ∥ T023(근태) |
| US3 구현 | T029(급여) ∥ T030(연말정산) ∥ T028(근태) |
| Phase 7 | T036 ∥ T037 |

## Implementation Strategy

### MVP (US1 + US4 골든)

1. Phase 1~2 완료: 기준선·골든·공용 모듈
2. Phase 3(US1) 완료: 실적 조회 연도 지원 + 시스템 지시
3. T020 검증 + 골든 불일치 0 → 여기서 멈추고 데모 가능("올해 연장근무 내역")

### 점진 확장

US2(일정) → US3(과거·특정 연도) → Phase 6 전체 회귀 → Phase 7 문서·리뷰·실서버

### 사용자 환경이 필요한 작업

- T012 E2E FAIL 확인(서버 있으면)
- T035 E2E 전건
- T039 실서버

이 셋은 사용자 실행 또는 허용이 필요하다. 나머지는 이 리포만으로 완료할 수 있다.
