# Tasks: HR 챗봇 시각화(조직도·근무현황·급여추세)

**Input**: Design documents from `specs/014-hr-chatbot-viz/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/viz-block.schema.md, quickstart.md

**Tests**: 헌장 §III(E2E-First, NON-NEGOTIABLE)에 따라 teamplgpt 측 E2E 시나리오는 필수이며 코드 변경 전에 append→FAIL 확인 순서를 지킨다. okrservice 측 렌더러 유닛 테스트도 포함한다.

**Organization**: spec.md의 우선순위(P1=근무현황, P2=급여추세, P3=조직도)에 따라 스토리별로 구성.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 선행 미완료 태스크 의존 없음)
- **[Story]**: 해당 태스크가 속한 사용자 스토리(US1/US2/US3)
- 파일 경로는 teamplgpt(server 상대경로) / okrservice(widgets 상대경로) 기준으로 명시

## Path Conventions

- teamplgpt: `/Users/shin-yeji/teamplgpt/server/...`
- okrservice: `/Users/shin-yeji/okrservice/widgets/client/...`

---

## Phase 1: Setup

**Purpose**: 신규 의존성 준비

- [ ] T001 [P] okrservice `widgets/package.json`의 `dependencies`에 `mermaid`, `chart.js` 추가 후 `yarn install`(widgets 디렉토리에서 실행)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 3개 스토리 모두가 공유하는 가드 규칙(teamplgpt)과 렌더 디스패치 골격(okrservice). 이 단계 완료 전에는 어떤 스토리도 실제 그래프를 그릴 수 없다.

**⚠️ CRITICAL**: 이 단계가 끝나야 Phase 3+ 스토리 작업을 시작할 수 있다.

- [ ] T002 teamplgpt `server/scripts/e2e-hr-skill/scenarios.json`에 시각화 요청 시나리오 3개 추가(work_status/salary_statement/org_members 각 1개, "~그래프로 보여줘" 발화, 기대값에 `viz` 코드블록 포함 여부 체크 추가) — 실행해 **FAIL 확인**(`npm run e2e:hr-skill -- --only=<신규ID들>`)
- [ ] T003 teamplgpt `server/scripts/e2e-embed-hr-skill/`의 시나리오 파일에 동일 3종 시각화 요청 시나리오 추가 — 실행해 **FAIL 확인**(`npm run e2e:embed-hr-skill -- --only=<신규ID들>`)
- [ ] T004 teamplgpt `server/utils/hrSkillGuard.js`의 `hrSkillCommonLines()`에 `[HR_VIZ_OUTPUT]` 규칙 추가(contracts/viz-block.schema.md 포맷 그대로 지시) — depends on T002, T003
- [ ] T005 teamplgpt T002·T003 시나리오 재실행, **전건 PASS 확인** — depends on T004 (헌장 §III E2E-First 완료 지점)
- [ ] T006 [P] okrservice `widgets/client/messenger/components/chatbot/ChatbotView.tsx`의 `flushCodeBlock()`에 `codeLang === "viz"` 분기 추가 — JSON.parse 실패 또는 `vizRenderers.dispatchViz()`가 무효 판정 시 기존 코드블록 폴백 렌더링 유지, 유효 시 반환된 React 노드를 대신 렌더
- [ ] T007 [P] okrservice 신규 파일 `widgets/client/messenger/components/chatbot/vizRenderers.ts` 생성 — `VizBlock`/`OrgChartData`/`WorkStatusData`/`SalaryTrendData` 타입 정의, `dispatchViz(raw: string)` 함수(JSON 파싱 + `type` 분기 + 각 렌더 함수 호출, 미구현/무효 시 `null` 반환), `loadChartJs()`/`loadMermaid()` 동적 import 유틸. `renderOrgChart`/`renderWorkStatusChart`/`renderSalaryTrendChart`는 이 단계에서 `null`을 반환하는 자리표시자로 선언(각 스토리에서 구현)

**Checkpoint**: 가드 규칙과 렌더 디스패치 골격 완료 — 이제 스토리별로 실제 렌더 함수만 채우면 됨.

---

## Phase 3: User Story 1 - 근무현황을 그래프로 확인 (Priority: P1) 🎯 MVP

**Goal**: "근무현황 그래프로 보여줘" 요청 시 항목별 건수 막대 그래프 표시

**Independent Test**: 위젯에서 "이번 달 근무현황 그래프로 보여줘"만 입력해 막대 그래프가 표시되는지 확인(quickstart.md 시나리오 2-2)

### Implementation for User Story 1

- [ ] T008 [P] [US1] okrservice `vizRenderers.ts`의 `renderWorkStatusChart(data)` 구현 — `WorkStatusData` → Chart.js bar config 객체 반환, `labels`/`values` 누락·길이 불일치 시 `null` 반환
- [ ] T009 [US1] okrservice `ChatbotView.tsx`(또는 `vizRenderers.ts`의 마운트 헬퍼) — `type==="workstatus"`일 때 `<canvas>` 엘리먼트 생성 후 `loadChartJs()` 완료 시 `new Chart(canvas, config)` 호출하도록 연결 — depends on T007, T008
- [ ] T010 [P] [US1] okrservice 신규 `widgets/client/messenger/components/chatbot/__tests__/vizRenderers.test.ts`에 `renderWorkStatusChart` 유닛 테스트 추가(정상 입력 1케이스, 필수 필드 누락 1케이스)
- [ ] T011 [US1] 수동 검증 — quickstart.md 시나리오 2의 2번(근무현황 그래프) 실 위젯 데모 + 회귀 확인("그래프" 미언급 질문은 기존과 동일하게 표만 출력) — depends on T009

**Checkpoint**: User Story 1 단독으로 완전히 동작·시연 가능(MVP)

---

## Phase 4: User Story 2 - 급여추세를 그래프로 확인 (Priority: P2)

**Goal**: "급여 추세 그래프로 보여줘" 요청 시 월별 급여 선 그래프 표시

**Independent Test**: 위젯에서 "최근 급여 추세 그래프로 보여줘"만 입력해 선 그래프가 표시되는지 확인(quickstart.md 시나리오 2-3)

### Implementation for User Story 2

- [ ] T012 [P] [US2] okrservice `vizRenderers.ts`의 `renderSalaryTrendChart(data)` 구현 — `SalaryTrendData` → Chart.js line config 객체 반환, `labels`/`series` 누락·길이 불일치 시 `null` 반환
- [ ] T013 [US2] okrservice `type==="salarytrend"`일 때 `<canvas>` + `loadChartJs()` + `new Chart(canvas, config)` 연결 — depends on T007, T012 (T009와 동일 마운트 헬퍼 재사용)
- [ ] T014 [P] [US2] okrservice `vizRenderers.test.ts`에 `renderSalaryTrendChart` 유닛 테스트 추가(정상 입력, 단일 월 데이터, 필드 누락 각 1케이스)
- [ ] T015 [US2] 수동 검증 — quickstart.md 시나리오 2의 3번(급여추세 그래프) 실 위젯 데모 — depends on T013

**Checkpoint**: User Story 1·2 모두 독립적으로 동작

---

## Phase 5: User Story 3 - 소속 팀 구성원을 조직도로 확인 (Priority: P3)

**Goal**: "우리 팀 조직도 보여줘" 요청 시 팀 1단계 트리 다이어그램 표시

**Independent Test**: 위젯에서 "우리 팀 조직도 보여줘"만 입력해 트리 다이어그램이 표시되는지 확인(quickstart.md 시나리오 2-4)

### Implementation for User Story 3

- [ ] T016 [P] [US3] okrservice `vizRenderers.ts`의 `renderOrgChart(data)` 구현 — `OrgChartData` → Mermaid `graph TD` 문자열 생성(노드 라벨의 특수문자 이스케이프 포함), `root`/`members` 누락·빈 배열 시 `null` 반환
- [ ] T017 [US3] okrservice `type==="orgchart"`일 때 컨테이너 엘리먼트 생성 후 `loadMermaid()` 완료 시 `mermaid.render()`로 SVG 마운트 — depends on T007, T016
- [ ] T018 [P] [US3] okrservice `vizRenderers.test.ts`에 `renderOrgChart` 유닛 테스트 추가(정상 입력, 구성원 1명, 필드 누락 각 1케이스)
- [ ] T019 [US3] 수동 검증 — quickstart.md 시나리오 2의 4번(조직도) 실 위젯 데모, 구성원 1명 엣지 케이스 확인 — depends on T017

**Checkpoint**: 3개 스토리 모두 독립적으로 동작

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 3개 스토리 공통 마무리

- [ ] T020 [P] okrservice `vizRenderers.ts` — 배열형 필드가 정상 파싱됐으나 길이 0인 경우(0건) 공통 처리: `null`(폴백) 대신 "표시할 데이터가 없습니다" 안내 노드 반환(data-model.md 검증 규칙 반영, 3개 렌더 함수 공통)
- [ ] T021 [P] teamplgpt `docs/conventions/hr-skill-description-pattern.md`에 `[HR_VIZ_OUTPUT]` 가드 추가 사실을 §2 Location E 참조 목록에 반영(신규 컨벤션 섹션 추가는 아님, 기존 문서에 한 줄 갱신)
- [ ] T022 quickstart.md의 3개 시나리오(E2E 자동/실 위젯 수동/유닛 테스트) 전체 재실행 최종 확인
- [ ] T023 헌장 §III 최종 확인 — `npm run e2e:hr-skill`, `npm run e2e:embed-hr-skill` 전건 PASS 캡처(완료 보고에 첨부)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음, 즉시 시작 가능
- **Foundational (Phase 2)**: Setup 완료 후 시작 — 모든 사용자 스토리를 막는(BLOCK) 단계
- **User Stories (Phase 3-5)**: 모두 Foundational 완료 후 시작 가능. 우선순위 순(P1→P2→P3) 진행 권장, 각 스토리는 독립적으로 완결
- **Polish (Phase 6)**: 원하는 스토리들이 모두 완료된 후

### User Story Dependencies

- **US1 (P1)**: Foundational 이후 시작 가능, 다른 스토리에 의존 없음
- **US2 (P2)**: Foundational 이후 시작 가능, US1과 무관하게 독립 테스트 가능(단, T009에서 만든 canvas 마운트 헬퍼를 재사용)
- **US3 (P3)**: Foundational 이후 시작 가능, US1/US2와 무관

### Parallel Opportunities

- T002, T003(서로 다른 E2E 스위트)는 병렬 가능
- Foundational 완료 후 T008(US1)/T012(US2)/T016(US3)는 서로 다른 함수이므로 병렬 작성 가능(단, 모두 같은 파일 `vizRenderers.ts`에 추가되므로 동시 편집 시 병합 충돌 주의 — 실질적으로는 순차 커밋 권장)
- T010/T014/T018(유닛 테스트)는 각 스토리 구현 완료 후 해당 스토리 내에서 병렬

---

## Parallel Example: Foundational

```bash
Task: "teamplgpt e2e-hr-skill 시나리오 3개 추가 + FAIL 확인 (T002)"
Task: "teamplgpt e2e-embed-hr-skill 시나리오 3개 추가 + FAIL 확인 (T003)"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup 완료
2. Phase 2 Foundational 완료(가드 E2E PASS + 디스패치 골격)
3. Phase 3 US1(근무현황) 완료
4. quickstart.md 시나리오 2-2로 검증 → 데모 가능(MVP)

### Incremental Delivery

1. Setup + Foundational → 기반 완료
2. US1 추가 → 독립 검증 → 데모(MVP)
3. US2 추가 → 독립 검증 → 데모
4. US3 추가 → 독립 검증 → 데모
5. Polish

---

## Notes

- [P] 태스크 = 서로 다른 파일 또는 충분히 분리된 작업, 선행 미완료 의존 없음
- Foundational의 T002~T005는 헌장 §III(E2E-First)를 그대로 구현한 순서이며 순서를 바꾸지 않는다(FAIL 확인 없이 T004로 건너뛰지 않는다)
- 각 태스크 완료 후 커밋(사용자 요청 시), 체크포인트마다 스토리 단독 데모로 검증
