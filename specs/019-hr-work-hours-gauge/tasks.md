# Tasks: HR 챗봇 월 근무시간 게이지

**Input**: `specs/019-hr-work-hours-gauge/` — spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 필수다(헌장 III E2E-First, 사용자 규칙 TDD). 테스트·시나리오를 먼저 쓰고 FAIL을 확인한 뒤 구현한다.

**약어**:
- `SK` = `server/storage/plugins/agent-skills`
- `T` = `server/__tests__/storage/plugins/agent-skills`
- `E2E` = `server/scripts/e2e-hr-skill`, `EMB` = `server/scripts/e2e-embed-hr-skill`
- `OKR` = `/Users/shin-yeji/okrservice/widgets/client/messenger`

**스토리 순서**: US2(근무시간만)를 US1보다 먼저 만든다 — US1(근무현황 + 게이지)이 US2의 근무시간 블록을 재사용한다. 둘 다 P1.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — 기준선

- [X] T001 [P] 단위 테스트 기준선을 기록한다 → `specs/019-hr-work-hours-gauge/baseline/unit-baseline.md`(`cd server && npx jest __tests__/storage __tests__/utils __tests__/extras utils`의 통과/실패 수, 실패 목록은 018 기준선과 비교).
- [X] T002 [P] okrservice 위젯 테스트 기준선을 기록한다(`cd /Users/shin-yeji/okrservice/widgets && npx jest client/messenger/components/chatbot client/messenger/widget`) → 같은 파일.
- [X] T003 [P] 라우팅 평가 기준선 1회를 기록한다(`node server/evals/hr-routing/run.js`, 실패 ID 목록) → 같은 파일.

---

## Phase 2: Foundational — mock · 본인 한정 · 공유 모듈

**Goal**: 새 조회를 열기 전에 본인 한정 규칙을 세 곳에 두고, 조회·검증·렌더 모듈을 만든다.

### Tests (먼저 작성 → FAIL 확인) ⚠️

- [X] T004 [P] `OKR/widget/__tests__/hrBridge.test.ts`에 contracts/bridge-contract.md 테스트 벡터 7건을 추가하고 FAIL을 확인한다.
- [X] T005 [P] `server/__tests__/extras/kiwibox-bridge.test.js`에 같은 벡터를 추가하고 FAIL을 확인한다.
- [X] T006 [P] `T/self-staff-guard.test.js`에 `/Home.do` 요청에서 `cmmSearchStaffId`가 없으면 조회하지 않는 케이스를 추가하고 FAIL을 확인한다.
- [X] T007 [P] `T/work-hours.test.js`를 신규로 만든다(fetch 주입, 모듈이 없어 FAIL 확인).
  - `planWorkHours`: 기간 없음→current(기준일 오늘·서울), "9월"→month(기준일 9/30), "2025년 9월"→month, "11월"(오늘 10/21)→future, "올해"→year (data-model §3)
  - `toWorkHours`: 정상 Map, 길이 1 배열, 빈 Map·null·2개 배열→ok=false, `basTime2` 없음→max null, `remT` "88.5"/"88:30"(→88.5)/"x"(→null) (research R3·R5)
  - 렌더: contracts/tool-output-work-hours.md §1~§4 글자 일치, §6(신상 칸·0 채움 없음)
  - 모든 요청 form에 `cmd=getHomeWorkStatusBarWidgetMap`, `cmmSearchStaffId=$SELF_STAFF_ID`, `searchYmd`만 있음

### Implementation

