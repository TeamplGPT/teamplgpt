---
description: "HR 챗봇 다른 직원 정보 차단 (조직도만 예외) — 작업 목록"
---

# Tasks: HR 챗봇 다른 직원 정보 차단 (조직도만 예외)

**Input**: `specs/016-hr-other-employee-block/`의 spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 포함한다. 근거는 두 가지다.
- 헌장 §III E2E-First: 평가 FAIL(0/7)은 확인됐다. E2E·단위는 코드 전에 FAIL을 확인한다.
- 전역 TDD 규칙

**경로 기준**: 리포 루트. skill 디렉토리 `server/storage/plugins/agent-skills/`를 `SK/`로 줄여 쓴다.

**실행 환경**: `export PATH="$HOME/.nvm/versions/node/v18.19.0/bin:$PATH"`. 테스트는 `server/`에서 실행한다.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — 기준선

**Purpose**: 015 + 즉시 완화(가드 E4) 상태를 기준으로 고정한다. 이후 "본인 질문 영향 0" 판정의 비교 대상이다.

- [X] T001 [P] 단위 테스트 기준선을 기록한다 → `specs/016-hr-other-employee-block/baseline/unit-baseline.md` + `unit-baseline-passed.txt`
  - `npx jest --json`: 스위트·테스트 수, 실패 이름 목록, 통과 이름 목록. 015 최종(1161 통과·98 실패)과 같아야 한다.
- [X] T002 [P] 라우팅 평가 기준선을 기록한다 → `specs/016-hr-other-employee-block/baseline/routing-baseline.md`
  - 가드 E4 2회 결과(151/158·152/158, 기준선 7건 외 실패 0, 연도 14/14, 다른 직원 7/7)
  - 즉시 완화 전 수치(다른 직원 0/7 ×2, research R2 표)
  - 원본 리포트 경로

---

## Phase 2: Foundational — 공용 모듈 2개

- [X] T003 [P] 거절 모듈 테스트를 쓰고 FAIL을 확인한다 → `server/__tests__/storage/plugins/agent-skills/other-employee-block.test.js`
  - `isBlockedQueryType`: 6종 true, 남는 query_type·다른 skill false
  - `OTHER_EMPLOYEE_REFUSAL` 문구가 contracts/blocked-query-types.md §1과 같다. `> ⚠️` 접두
- [X] T004 거절 모듈을 구현한다 → `SK/_shared/otherEmployee.js`
- [X] T005 [P] 본인 데이터 안내 모듈 테스트를 쓰고 FAIL을 확인한다 → `server/__tests__/utils/hrSelfDataNotice.test.js`
  - `withSelfDataNotice`:
    - hr-* 문자열 결과 끝에 문구가 붙는다
    - 조직도(`hr-personnel` org_tree·org_members) 예외
    - 비 hr·비문자열은 그대로 반환
    - `Error…`·`> ⚠️…` 접두 유지
    - args 문자열 JSON·깨진 JSON 처리
    - 입력 불변
  - `wrapHrRuntime`:
    - 감싼 handler가 원래 handler를 `this` 보존으로 호출하고 결과에 문구를 붙인다
    - 비 hr skill은 원래 runtime 그대로
- [X] T006 본인 데이터 안내 모듈을 구현한다 → `server/utils/hrSelfDataNotice.js` (문구는 contracts/self-data-notice.md)

**Checkpoint**: 모듈 2개가 단위 테스트를 통과한다. 아직 handler·루프는 무수정이다.

---

## Phase 3: User Story 1 — 다른 직원 지칭 질문 거절 (Priority: P1) 🎯 MVP

**Goal**: "김기현 연차 알려줘"류에 조회하지 않거나(채팅·@agent·필터 위젯), 강제 조회돼도(전체 허용 위젯) 본인 데이터를 그 사람 것으로 답하지 않고 거절한다.

**Independent Test**: @agent·embed에서 "김기현 연차 알려줘" → 거절 문구, 숫자 없음.

