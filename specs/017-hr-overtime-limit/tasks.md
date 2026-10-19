# Tasks: HR 챗봇 연장근무 한도·사용·잔여 표시

**Input**: `specs/017-hr-overtime-limit/` — spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 필수다(헌장 III E2E-First, 사용자 규칙 TDD). 테스트를 먼저 쓰고 FAIL을 확인한 뒤 구현한다.

**약어**:
- `SK` = `server/storage/plugins/agent-skills`
- `T` = `server/__tests__/storage/plugins/agent-skills`
- `OKR` = `/Users/shin-yeji/okrservice/widgets/client/messenger/widget`

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — 기준선

- [X] T001 [P] 단위 테스트 기준선을 기록한다 → `specs/017-hr-overtime-limit/baseline/unit-baseline.md`. 대상은 `cd server && npx jest __tests__/storage __tests__/utils utils`의 통과/실패 수와 기존 실패 목록이다.
- [X] T002 [P] okrservice 브리지 테스트 기준선을 기록한다(`npx jest client/messenger/widget/hrBridge.test.ts`) → 같은 파일에 추가.

---

## Phase 2: Foundational — mock fixture

- [X] T003 `server/scripts/e2e-hr-skill/mock-hr-api.js`에 두 경로 fixture를 추가한다(plan 구현 메모 4).
  - `/getMBLDclzWorkOtSchdul.do`: `searchType`, `searchBaseSYmd` 월로 분기한다.
    - 일반 = 주간 LMT 12 / USE 4 / REM 8, 월간 52 / 10 / 42
    - 2월 = USE 0
    - 3월 = HTTP 500
    - 5월 = 다른 직원 포함 3행
  - `/getMBLDclzWorkOtSchdulPerson.do`: 일반 달 2건, 2월은 빈 배열.
  - 모든 행에 `staffNo`를 넣는다(비노출 검증용).
  - 기존 `TAADclzWorkOtSchdul` fixture와 3월 500 분기는 T020에서 제거한다(지금은 유지).

**Checkpoint**: mock이 기동되고 `curl -X POST :8000/getMBLDclzWorkOtSchdul.do -d 'searchType=3&searchBaseSYmd=2026-05-31&cmmSearchStaffId=X'`가 3행을 돌려준다.

---

## Phase 3: User Story 4 — 연장근무 조회로 다른 직원 정보가 나가지 않는다 (Priority: P1) 🔒 선행

**Goal**: 새 조회를 열기 전에 본인 한정 방어를 먼저 둔다(브리지 2곳 + 본인 1행 검증).

**Independent Test**: 브리지 테스트에서 사번 키가 없는 요청은 fetch 0회. 모듈 테스트에서 3행 응답은 이름·시간 없이 실패 안내가 나온다.

### Tests (먼저 작성 → FAIL 확인) ⚠️

- [X] T004 [P] [US4] `OKR/hrBridge.test.ts`에 bridge-contract §4의 케이스 1~5를 추가하고 FAIL을 확인한다.
- [X] T005 [P] [US4] `T/overtime-status.test.js`를 신규로 만든다. 본인 검증 케이스:
  - (a) 한도 응답이 3행이면 결과에 다른 행의 성명·소속·시간·`staffNo`가 없고 "확인하지 못했습니다"가 나온다.
  - (b) 0행이면 같은 처리.
  - (c) 모든 fetch 요청 form에 `cmmSearchStaffId=$SELF_STAFF_ID`가 있다.
  
  모듈이 없어 FAIL인 것을 확인한다.

### Implementation

- [X] T006 [P] [US4] `OKR/hrBridge.ts`에 bridge-contract §1~§3을 구현한다.
  - `ALLOWED_PATHS`에 두 경로를 추가한다.
  - `PARAM_VALUE_ALLOWLIST`에 searchType `2`·`3`을 추가한다.
  - `REQUIRED_STAFF_PARAMS`와 검사를 추가한다(검사 순서는 계약 §3).
  - 구 경로 허용은 유지한다.
- [X] T007 [P] [US4] `extras/kiwibox-bridge/teamplgpt-hr-bridge.js`에 같은 규칙을 구현한다(ES5 문법 유지). README의 허용 목록 표가 있으면 갱신한다.
- [X] T008 [US4] T007 검증. `node:vm`으로 브리지를 로드하는 jest를 시도한다 → `T/../extras/kiwibox-bridge.test.js`. window·document·fetch·postMessage를 스텁으로 둔다. 로드가 불가능하면 이유를 기록하고 okrservice 구현과 줄 단위로 대조한다.
- [X] T009 [US4] `SK/_shared/overtimeStatus.js`의 골격을 만든다: `toLimit(rows, type)`(1행 아니면 failed), `formatHours`, 고정 실패 문구. T005 (a)(b) PASS.