- [X] T008 `E2E/mock-hr-api.js`에 `/Home.do` fixture를 추가한다(plan 구현 메모 3: 이번 달·9월 소정 초과·8월 빈 Map·7월 500, 다른 cmd 404). 응답에 `staffNo`·`staffNm`을 넣는다(비노출 검증용).
- [X] T009 [P] `SK/_shared/staffParams.js` `REQUIRED_STAFF_PARAMS`에 `/Home.do: ["cmmSearchStaffId"]`를 추가한다 → T006 PASS.
- [X] T010 [P] `OKR/widget/hrBridge.ts`에 bridge-contract 규칙(경로·cmd·필수 사번·허용 키)을 추가한다 → T004 PASS.
- [X] T011 [P] `extras/kiwibox-bridge/teamplgpt-hr-bridge.js`에 같은 규칙을 추가하고 `extras/kiwibox-bridge/README.md` 오류 표에 반영한다 → T005 PASS.
- [X] T012 `SK/_shared/workHours.js`를 만든다(plan 구현 메모 1: `planWorkHours`, `toWorkHours`, `renderWorkHoursTable`, `runWorkHours`, `formatHours`). 칸 값은 `safeCell`을 거친다 → T007 PASS.

**Checkpoint**: 단위 테스트 T004~T007 전부 PASS, 기준선 외 새 실패 0.

---

## Phase 3: User Story 2 — 근무시간만 묻는다 (Priority: P1)

**Goal**: "이번 달 몇 시간 일했어?"에 근무시간 표만 나온다. "야근 몇 시간"은 연장근무로 간다.

**Independent Test**: 위젯 E2E "이번 달 몇 시간 일했어?" — 근무시간 표 줄이 글자 그대로 붙고, 근무현황 머리글(근무판정)은 없다.

### Tests (먼저 작성 → FAIL 확인) ⚠️

- [X] T013 [P] [US2] `server/evals/hr-routing/dataset.jsonl`에 케이스를 추가한다(패러프레이즈, examples와 겹치지 않게): work_hours 정규·구어·간접 3건, overtime 경계 2건("이번 달 야근 몇 시간…", "초과근무 얼마나…"), work_status 유지 1건. `--grep`으로 FAIL 확인.
- [X] T014 [P] [US2] `EMB/scenarios.json`에 추가: "이번 달 몇 시간 일했어?"(표 줄 `\| 이번 달\(\d+월\) \| 82.5 \| 171.0 \| 224.0 \| 88.5 \|`, `answer_not_pattern` 근무판정·`staffNo` 값), "이번 달 야근 몇 시간 했어?"(mock URL 연장근무 경로, `/Home.do` 없음). FAIL 확인.
- [X] T015 [P] [US2] `E2E/scenarios.json`에 @agent 판(tool 호출 `query_type=work_hours`, `mock_body_pattern` cmd·searchYmd, 다른 직원 "김OO 이번 달 몇 시간 일했어?" → `/Home.do` 요청 없음 `mock_body_pattern_none`). FAIL 확인.

### Implementation

- [X] T016 [US2] `SK/hr-attendance/plugin.json`: `query_type` enum에 `work_hours`, 설명에 의도·차이 축(research R10), overtime 쪽 차이 축, `year_month` 사용 목록에 work_hours, examples 3형태(생략·월만·상대 표현), Location A 정체성 문장에 "월 근무시간"(Convention §7.1).
- [X] T017 [US2] `SK/hr-attendance/handler.js`: `ENDPOINT_MAP.work_hours = { custom: "workHours" }`, `isBlockedQueryType` 검사 뒤 `runWorkHours`로 분기(fetch = `hrFetch` 래핑) → T014·T015 PASS.
- [X] T018 [US2] 라우팅 평가 `--grep`·`--tags boundary,ambiguous` 통과 확인 → T013 PASS. 실패 시 설명 경계 문장만 조정(Convention §7.4).

**Checkpoint**: US2 시나리오 전부 PASS(위젯 3회 반복).

---

## Phase 4: User Story 1 — 근무현황에 근무시간을 함께 본다 (Priority: P1) 🎯

**Goal**: 월 단위 근무현황 답변 = 근무시간 표 + 기존 근무현황 표.

**Independent Test**: 위젯 E2E "이번 달 근무현황 알려줘" — 두 표가 모두 글자 그대로, 근무시간 표가 먼저.

