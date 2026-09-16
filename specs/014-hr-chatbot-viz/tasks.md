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

- [X] T001 [P] okrservice `widgets/package.json`의 `dependencies`에 `mermaid`, `chart.js` 추가 후 `yarn install`(widgets 디렉토리에서 실행) — mermaid는 `11.8.1` 정확 고정(Node 18 호환, marked 의존성 버전 이슈로 caret 대신 exact pin 필요했음)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 3개 스토리 모두가 공유하는 가드 규칙(teamplgpt)과 렌더 디스패치 골격(okrservice). 이 단계 완료 전에는 어떤 스토리도 실제 그래프를 그릴 수 없다.

**⚠️ CRITICAL**: 이 단계가 끝나야 Phase 3+ 스토리 작업을 시작할 수 있다.

- [X] T002 teamplgpt `server/scripts/e2e-hr-skill/scenarios.json`에 시각화 요청 시나리오 3개(K60/K61/K62) 추가 + `mock-hr-api.js`에 salary_statement 다개월/org_members fixture 보강 — FAIL 확인 완료(3/3 FAIL, 사유: viz 블록 누락). 부수 발견: "조직도"만으로는 기존 라우팅이 org_tree로 가서 K62 메시지를 "팀원 목록을 조직도로" 형태로 보정(spec.md에 기록)
- [X] T003 teamplgpt `server/scripts/e2e-embed-hr-skill/scenarios.json`에 동일 3종(EC-ALLOW-12/13/14) 추가 — FAIL 확인 완료(3/3 FAIL, 사유 동일). 무관한 기존 실패(EC-ALLOW-04, 사전부터 실패) 확인 — 본 변경과 무관, 범위 밖
- [X] T004 teamplgpt `server/utils/hrSkillGuard.js`의 `hrSkillCommonLines()`에 `[HR_VIZ_OUTPUT]` 규칙 추가(contracts/viz-block.schema.md 포맷 그대로 지시) — depends on T002, T003
- [X] T005 teamplgpt T002·T003 시나리오 재실행, **전건 PASS 확인** — hr-skill 60/61(무관한 기존 결함 KB48 1건, 가드 적용 전 baseline에서도 동일 실패함을 stash로 대조 확인), embed-hr-skill 26/26(단독 실행 시) — depends on T004 (헌장 §III E2E-First 완료 지점)
- [X] T006 [P] okrservice `widgets/client/messenger/components/chatbot/ChatbotView.tsx`의 `flushCodeBlock()`에 `codeLang === "viz"` 분기 추가 — JSON.parse 실패 또는 `vizRenderers.dispatchViz()`가 무효 판정 시 기존 코드블록 폴백 렌더링(`flushPlainCodeBlock`으로 분리) 유지, 유효 시 `VizBlockRenderer` 노드를 대신 렌더
- [X] T007 [P] okrservice 신규 파일 `widgets/client/messenger/components/chatbot/vizRenderers.ts` 생성 — `OrgChartData`/`WorkStatusData`/`SalaryTrendData` 타입, `dispatchViz(raw: string)`(JSON 파싱 + `type` 분기), `loadChartJs()`/`loadMermaid()` 동적 import 유틸, `VizBlockRenderer` 공용 마운트 컴포넌트. 계획 대비 변경: 자리표시자 없이 3개 렌더 함수를 이 단계에서 함께 구현(스토리 3개가 한 파일의 서로 다른 export라 단계 분리 실익이 없어 T008/T012/T016과 통합 완료)

**Checkpoint**: 가드 규칙과 렌더 디스패치 골격 완료 — 이제 스토리별로 실제 렌더 함수만 채우면 됨.

---

## Phase 3: User Story 1 - 근무현황을 그래프로 확인 (Priority: P1) 🎯 MVP

**Goal**: "근무현황 그래프로 보여줘" 요청 시 항목별 건수 막대 그래프 표시

**Independent Test**: 위젯에서 "이번 달 근무현황 그래프로 보여줘"만 입력해 막대 그래프가 표시되는지 확인(quickstart.md 시나리오 2-2)

### Implementation for User Story 1

- [X] T008 [P] [US1] okrservice `vizRenderers.ts`의 `renderWorkStatusChart(data)` 구현 — `WorkStatusData` → Chart.js bar config 객체 반환, `labels`/`values` 누락·길이 불일치 시 invalid, 0건 시 empty
- [X] T009 [US1] okrservice `VizBlockRenderer`(vizRenderers.ts) — `workstatus` 결과일 때 `<canvas>` 생성 후 `loadChartJs()` 완료 시 `new Chart(canvas, config)` 호출 — depends on T007, T008
- [X] T010 [P] [US1] okrservice 신규 `widgets/client/messenger/components/chatbot/__tests__/vizRenderers.test.ts`에 `renderWorkStatusChart` 유닛 테스트 추가(정상/빈 배열/필드 누락)
- [ ] T011 [US1] 수동 검증 — quickstart.md 시나리오 2의 2번(근무현황 그래프) 실 위젯 데모 + 회귀 확인("그래프" 미언급 질문은 기존과 동일하게 표만 출력) — depends on T009 (okrservice dev 서버·실 HR 세션 필요, 사용자 환경에서 수행)