### Tests for User Story 1 (먼저 작성 → FAIL 확인) ⚠️

- [X] T007 [P] [US1] 평가 케이스를 추가한다 → `server/evals/hr-routing/dataset.jsonl`
  - oth-08~11, ctl-org-01 (contracts/test-expectations.md §2)
  - `--tags other-employee`·`--grep ctl-org` 결과를 기록한다
- [X] T008 [P] [US1] E2E runner를 확장한다 → `server/scripts/e2e-hr-skill/runner.js` + `README.md` 판정 필드 표
  - `expect.mock_body_pattern_none: string[]`: 기록된 `.do` 요청 body 중 하나라도 맞으면 FAIL
- [X] T009 [US1] E2E 시나리오를 추가한다
  - @agent K69 → `server/scripts/e2e-hr-skill/scenarios.json`
  - embed EC-ALLOW-17(전체 허용·강제 호출 — 답변 판정), EC-FILTER-08(필터·강제 없음) → `server/scripts/e2e-embed-hr-skill/scenarios.json`
  - 서버를 띄워 FAIL을 확인한다(015 방식: `SERVER_PORT=3011`, runner 복사본 `127.0.0.1`)
- [X] T010 [US1] 루프 부착 테스트를 쓰고 FAIL을 확인한다 → `server/utils/chats/toolCalling/__tests__/loop.test.js`
  - hr tool 결과가 모델 메시지에 안내 포함으로 들어간다
  - 오류·가드 판정 플래그는 원래 결과 기준이다
  - 비 hr tool은 그대로다

### Implementation for User Story 1

- [X] T011 [US1] `server/utils/chats/toolCalling/loop.js` `executeAndAppend`: 판정 플래그를 계산한 뒤, 모델에 넘기는 결과에만 `withSelfDataNotice` 적용
- [X] T012 [US1] `server/utils/agents/imported.js` `plugin()`: `...customFunctions` → `...wrapHrRuntime(this.name, customFunctions)` + require 1줄 (업스트림 최소 diff)
- [X] T013 [US1] 가드 10항을 보완한다 → `server/utils/hrSkillGuard.js` (contracts/guard-rule.md 변경 후 문구. 다른 줄 무변경)
- [X] T014 [US1] US1 검증
  - `npx jest` T003·T005·T010 통과
  - `--tags other-employee` 2회 100%
  - `--grep year` 14/14
  - att-ot-year-02 10회
  - E2E K69·EC-ALLOW-17·EC-FILTER-08 PASS

**Checkpoint**: 다른 직원 지칭 질문이 채팅·@agent·위젯 모두에서 거절된다(MVP).

---

## Phase 4: User Story 2 — 다른 직원 정보 조회 제공 중단 (Priority: P1)

**Goal**: 휴가 캘린더·생일자·결재함 미결/기결/반려/참조를 어떤 경로로도 조회하지 않는다. 결재는 기안함만, 미결은 건수만 남긴다.

**Independent Test**: "우리 팀 휴가자 현황 보여줘"·"나한테 결재 올린 문서 목록" → 다른 직원 이름 0건. "결재 대기 몇 건" → 건수만.

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] handler 거절 단위 테스트를 추가하고 FAIL을 확인한다 → `other-employee-block.test.js`
  - 6종 각각 HR 호출 0건 + 거절 문구
  - 잘못된 query_type 안내에 제거 값이 나오지 않는다
  - drafted·todo_count는 그대로 호출된다
- [X] T016 [P] [US2] 평가 18건 기대값을 바꾼다 → `dataset.jsonl` (contracts/test-expectations.md §1)
  - 바꾼 18건을 실행해 현재 결과를 기록한다(FAIL 예상: 제거 조회를 여전히 호출)
- [X] T017 [US2] E2E 시나리오
  - K8·K58 변경, K70·K71 추가 → `e2e-hr-skill/scenarios.json`
  - EC-ALLOW-18 추가 → `e2e-embed-hr-skill/scenarios.json`
  - FAIL을 확인한다