**Checkpoint**: T004·T005(a)(b)·T008 PASS.

---

## Phase 4: User Story 1 — 이번 기간 연장근무를 한도·사용·잔여로 본다 (Priority: P1) 🎯 MVP

**Goal**: 기간 없음·이번 달·지난 달 질문에 한도 표 + 날짜별 내역(계약 §1·§2).

**Independent Test**: "이번 달 연장근무 몇 시간 남았어?"에 2줄 표(12.0/4.0/8.0, 52.0/10.0/42.0)와 내역 2건, 잔여가 첫 문장.

### Tests ⚠️

- [X] T010 [P] [US1] `T/overtime-status.test.js`에 다음을 추가한다.
  - `planOvertime`: 기간 없음 → current, "3월"(과거) → month, 미래 달 → future
  - 이번 달 렌더: 계약 §1 표·제목·사실 문장·[응답 형식] 줄
  - 지난 달 렌더: 주간 줄 없음, 라벨 `3월`, 다른 해면 `2025년 3월`
  - 요청 form
    - current: searchType 2·3 기준일 = 오늘, Person = 1일~오늘
    - month: searchType 3 기준일 = 말일, Person = 1일~말일
  - 이번 달 3회 호출이 병렬로 일어남(fetch 지연 스텁으로 순서 확인)
  - 날짜 `M/D(요일)`, 시각 `HH:MM`, 빈 사유 "—", 오래된 순 정렬
  - null 한도는 "—"(0.0 아님)
- [X] T011 [P] [US1] `server/scripts/e2e-hr-skill/scenarios.json`의 기존 기대값을 바꾼다(계약 기준).
  - **K6** "이번 달 연장근무 내역 보여줘": `mock_url_pattern` `^/getMBLDclzWorkOtSchdul(Person)?\.do`, body `searchType=(2|3)`·`cmmSearchStaffId=`, answer `한도`·`잔여`, not `1건`
  - **K7** "이번 달 남은 OT 시간 알려줘": answer `8(\.0)?|42(\.0)?`(mock 잔여)
  - **KB21** "지난달 연장근무 조회해줘": body `searchType=3`, `searchBaseSYmd=\d{4}-?\d{2}-?(28|29|30|31)`, `answer_not_pattern` `이번 주`
  - note에 017 갱신 사유를 적는다.
- [X] T012 [US1] T011 시나리오를 현재 코드로 실행해 FAIL을 확인하고 run 경로를 기록한다(quickstart §2 절차, 서버 3011).

### Implementation

- [X] T013 [US1] `SK/_shared/overtimeStatus.js`에 `planOvertime`, `runOvertime`(current·month·future), `renderCurrent`, `renderMonth`를 구현한다. 함수 하나는 50줄 이하로 두고, 원본은 변경하지 않는다(새 객체). T010 PASS.
- [X] T014 [US1] `SK/hr-attendance/handler.js` 진입부에서 `overtime`·`overtime_limit`이면 `isBlockedQueryType` 검사 후 `runOvertime(this, planOvertime(year_month), hrFetch 래퍼)`로 보낸다. `ENDPOINT_MAP`의 두 항목은 라벨·검증용 최소 정의로 바꾼다(`query_type` 허용 목록 유지). `QUERY_LABELS`는 둘 다 "연장근무 현황"으로 둔다.
- [X] T015 [US1] `SK/hr-attendance/plugin.json`
  - `query_type` 설명을 바꾼다: `overtime`·`overtime_limit` 둘 다 "연장근무 한도·사용·잔여(주간·월간)와 날짜별 연장근무 내역 — 야근을 얼마나 했는지·더 할 수 있는지"
  - 예시 call 3개는 유지하되 설명 문구를 확인한다.
  - `year_month` 문구는 바꾸지 않는다(T-A 유지).
  - Convention §7 Location A/B/C를 대조한다.
- [X] T016 [US1] 단위 회귀를 맞춘다.
  - `T/hr-attendance-handler.test.js`의 연장근무 케이스를 새 경로 기대로 바꾼다.
  - `T/plugin-json-schema.test.js`가 문구를 고정하고 있으면 갱신한다.
  - `period-golden*.test.js` 연장근무 골든은 `-u`로 갱신하되, diff를 직접 읽고 연장근무 항목만 바뀌었는지 확인한다.
- [X] T017 [US1] US1 검증: T011 시나리오 PASS, `npx jest T/` 전체가 기준선 이하 실패.

**Checkpoint**: MVP — 이번 기간·지난 달 질문이 새 기준으로 답한다.

---

## Phase 5: User Story 2 — 연장근무가 없을 때 "없음"을 본다 (Priority: P1)

**Goal**: 사용 0.0 + "기록이 없습니다", "1건" 금지(계약 §1-a, spec D5).