### Tests (먼저 작성 → FAIL 확인) ⚠️

- [X] T019 [P] [US1] `T/work-hours.test.js`에 handler 경유 케이스를 추가한다(harness `runHandler`): 월 단위 work_status 결과가 contracts §5 순서, 근무시간 실패 시 `—` 줄 + 근무현황 표 유지, 근무현황 실패 시 기존 오류 문구만, 연 단위 work_status에는 근무시간 없음, HR 호출 2회가 동시에 시작(순서 무관). FAIL 확인.
- [X] T020 [P] [US1] `EMB/scenarios.json`에 "이번 달 근무현황 알려줘"(근무시간 표 줄 + 근무현황 표 줄, 근무시간 줄이 먼저 — 정규식 `82\.5[\s\S]*근무판정`), "8월 근무현황"(— 줄 + "근무시간을 조회하지 못했습니다" + 근무현황 표) 추가. FAIL 확인.

### Implementation

- [X] T021 [US1] `SK/hr-attendance/handler.js`: 월 단위 work_status(연 단위 분기 뒤)에서 `Promise.all`로 근무현황 조회 + 근무시간 조회, 근무현황 출력 제목 다음에 `renderWorkHoursTable` 블록 삽입(contracts §5) → T019·T020 PASS.
- [X] T022 [US1] `T/period-golden*.test.js` 스냅샷 차이를 확인한다 — work_status 골든에 근무시간 블록이 추가되는 것만 허용, 확인 후 `-u` 갱신. 골든 harness가 `/Home.do`에 응답하도록 fixture 추가가 필요하면 그 테스트 파일에서 한다.
- [X] T023 [US1] 기존 근무현황 E2E(K3·K4·KB20·KB42·Q3·Q5·Q6·K60·K64·K65, EC-ALLOW-01·11·12·16·30 등) 재실행 — 기대값 변경이 필요한 것은 근무시간 블록 추가 때문인 것만 갱신.

### Widget (US1·US2 공통 표시)

- [X] T024 [P] [US1] `OKR/components/chatbot/__tests__/markdownTableUtils.test.ts`에 `workHoursTable` 판별 케이스, `__tests__/WorkHoursGauge.test.tsx` 신규(contracts/widget-work-hours-gauge.md 테스트 벡터 5건 + 막대 시작 위치 동일), `MarkdownTable.test.tsx`에 근무시간 표 → 게이지 렌더 케이스 추가. FAIL 확인.
- [X] T025 [US1] `OKR/components/chatbot/markdownTableUtils.ts` `workHoursTable(headers)`, `WorkHoursGauge.tsx` 신규(chatbotTheme 토큰, reduced-motion), `MarkdownTable.tsx` 분기(`limitTableKind`보다 먼저) → T024 PASS, `npx tsc --noEmit` 새 오류 0.

**Checkpoint**: US1 시나리오 PASS, 위젯 테스트 전부 PASS.

---

## Phase 5: User Story 3 — 지난 달 근무시간 (Priority: P2)

**Goal**: "9월에 몇 시간 일했어?"는 9월 말일 기준 조회, 소정까지 "—", 오지 않은 달·연 단위는 안내.

**Independent Test**: 위젯 E2E "9월에 몇 시간 일했어?" — 요청 본문 `searchYmd=2026-09-30`, 표 줄 `\| 9월 \| 176.0 \| 168.0 \| 220.0 \| — \|`.

### Tests (먼저 작성 → FAIL 확인) ⚠️

- [X] T026 [P] [US3] `EMB/scenarios.json`에 "9월에 몇 시간 일했어?", "지난달 근무현황"(9월 근무시간 + 9월 근무현황), "다음 달 몇 시간 일해?"(`/Home.do` 요청 없음 + "아직 지나지 않은 달"), "올해 몇 시간 일했어?"(`/Home.do` 요청 없음 + 월 단위 안내, 지어낸 연 합계 없음 — `answer_not_pattern` 큰 시간 수치) 추가. FAIL이 나는 것을 확인(이미 T012에서 계획이 구현돼 PASS하면 그 사실을 기록).
- [X] T027 [P] [US3] `E2E/scenarios.json`에 @agent 판 "9월에 몇 시간 일했어?"(`mock_body_pattern` `searchYmd=2026-09-30`), "2025년 9월 근무시간"(`searchYmd=2025-09-30`) 추가.