- [X] T018 [US2] 015 테스트 자산을 정리한다(spec D8, contracts/test-expectations.md §5)
  - `period-golden.test.js`: 제거 조회 24건을 목록에서 뺀다
  - `period-golden-extra.test.js`: approval completed 9건을 뺀다
  - `period-year-mode.test.js`: 결재 it.each는 drafted만 남긴다. vacation_calendar·birthday 연도 테스트는 "호출 0 + 거절 문구"로 바꾼다
  - 남은 골든 155건을 **handler 수정 전** `--ci`로 실행해 전부 일치하는지 확인한다
  - obsolete 스냅샷만 지운다. 정리 전후 snap 파일 비교가 "삭제만"이어야 한다

### Implementation for User Story 2

- [X] T019 [US2] `SK/hr-attendance/handler.js`: 진입부 거절. vacation_calendar 맵·라벨·컬럼·`YEAR_MODE` 항목 삭제
- [X] T020 [P] [US2] `SK/hr-personnel/handler.js`: 진입부 거절. birthday 맵·라벨·`maskYmdColumns`·`maskYmdToMonthDay` 삭제
- [X] T021 [P] [US2] `SK/hr-approval/handler.js`: 진입부 거절. `QUERY_TYPES` drafted만
- [X] T022 [US2] plugin.json 3개 → `SK/hr-{attendance,personnel,approval}/plugin.json` (contracts/blocked-query-types.md §3 — enum·description·year_month·examples)
- [X] T023 [US2] US2 검증
  - T015 통과
  - 골든 155 `--ci` 일치
  - 평가 18건 기대대로
  - E2E K8·K58·K70·K71·EC-ALLOW-18 PASS

**Checkpoint**: 다른 직원 정보를 돌려주는 조회가 사라졌다.

---

## Phase 5: User Story 3 — 조직도는 이름·소속·직위·직책만 (Priority: P2)

**Goal**: 조직원 목록에서 사번·근무정보·근무상황·회사를 숨기고 조직도 그래프는 유지한다.

**Independent Test**: "우리 팀 조직도 보여줘" → 그래프 표시, 사번·근무정보 없음.

- [X] T024 [P] [US3] org_members 렌더 단위 테스트를 추가하고 FAIL을 확인한다 → `other-employee-block.test.js`
  - 표 머리가 성명·소속·직위·직책이다
  - STAFF_NO·CORP_NM·WORK_TYPE·WORK_INFO 값이 출력에 없다
  - 안내 미부착(조직도 예외)은 T005에서 확인한다
- [X] T025 [P] [US3] E2E K62에 answer_not_pattern `2026000[12]`·`통상근무`를 추가한다 → `e2e-hr-skill/scenarios.json`
- [X] T026 [US3] `SK/hr-personnel/handler.js` org_members `columns`를 4개로 줄인다
- [X] T027 [US3] US3 검증: T024 통과, E2E K62·K63·EC-ALLOW-14·15 PASS
  - 최종 전건(`baseline/e2e-after.md`)에서 K62·K63·EC-ALLOW-14·15 모두 PASS, T024 단위 테스트 통과

---

## Phase 6: User Story 4 — 본인 질문 무변경 (Priority: P1)

- [X] T028 [US4] 단위 테스트 전체를 T001과 비교한다 → `baseline/unit-after.md`
  - 기준선 통과 → 미통과는 T018에서 정리한 목록뿐이다
  - 새 실패 0
- [X] T029 [US4] 라우팅 평가 전체 2회를 T002와 비교한다 → `baseline/routing-after.md`
  - 기대값을 바꾼 케이스 외 신규 실패 0
  - 다른 직원 100%, 연도 14/14
  - 결과(코드 리뷰 반영 후 최종): 161/166 × 2, 신규 실패 0, 다른 직원 11/11 × 2, 대조군 3/3 × 2, 연도 14/14 × 2