**Independent Test**: mock 2월 "2월 연장근무 알려줘" → "2월 연장근무 기록이 없습니다", "1건" 없음.

### Tests ⚠️

- [X] T018 [P] [US2] `T/overtime-status.test.js`에 다음을 추가한다.
  - 내역 0건 → 기록 없음 줄 + [응답 형식] 줄, 출력에 `1건` 없음
  - 한도 0/0/0은 그대로 표시
  - R5 예외(사용 null + 내역 0건 → 0.0, 사용 null + 내역 있음 → "—")를 별도 함수로 검증
- [X] T019 [P] [US2] E2E 신규 시나리오
  - **K77** "2월 연장근무 알려줘": answer `기록이 없`, not `1건|성명`
  - **K78** "올해 2월에 야근 몇 시간 했어?"(표현 변형): answer `기록이 없|0(\.0)?\s*시간`, not `1건`
  
  FAIL을 확인한다.

### Implementation

- [X] T020 [US2] `overtimeStatus.js`에 기록 없음 렌더와 R5 예외 함수를 넣는다. `mock-hr-api.js`의 구 `TAADclzWorkOtSchdul` fixture와 3월 500 분기(구 cmd 기준)를 제거한다. 새 경로 3월 500은 T003에 이미 있다. T018·T019 PASS.

**Checkpoint**: 운영 오답 유형("1건, 성명/소속/직위")이 재현되지 않는다.

---

## Phase 6: User Story 3 — 한 해 연장근무를 월별로 본다 (Priority: P2)

**Goal**: 1월~이번 달(또는 1~12월) 월별 한도/사용/잔여 + 합계 + 없는 달(계약 §3).

**Independent Test**: "올해 연장근무 내역 알려줘" → 월별 표, 3월 "조회 실패", 5월 "조회 실패"(다중 행), 2월 0.0, 합계 = 성공 달 사용 합, "연장근무가 없는 달: 2월".

### Tests ⚠️

- [X] T021 [P] [US3] `T/overtime-status.test.js`에 다음을 추가한다.
  - 연 계획: 올해면 1월~이번 달, 작년이면 12개월, 내년이면 future
  - 각 달 form은 searchType=3이고 기준일 = 말일(이번 달은 오늘)
  - 렌더: 합계 줄 첫 칸 `합계`, 한도·잔여 합계 "—"
  - 실패 달 행은 "조회 실패", 머리 줄에 조회되지 않은 달
  - 0행 달은 "—"이고 합계·없는 달에서 제외
  - 모든 달 0 → "(연도)년 연장근무 기록이 없습니다"
  - `runMonthly` 예산·연속 실패 중단 승계
- [X] T022 [P] [US3] E2E를 갱신하고 추가한다.
  - **K66** 갱신: url `^/getMBLDclzWorkOtSchdul\.do`, body `searchType=3`, any `searchBaseSYmd=\d{4}-?01`, answer `합계`, not `1건`
  - **K68** 갱신: 3월 언급(기존 유지)
  - **K79** "작년 연장근무 내역": `min_hr_calls` 12, answer `합계`
  - **K80** "내년 연장근무": `tool_call` true, `max_hr_calls` 0, answer `아직`
  
  FAIL을 확인한다.

### Implementation

- [X] T023 [US3] `overtimeStatus.js`에 `runYear`·`renderYear`를 넣는다(`yearQuery.runMonthly`·`monthlyPeriod`·`withPeriodHeader` 재사용).
- [X] T024 [US3] `handler.js`에서 연장근무 전용으로 남은 코드를 삭제한다. 대상은 `YEAR_MODE.overtime(_limit)`, `COLUMNS_BY_QT.overtime(_limit)`, 다른 사용처가 없을 때 `monthTotal`·`fetchSelfMonth`·`runYearMonthly`의 sumField 경로다. `T/period-year-mode.test.js`의 연장근무 기대를 새 모듈 기준으로 옮긴다.
- [X] T025 [US3] T021·T022 PASS, `npx jest T/` 회귀를 확인한다.

---

## Phase 7: User Story 4 (계속) — 경로별 차단 E2E

- [X] T026 [P] [US4] E2E 신규
  - **K81** "우리 팀 연장근무 현황 보여줘": 016 거절, `tool_call` false 또는 거절 tool, 다른 직원 이름 없음
  - embed: **EC-ALLOW-27** "연장근무 몇 시간 남았어?"(위젯, 한도 표), **EC-ALLOW-28** "노지용 연장근무 얼마나 남았어?"(거절), **EC-FILTER-11** 근태 전용 위젯 본인 연장근무, **EC-FILTER-12** 팀 연장근무(거절)
  - mock 5월 다중 행: "5월 연장근무 알려줘"(**K82**)에 mock의 다른 직원 이름이 없고 실패 안내가 나온다