### Implementation

- [X] T028 [US3] T026·T027이 FAIL이면 `SK/_shared/workHours.js` 계획·구분 이름 규칙을 고쳐 PASS시킨다. year_month 연도 교정(018 hrYearGuard)과 충돌하지 않는지 확인("2025년 9월"은 사용자가 말한 연도라 유지).

**Checkpoint**: US3 시나리오 PASS.

---

## Phase 6: Polish & Cross-Cutting

- [X] T029 [P] `docs/conventions/hr-skill-description-pattern.md` v1.10 — §6 매트릭스·경계 기준표에 work_hours, 변경 이력.
- [X] T030 [P] `HR-SKILL-GUIDE.md` hr-attendance 행에 work_hours(근무시간) 추가.
- [X] T031 전체 회귀: 단위(teamplgpt·okrservice) 기준선 외 새 실패 0, 라우팅 평가 2회 연속 기준선 대비 새 실패 0(Convention §7.3), 위젯·@agent E2E 전체 실행 — 실패는 기준선 실패(KB48, 급여명세서 2건 등)와 대조.
- [X] T032 코드 리뷰(code-reviewer)·보안 리뷰(security-reviewer) — 브리지 3곳 규칙 일치, 신상 칸 비노출, 지어내기 없음. CRITICAL·HIGH 수정.
- [X] T033 i18n 확인: 위젯 새 문자열은 기존 `LimitGauge`와 같이 한국어 고정(HR 데이터 표시 영역, `__()` 미사용) — 이 판단을 report에 기록. 번역 대상 UI(탭·버튼)는 변경 없음.
- [X] T034 실서버 대조(quickstart §4, 세션 ID는 사용자에게 받아 env로만) — 이번 달·지난 달 네 값, `remT` 형식, 0건 응답 모양, `basTime2` 값 → research R3·R5 갱신, SC-001 판정.
- [X] T035 report `docs/04-report/features/019-hr-work-hours-gauge.report.md` 작성(결과·남은 일·배포 순서: 브리지 먼저 또는 동시).

---

## Dependencies

```text
Phase 1 ─▶ Phase 2 (T004~T007 테스트 → T008~T012 구현)
Phase 2 ─▶ Phase 3 US2 ─▶ Phase 4 US1 (서버 T019~T023)
Phase 2 ─▶ Phase 4 위젯 T024~T025 (서버와 독립, 병렬 가능)
Phase 3 ─▶ Phase 5 US3
Phase 3·4·5 ─▶ Phase 6
```

## Parallel Examples

- Phase 2 테스트: T004 · T005 · T006 · T007 동시
- Phase 2 구현: T009 · T010 · T011 동시(서로 다른 파일), T012는 T008 뒤(mock 형식 맞춤)
- US2 테스트: T013 · T014 · T015 동시
- 위젯(T024~T025)은 서버 US1(T019~T023)과 동시

## Implementation Strategy

1. **MVP = Phase 2 + US2**: 근무시간 질문에 표가 나오고, 세 곳 모두 본인 한정. 이 시점에 배포해도 근무현황 답변은 그대로다.
2. **US1 + 위젯**: 근무현황에 근무시간 표, 위젯 게이지.
3. **US3**: 지난 달·오지 않은 달·연 단위 안내.
4. **Polish**: 문서·전체 회귀·리뷰·실서버.

배포 순서: 브리지(위젯 okrservice, JSP 파일)를 서버와 같이 또는 먼저 — 서버만 먼저면 근무시간 부분이 "조회하지 못했습니다"가 된다(spec Assumptions).