- [X] T030 [US4] 가드 회귀 조건을 반복 측정한다 → `baseline/routing-after.md`
  - att-ot-year-02 10회 (목표 10/10)
  - EC-FILTER-03 16회 (HEAD 수준 ≥ 10/16)
  - 결과: att-ot-year-02 10/10, EC-FILTER-03 14/16 (가드 F-noSEARCH — research R11)
- [X] T031 [US4] E2E 두 스위트 전건 → `baseline/e2e-after.md`
  - 015 방식으로 실행한다. 015에서 기존 불안정·기존 실패로 확인한 케이스는 HEAD 비교로 판정한다
  - 결과(최종 설정): @agent 70/71(K64 기존 불안정), embed 33/33, EC-FILTER-03 11/16

---

## Phase 7: Polish & Cross-Cutting

- [X] T032 [P] 컨벤션 문서 갱신 → `docs/conventions/hr-skill-description-pattern.md`
  - §6 적용 현황 매트릭스에서 제거 query_type
  - hr-approval 단일값형
  - `[HR_SKILL_COMMON]` 10항
  - 변경 이력 v1.6
- [X] T033 [P] 인수인계 가이드 갱신 → `HR-SKILL-GUIDE.md`
  - §3.1 `otherEmployee.js`·`hrSelfDataNotice.js` 행
  - §8 사고 사례 "다른 직원 이름 질문에 본인 데이터를 그 사람 것처럼 답함" + 전체 허용 위젯 강제 호출 주의(R10)
- [X] T034 code-reviewer 에이전트로 변경 전체를 리뷰한다. CRITICAL·HIGH는 수정하고 T028~T031 해당 항목을 재실행한다.
  - 1차 리뷰: H1(원형 키 우회)·M1(@agent 안내 잘림)·M3(섞인 질문·특정 직원 조직도)·M4(직원 검색 skill 잔존)·M6(대조군)·L4(러너 800줄)·L6(결재선 이름) 반영
  - 재검토: MEDIUM(tool 이름 바꿔 부르기로 차단 우회) — 폴더 이름 기준 판정. LOW 3건(@agent 연결 테스트, embed 러너 미지원 필드, 판정 분기 테스트) 반영. LOW(연말정산 handler 원형 키 — 본인 데이터만 조회, 016 범위 밖)는 제안으로 남김
  - 재측정 중 잡은 회귀·과잉 거절 4건 보정: 결재 본인 예외, 인사 조직도 예외 P3, 연말정산 summary, 가드 직원 검색 줄 삭제(R11)
  - 알려진 한계: 강제 호출이 없는 경로의 섞인 질문(R13)
- [ ] T035 위젯·실서버 확인 — quickstart.md §4 표. **사용자 위젯 직접 확인 또는 사용자 허용 하에 실행.**
- [X] T036 (선택, spec D10 — 사용자 승인 시에만) okrservice 위젯 브리지 허용 목록 → `/Users/shin-yeji/okrservice/widgets/client/messenger/widget/hrBridge.ts`
  - `/TAADclzVcatnCldrMgr.do`·`getTAADclzVcatnCldrMgr` 제거
  - `/EAPRequestMgr.do`는 `selectGubun=2`만 통과
  - okrservice 테스트 실행
- [X] T037 완료 보고서 → `docs/04-report/features/016-hr-other-employee-block.report.md`

---

## Phase 8: 016 후속 — 이어지는 질문·산정 근거 지어내기 (research R14, 2026-10-16 사용자 승인: A·B)