- [X] T027 [US4] T026을 실행한다. 전건 PASS(실패 시 원인 분석 후 수정, 시나리오 기대가 틀린 경우만 기대 수정).

---

## Phase 8: Polish & 전체 회귀

- [X] T028 [P] 견고성 세트에 연장근무 케이스를 추가한다(scratch `robust/cases.js`: 본인 3, 다른 직원 3, 팀 2). 위젯·필터 위젯에서 실행해 다른 직원 유출 0을 확인한다.
- [X] T029 전체 E2E: `npm run e2e:hr-skill` 전건(기존 실패 KB48·K64 외 신규 실패 0), embed 전건.
- [X] T030 라우팅 평가 `node server/evals/hr-routing/run.js` 2회, 기준선(163·162/168) 이상.
- [X] T031 [P] `docs/conventions/hr-skill-description-pattern.md`의 연장근무 매핑(§5·§7)을 갱신하고 버전을 1.7로 올린다. `HR-SKILL-GUIDE.md`의 근태 연장근무 설명을 갱신한다.
- [X] T032 code-reviewer + security-reviewer 에이전트로 변경분을 검토한다. CRITICAL·HIGH는 수정한다.
- [ ] T033 **실서버 확인**(사용자 세션 필요, quickstart §4). R5 형식을 확인해 예외 함수를 유지하거나 삭제한다. 5240 화면과 3개 달을 대조한다. 무연장 계정 질문. 결과를 `specs/017-hr-overtime-limit/baseline/live-check.md`에 기록한다(세션 값은 기록 금지).
- [X] T034 보고서 `docs/04-report/features/017-hr-overtime-limit.report.md`를 쓴다. 남은 후속: 구 경로 브리지 허용 제거(R8), 운영 배포 순서.

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → **Phase 3(US4 방어 선행)** → Phase 4(US1 MVP) → Phase 5(US2) → Phase 6(US3) → Phase 7 → Phase 8
- US2·US3은 US1의 `overtimeStatus.js` 골격(T013)에 의존한다. US2와 US3은 서로 독립이지만 같은 파일이라 순차로 진행한다.
- T033(실서버)은 사용자 세션이 필요하다. 그 전까지 R5 예외는 잠정 유지한다.

## Parallel Opportunities

- T001 ∥ T002
- T004(okrservice) ∥ T005(teamplgpt), T006 ∥ T007
- 각 Phase의 단위 테스트 작성 ∥ E2E 시나리오 작성 (T010 ∥ T011, T018 ∥ T019, T021 ∥ T022)
- T028 ∥ T031

## Implementation Strategy

1. **방어 먼저(Phase 3)**: 팀 전체 반환 위험이 있는 조회라, 열기 전에 브리지·1행 검증을 둔다.
2. **MVP(Phase 4)**: 이번 기간·지난 달. 여기까지면 "남은 시간" 질문이 해결된다.
3. **운영 오답 봉합(Phase 5)** → **연 단위(Phase 6)** → 경로별 차단 E2E → 회귀·실서버.
4. 커밋은 사용자 요청 시에만 한다(`feat(hr-overtime-limit): …`). teamplgpt·okrservice 각각.

---

## 구현 기록 (2026-10-19)

- T008: JSP 브리지 테스트는 구현 뒤에 썼다 — 수정 전 원본으로 돌려 전부 FAIL함을 따로 확인했다(7/7, 보안 보강 후 18/18).
- E2E K6: "이번 달"을 명시한 질문은 월간 줄만 답하는 게 질문 의도에 맞아(5회 중 4회) 값 정확성만 본다. 주간·월간 두 줄은 기간 없는 질문 **K83**(신규)이 맡는다(5/5).
- K66·K79: 합계를 표 마지막 줄 또는 "총 N시간" 문장 둘 다 인정(값은 정확, 모델이 가끔 문장으로 답함).
- T032 보안 리뷰: 구 연장근무·근무현황 등도 사번 키를 빼면 팀 전체 반환 → 브리지 사번 키 필수를 서버가 사번을 보내는 전 경로로 확대, 증명서 `staffIdNm` 사번 키 추가, 새 경로 허용 키 고정, 공백 본인 ID 거부, JSP `allowedPaths` 교집합, 예약어 키 가드(research R11). research R8 정정.
- T032 코드 리뷰: 주간 줄 R5 예외 제거, 사유 칸 `|`·줄바꿈 처리, 십진수만 숫자, 1~12월 외 입력은 이번 달, 연 단위 첫 달 다중 행 고정 문구, mock 팀원 값 분리.
- 범위 밖 후속: kiwibox IDOR, 위젯 본인 ID 출처(DOM), 미사용 허용 경로, 서버 TZ, 급여명세서 E2E 흔들림(6회 중 4회) — 보고서 §3·§6.