**Checkpoint**: User Story 1 단독으로 완전히 동작·시연 가능(MVP)

---

## Phase 4: User Story 2 - 급여추세를 그래프로 확인 (Priority: P2)

**Goal**: "급여 추세 그래프로 보여줘" 요청 시 월별 급여 선 그래프 표시

**Independent Test**: 위젯에서 "최근 급여 추세 그래프로 보여줘"만 입력해 선 그래프가 표시되는지 확인(quickstart.md 시나리오 2-3)

### Implementation for User Story 2

- [X] T012 [P] [US2] okrservice `vizRenderers.ts`의 `renderSalaryTrendChart(data)` 구현 — `SalaryTrendData` → Chart.js line config 객체 반환, `labels`/`series` 누락·길이 불일치 시 invalid, 0건 시 empty
- [X] T013 [US2] okrservice `VizBlockRenderer`의 `salarytrend` 분기 — T009와 동일 마운트 헬퍼 재사용(같은 컴포넌트 내 분기) — depends on T007, T012
- [X] T014 [P] [US2] okrservice `vizRenderers.test.ts`에 `renderSalaryTrendChart` 유닛 테스트 추가(정상/단일 월/필드 누락)
- [ ] T015 [US2] 수동 검증 — quickstart.md 시나리오 2의 3번(급여추세 그래프) 실 위젯 데모 — depends on T013 (사용자 환경에서 수행)

**Checkpoint**: User Story 1·2 모두 독립적으로 동작

---

## Phase 5: User Story 3 - 소속 팀 구성원을 조직도로 확인 (Priority: P3)

**Goal**: "팀원 목록을 조직도로 보여줘" 요청 시 팀 1단계 트리 다이어그램 표시

**Independent Test**: 위젯에서 "우리 팀 팀원 목록을 조직도로 보여줘"만 입력해 트리 다이어그램이 표시되는지 확인(quickstart.md 시나리오 2-4)

### Implementation for User Story 3

- [X] T016 [P] [US3] okrservice `vizRenderers.ts`의 `renderOrgChart(data)` 구현 — `OrgChartData` → Mermaid `graph TD` 문자열 생성(노드 라벨의 특수문자 이스케이프 포함), `root`/`members` 누락 시 invalid, 빈 배열 시 empty
- [X] T017 [US3] okrservice `VizBlockRenderer`의 `orgchart` 분기 — 컨테이너 엘리먼트 생성 후 `loadMermaid()` 완료 시 `mermaid.render()`로 SVG 마운트 — depends on T007, T016
- [X] T018 [P] [US3] okrservice `vizRenderers.test.ts`에 `renderOrgChart` 유닛 테스트 추가(정상 입력, 구성원 1명, 필드 누락 각 1케이스)
- [ ] T019 [US3] 수동 검증 — quickstart.md 시나리오 2의 4번(조직도) 실 위젯 데모, 구성원 1명 엣지 케이스 확인 — depends on T017 (사용자 환경에서 수행). "조직도"만으로는 org_tree로 라우팅될 수 있어 "팀원 목록을 조직도로"처럼 구성원 의도 단어를 함께 말해야 함(spec.md 참고)

**Checkpoint**: 3개 스토리 모두 독립적으로 동작

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 3개 스토리 공통 마무리

- [X] T020 [P] okrservice `vizRenderers.ts` — 배열형 필드가 정상 파싱됐으나 길이 0인 경우(0건) 공통 처리: `RenderResult`의 `status: "empty"`로 3개 렌더 함수가 처음부터 공통 반환(T007/T008/T012/T016과 함께 구현 완료), `VizBlockRenderer`가 "표시할 데이터가 없습니다" 노드 렌더
- [X] T021 [P] teamplgpt `docs/conventions/hr-skill-description-pattern.md`에 `[HR_VIZ_OUTPUT]` 가드 추가 사실을 §2 Location E 참조 목록에 반영(신규 컨벤션 섹션 추가는 아님, 기존 문서에 한 줄 갱신)
- [X] T022 quickstart.md 3개 시나리오 중 자동화 가능한 2개(E2E 자동, 유닛 테스트) 재확인 완료 — 시나리오 2(실 위젯 수동 데모)는 실 HR 세션·okrservice dev 서버가 필요해 사용자 환경에서 수행 필요(T011/T015/T019와 동일 사유)
- [X] T023 헌장 §III 최종 확인 — `npm run e2e:hr-skill` 60/61(무관한 기존 결함 KB48 제외 시 신규 시나리오 3/3 포함 전건 PASS), `npm run e2e:embed-hr-skill` 26/26 PASS(완료 보고에 첨부)

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