- [X] T038 원인 조사(systematic-debugging): 스크린샷 대화를 로컬 다중 턴으로 재현 — 강제 호출 + 본인 데이터 tool만 있음(이어지는 질문 5/5 본인 값 귀속), 대화 이력에 조회 근거 없음(@agent 조회 없이 항목 분해 지어냄) → research R14
- [X] T039 E2E 러너 `setup_messages` 지원(두 러너·README) + 시나리오 추가·변경(EC-ALLOW-17~23, EC-FILTER-09, K74, K75) → 수정 전 FAIL 확인(EC-ALLOW-17~19·21·22·23, K75)
- [X] T040 A 거절 선택지: `server/utils/hrSelfDataNotice.js` `withHrRefusalTool`, `server/utils/chats/toolCalling/loop.js` `isToolChoiceForced` + 단위 테스트
- [X] T041 B1 수치·근거 안내(`SELF_DATA_NOTICE`) + B2 가드 2항 재조회 + 단위 테스트
- [X] T042 회귀: 단위 테스트 전체(새 실패 0), 라우팅 평가 전체 2회(기준선 외 신규 실패 0), E2E 전건(@agent 72/73 — K64 기존 불안정, embed 37/37), EC-FILTER-03 16회(12·13) → `baseline/*-after.md`
- [X] T042a 코드 리뷰 반영: 거절 선택지 허용 예외(조직도·건수·인사말), 앞 대화 실패 시 run FAIL, `strict: false`, 누락 테스트, K75 `min_hr_calls`, EC-ALLOW-24·25 → 재측정(@agent 71/73, embed 37/39 — 실패는 기존 실패·안전 쪽 변동, research R14)
- [ ] T043 (보류 — 사용자 결정: 예방 우선) C: 대화 이력에 앞 턴의 조회 근거 표시
- [X] T044 견고성 측정 세트(32케이스 × 3경로 × 3회) → 누수 2건·지어내기 1건 발견 (research R15)
- [X] T045 거절 선택지 상시 제공, '다시 조회해봐' 재요청 포함, 적정성 판단 금지 안내, 가드 2항 확인형 예시(r4) + 단위 테스트 + E2E EC-FILTER-10·EC-ALLOW-26·K76
- [X] T046 회귀(기본 프롬프트): 견고성 위젯 유출 0/93, E2E @agent 72/73·embed 38/39, EC-FILTER-03 16/16, 라우팅 평가 신규 실패 0, 단위 테스트 새 실패 0
- [X] T047 운영 시스템 프롬프트 조건 측정: 현재 프롬프트(P0) vs 다른 직원·임의 답변 금지 규칙 추가본(P1) — `evals/hr-routing/run.js --prompt-file` 추가 (research R16). 결과: P2 권고(지어내기·재요청 누수 0, 대조군 유지)
- [ ] T048 운영 워크스페이스 시스템 프롬프트에 P2 문안 반영 — **사용자 작업**(설정 화면)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3(US1) → Phase 4(US2) → Phase 5(US3) → Phase 6 → Phase 7
- **T018(골든 정리·`--ci` 확인)은 T019~T021 handler 수정 전에 끝나야 한다.** 남은 155건이 "수정 전 코드"와 일치함을 먼저 보이기 위해서다.
- `SK/hr-personnel/handler.js`는 T020·T026이 같이 고친다 → 순차
- 가드(`hrSkillGuard.js`)는 T013에서만 바꾼다. 이후 Phase 6에서 회귀를 측정한다.

## Parallel Opportunities

| 묶음 | 병렬 가능 |
|---|---|
| Phase 1 | T001 ∥ T002 |
| Phase 2 | T003 ∥ T005 |
| US1 테스트 | T007 ∥ T008 |
| US2 | T015 ∥ T016 / 구현 T020 ∥ T021 (T019는 attendance 단독) |
| US3 | T024 ∥ T025 |
| Phase 7 | T032 ∥ T033 |

## Implementation Strategy

### MVP (US1)

Phase 1~3을 마치면 "김기현 연차 알려줘"가 모든 경로에서 거절된다. 여기서 멈추고 위젯으로 확인할 수 있다.

### 점진 확장

US2(조회 제공 중단) → US3(조직도 컬럼) → Phase 6 회귀 → Phase 7 문서·리뷰·위젯·보고서

### 사용자 환경·승인이 필요한 작업

- T035 위젯 확인
- T036 okrservice 변경(선택)
