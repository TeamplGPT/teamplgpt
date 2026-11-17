# Tasks: 위젯 HR 메뉴 권한에 5240 PC 메뉴 권한 반영

**Input**: `specs/023-widget-menu-pc-permission/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: 포함(TDD — 테스트 먼저, FAIL 확인 후 구현). spec SC-002(필수)·SC-003이 자동 테스트를 요구한다.

**경로 기준**: 모든 소스 경로는 okrservice 저장소(`$OKRSERVICE`) 기준. 테스트 실행은 `$OKRSERVICE/widgets`에서 `npx jest <파일>`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·선행 의존 없음 → 병렬 가능
- **[Story]**: US1(PC 권한만 있어도 보임), US2(둘 다 없으면 숨김 — 필수 D10), US3(결재 양식 신청 종류)

---

## Phase 1: Setup

- [X] T001 5240 PC 메뉴 조회 실응답 확인 — quickstart Q0 명령 결과(사용자 제공)로 `/getSubLowMenuList.do` menu01·menu02의 최상위 래퍼 키와 행 키(`progCd`·`progFile`·`applCd`·`dataRwType`)를 확정하고, research R1과 다르면 `specs/023-widget-menu-pc-permission/research.md` R1에 실측 결과를 적는다
- [X] T002 okrservice 기능 브랜치(`feature/skill-modify-hrchat-merge`)에서 기준선 확인 — `widgets`에서 `npx jest client/messenger/components/chatbot client/messenger/widget/__tests__/hrBridge.test.ts` 전건 PASS 기록(미커밋 변경 `ChatbotView.tsx`는 건드리지 않음)

---

## Phase 2: Foundational (모든 스토리의 선행)

**목적**: PC 메뉴 조회 경로 허용 + 대응표 + PC 응답 파서. 이 단계가 끝나야 판단 로직을 바꿀 수 있다.

- [X] T003 [P] 브리지 허용 테스트 먼저 — `widgets/client/messenger/widget/__tests__/hrBridge.test.ts`에 `/getSubLowMenuList.do` 허용 2종(`menuKind=menu01`, `menu02`)·거부 5종(menuKind 없음, `menu03`, 다른 키 동반 `ssnId`/`grpCd`/`mainMenuCd`/`cmmSearchStaffId`, `cmd` 동반) 추가 → FAIL 확인 (contracts/bridge-allowlist.md)
- [X] T004 브리지 허용 구현 — `widgets/client/messenger/widget/hrBridge.ts`의 `ALLOWED_PATHS`에 `/getSubLowMenuList.do`, `ALLOWED_PARAM_KEYS`에 `['menuKind']`, `PARAM_VALUE_ALLOWLIST`에 `{ menuKind: ['menu01','menu02'] }` 추가 → T003 PASS
- [X] T005 [P] 대응표 불변식 테스트 먼저 — 신규 `widgets/client/messenger/components/chatbot/__tests__/menuPcMap.test.ts`: (1) 대응표 id 집합 = `CHATBOT_MENUS` id 집합(34), (2) 합계 progCd 23·applCd 4·없음 5·항상 허용 2, (3) progCd 값에 `MOS-` 코드 없음, (4) contracts/menu-pc-map.md의 값과 행별 일치 → FAIL 확인
- [X] T006 대응표 구현 — 신규 `widgets/client/messenger/components/chatbot/menuPcMap.ts`에 버튼 id → `{kind:'progCd',codes}` / `{kind:'applCd',applCd}` / `{kind:'none'}` / `{kind:'always'}` 표를 contracts/menu-pc-map.md 그대로 작성, 주소로 버튼 id를 찾는 함수(`CHATBOT_MENUS` path 기준, 쿼리 포함 비교는 기존 `menuKey`·신청 종류 규칙 재사용) 제공 → T005 PASS
- [X] T007 [P] PC 응답 파서 테스트 먼저 — `widgets/client/messenger/components/chatbot/__tests__/menuPermission.test.ts`에 `parsePcMenuPermissions` 케이스: progCd 빈 행(1·2레벨) 버림, applCd 공백 제거, 결재 양식 행의 여는 주소 생성(progFile·progCd·dataRwType), 목록이 아닌 응답(로그인 HTML·JSON 아님)은 null, 직원용·담당자용 두 응답 합치기 → FAIL 확인 (data-model.md PcMenuPermissions, T001 실측 키 사용)
- [X] T008 PC 응답 파서 구현 — `widgets/client/messenger/components/chatbot/menuPermission.ts`에 `PcMenuPermissions` 타입, `parsePcMenuPermissions`, `mergePcMenuPermissions`, `loadPcMenuPermissions(menuKind)`(브리지 `{ menuKind }` 호출, 실패 시 null) 추가. 기존 모바일 함수는 시그니처 유지 → T007 PASS

**Checkpoint**: 브리지가 PC 조회를 허용하고, 대응표와 파서가 준비됨. 아직 버튼 판단은 모바일 기준 그대로.

---

## Phase 3: User Story 2 - 어느 쪽에도 권한이 없는 메뉴는 숨긴다 (Priority: P1, 필수 D10) 🎯 안전망 먼저

**Goal**: 합집합으로 바꾸기 전에 "둘 다 없으면 숨김"을 전수 테스트로 고정한다.

**Independent Test**: 위젯 버튼 34개 × 권한 {없음, 모바일만, PC만, 둘 다} × 조회 {둘 다 성공, 모바일 실패, PC 실패, 둘 다 실패}에서 기대 노출과 실제가 같다.

- [X] T009 [US2] D10 전수 조합 테스트 먼저 — `widgets/client/messenger/components/chatbot/__tests__/menuPermission.test.ts`에 `CHATBOT_MENUS` 전부를 순회하는 표 기반 테스트 추가: 기대값 = 항상허용 ∨ 모바일허용 ∨ (표가 progCd/applCd이고 PC에 해당 코드 있음). 특히 "모바일 없음 + PC 없음 + 항상허용 아님 → 숨김"과 "둘 다 조회 실패 → 항상 허용 2개만"을 단언. 대응표에 없는 PC 코드(PRC-0450·ORG-0070·TAA-0730 등)만 PC에 있을 때 해당 버튼 숨김도 포함 → FAIL 확인(합집합 미구현이라 PC만 케이스가 실패해야 함)

---

## Phase 4: User Story 1 - PC 권한만 있는 직원도 위젯에서 메뉴를 연다 (Priority: P1)

**Goal**: 오이사공 계정처럼 PC 권한만 있는 메뉴가 보이고 열린다.

**Independent Test**: PC에 TAA-0070만 있는 상태에서 휴가신청 버튼이 보이고, `menuOpenPath`가 모바일 휴가신청 주소를 돌려준다.

- [X] T010 [US1] 합집합 판단 구현 — `widgets/client/messenger/components/chatbot/menuPermission.ts`의 `isMenuAllowed`가 `{ mobile, pc }` 상태를 받아 data-model.md 판단 규칙대로 계산(모바일 규칙은 현행 그대로, PC는 `menuPcMap` 조회). 기존 호출부 호환을 위해 모바일 단독 인자도 받도록 유지 → T009 PASS
- [X] T011 [US1] 훅 확장 — `widgets/client/messenger/components/chatbot/useMenuPermission.ts`에서 모바일·menu01·menu02 조회를 동시에 시작하고 끝나는 대로 상태 갱신(한쪽 실패는 그쪽만 null, 전부 실패면 `failed`). 반환값 `status`·`canOpenMenu`·`resolveMenuPath` 시그니처 유지
- [X] T012 [P] [US1] 훅 테스트 — `widgets/client/messenger/components/chatbot/__tests__/menuPermission.test.ts`(또는 같은 폴더 신규 `useMenuPermission.test.tsx`)에 브리지 호출 3건이 동시에 나가고, PC 응답만 먼저 와도 휴가신청이 열리며, PC 조회 실패 시 모바일 권한 버튼이 유지됨을 확인(SC-004)
- [X] T013 [US1] 화면 회귀 — `widgets/client/messenger/components/chatbot/__tests__/ChatbotView.test.tsx`에 PC 권한만 있는 휴가신청이 답변 아래 바로가기에 보이는 케이스 추가, 기존 케이스 전건 PASS(`ChatbotView.tsx`는 수정하지 않음)

**Checkpoint**: MVP — 합집합 동작 + D10 안전망.

---

## Phase 5: User Story 3 - 결재 양식 버튼은 신청 종류까지 맞아야 열린다 (Priority: P2)

**Goal**: PC 권한도 신청 종류(applCd) 단위로만 인정하고, 사직서는 PC 행 정보로도 열린다.

**Independent Test**: PC에 applCd 5470만 있으면 고충신고서만 보이고 근무복신청서·사직서(히타치)는 숨김. 모바일 행 없이 PC 사직서(1590) 행만 있으면 PC 행 정보로 만든 주소로 열린다.

- [X] T014 [P] [US3] 신청 종류 테스트 먼저 — `widgets/client/messenger/components/chatbot/__tests__/menuPermission.test.ts`: PC applCd 5470만 → 고충신고서만 보임, 1590만 → 사직서(직원)만 보이고 사직서(히타치) 숨김, 6000-303만 → 사직서(히타치)만 보임, 모바일 행 없이 PC 1590 행만 있을 때 `menuOpenPath`가 `progCd`·`dataRwType` 붙은 PC 주소 반환 → FAIL 확인
- [X] T015 [US3] 결재 양식 PC 폴백 구현 — `widgets/client/messenger/components/chatbot/menuPermission.ts`의 `menuOpenPath`가 모바일 openPaths → PC approvalOpenPaths → 버튼 주소 순으로 고르도록 수정 → T014 PASS

---

## Phase 6: Polish & 검증

- [X] T016 widgets 관련 jest 전건 PASS — `npx jest client/messenger/components/chatbot client/messenger/widget`
- [X] T017 타입 검사 — `widgets`에서 기존 타입 검사 명령(`npx tsc --noEmit -p .` 또는 패키지 스크립트)으로 변경 파일 오류 없음
- [X] T018 code-reviewer 에이전트 리뷰 — 변경 4파일 + 테스트, CRITICAL·HIGH 해결
- [ ] T019 실위젯 확인 — quickstart Q2(휴가신청·경조휴가신청·근무일정조회 보임), Q3(사직서 열림), Q4(권한 없는 메뉴 숨김 — 대조 계정 없으면 그 사실 기록), Q5(PC 조회 차단 시 동작)
- [ ] T020 결과 기록 — 위젯 AI 테스트 문서(Claude Docs "위젯 AI 테스트 범위 안내") 메뉴권한 절을 새 기준(PC·모바일 합집합)으로 갱신

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** → **Phase 3(US2 테스트)** → **Phase 4(US1 구현)** → **Phase 5(US3)** → **Phase 6**
- US2를 US1보다 먼저 둔 이유: 필수 조건(D10)의 실패 테스트를 먼저 세워 합집합 구현이 이를 깨지 않게 한다. US2 자체는 구현 태스크가 없고 US1 구현(T010)으로 통과한다.
- T001은 사용자 응답이 필요하다. 응답 전에는 T003~T006(파서 무관)을 먼저 진행할 수 있다.

### Parallel Opportunities

- Phase 2: T003(브리지 테스트) · T005(대응표 테스트) · T007(파서 테스트)은 서로 다른 파일 → 병렬
- T004·T006·T008 구현도 서로 다른 파일(`hrBridge.ts` / `menuPcMap.ts` / `menuPermission.ts`) → 각 테스트 뒤 병렬
- Phase 4: T012 훅 테스트는 T011과 다른 파일이면 병렬

## Implementation Strategy

1. **MVP** = Phase 1~4: PC 권한 합집합 + D10 전수 테스트. 오이사공 계정 휴가신청 문제 해결.
2. **확장** = Phase 5: 결재 양식 PC 폴백(사직서 주소).
3. 각 Checkpoint에서 jest 전건 PASS 확인 후 다음 단계.
