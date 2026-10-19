# Tasks: HR 챗봇 표 직접 출력

**Input**: `specs/018-hr-table-passthrough/` — spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 필수다(헌장 III, 사용자 규칙 TDD). 테스트를 먼저 쓰고 FAIL을 확인한 뒤 구현한다.

**약어**:
- `S` = `server`
- `OKR` = `/Users/shin-yeji/okrservice/widgets/client/messenger/components/chatbot`

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — 기준선

- [X] T001 [P] 단위 테스트 기준선 → `specs/018-hr-table-passthrough/baseline/unit-baseline.md`
  - teamplgpt: 017 기준선 방식(`npx jest __tests__/storage __tests__/utils __tests__/extras utils --json`, 실패 목록 파일)
  - okrservice: `npx jest client/messenger/components/chatbot`
- [X] T002 [P] embed E2E 전건 기준선(현재 코드) → 같은 파일. 표를 돌려주는 시나리오의 현재 답변(모델이 다시 쓴 표·목록) 예시 3건을 기록한다.

---

## Phase 2: Foundational — 순수 함수 모듈

**Goal**: 루프·위젯이 쓸 규칙을 네트워크 없이 확정한다(contracts/final-answer §1~§4).

- [X] T003 `S/__tests__/utils/hrTableBlocks.test.js` 신규, FAIL 확인
  - `extractTableBlock`: 연장근무 한도·내역, 연 단위(정보 줄 포함), 출퇴근(기준시간 줄·"그 외 N일" 줄), 조직도(내부 참조 줄 제거), 증명서, 급여 지급 건(내부 참조 줄 제거)
  - 표 없는 결과 → `null`: 거절 문구, `> ⚠️` 오류, "기록이 없습니다"만 있는 결과, 미래 달 안내
  - pseudo tool·HR 아닌 tool → `null`
  - 지시 줄(`> [응답 형식]`, `> [안내]`, `[내부 참조`, "답변에 포함하지 마세요", `---`+`[응답 지침]`)이 블록에 하나도 없다
  - 표 줄은 글자 그대로다(빈 칸 `—` 포함)
  - `toModelResult`: 블록이 있으면 `[응답 형식]` 줄을 지우고 `[표 표시]` 줄을 붙인다. 블록이 없으면 원문 그대로
  - `sanitizeModelText`: 표 줄·`#` 제목·숫자 목록 줄을 지운다. 숫자 없는 목록·일반 문장은 남긴다. 빈 줄을 정리한다
  - `joinFinalAnswer(text, blocks)`: 순서 유지, 중복 제거, 문장이 비면 블록만
- [X] T004 `S/__tests__/utils/hrTableBlocks-golden.test.js` 신규 — 골든 스냅샷 2개 파일(155개)의 output을 전부 `extractTableBlock`에 통과시킨다
  - 표가 있는 output → 블록 있음, 블록 안 지시 줄 0
  - 표가 없는 output → `null`
- [X] T005 `S/utils/hrTableBlocks.js` 구현 → T003·T004 PASS. 함수당 50줄 이하, 불변 처리.

**Checkpoint**: 추출·거르기 규칙 확정.

---

## Phase 3: User Story 1·2 — 표가 시스템이 만든 그대로, 빈 칸은 "—" (P1) 🎯 MVP

**Goal**: 위젯·채팅 답변 끝에 조회 결과 표가 글자 그대로 붙는다.

**Independent Test**: "연장근무 알려줘"(embed) 답변에 `| 이번 주(M/D 기준) | 12.0 | 4.0 | 8.0 |`와 사유 빈 칸 `| — |` 줄이 있다.

### Tests ⚠️

- [X] T006 [P] [US1] `S/utils/chats/toolCalling/__tests__/loop.test.js`에 시나리오 추가, FAIL 확인
  - (a) 스트리밍: HR tool 결과에 표가 있으면, 최종 라운드에서 `textResponseChunk`가 **한 번만**(close:true) 나간다. 그 `textResponse`는 문장 + 블록이고, `completeText`와 같다.
  - (b) 모델이 표·숫자 목록을 쓰면 최종 답변에서 지워진다. 블록 표는 그대로다.
  - (c) 블록이 없는 대화(HR 아님, 거절 tool, 표 없는 결과)는 지금처럼 여러 청크로 스트리밍된다.
  - (d) 비스트리밍 경로도 (a)와 같다.
  - (e) 모델에 넘기는 tool 결과에 `[표 표시]`가 있고 `[응답 형식]`은 없다.
  - (f) HR tool 두 번 → 블록 두 개가 호출 순서대로, 같은 블록은 한 번.
  - (g) 캡처 중 tool 호출 라운드면 텍스트 외 이벤트(`toolCallInvocation`)는 실제 응답으로 나간다.
- [X] T007 [P] [US1] embed E2E 기대값 갱신 → `S/scripts/e2e-embed-hr-skill/scenarios.json`
  - 표를 돌려주는 기존 시나리오(EC-ALLOW-01~03·05~16·20·23·27, EC-FILTER-01·02·06·07·11)에 mock 표 줄 정규식 `answer_pattern` 1개 이상과 `answer_not_pattern` `(?m)^[-*•] .*\d`를 추가한다.
  - 신규 **EC-ALLOW-29** "연장근무 알려줘": 한도 두 줄 + `\| — \|`
  - 신규 **EC-ALLOW-30** "3월 출퇴근 기록": 표 줄 수 = mock 행 수
  - 판정 엔진이 `(?m)` 같은 플래그를 지원하지 않으면 `^`·`\n` 기반 패턴으로 쓴다(러너 확인).
- [X] T008 [US1] T007을 현재 코드로 실행해 FAIL 확인, run 경로 기록

### Implementation

- [X] T009 [US1] `S/utils/chats/toolCalling/loop.js` 구현
  - `executeAndAppend`가 원 결과에서 `extractTableBlock`을 구하고, 모델용 결과는 `toModelResult` → `withSelfDataNotice` 순으로 만든다. 블록은 호출부의 `tableBlocks`에 쌓는다(새 배열 반환 패턴).
  - 스트리밍 라운드: `tableBlocks.length > 0`이면 캡처 응답(`createCaptureResponse(response)` — write 수집, on·removeListener·writable·writableEnded 위임)으로 `handleStream`을 부른다.
    - tool 호출 라운드면 수집한 비텍스트 이벤트만 흘린다.
    - 텍스트 라운드면 `joinFinalAnswer(sanitizeModelText(resultText), tableBlocks)`를 한 번에 쓴다(close:true, metrics).
  - 비스트리밍 경로도 같은 조립을 한다.
  - `completeText` = 최종 답변
  - 함수가 50줄을 넘으면 도우미로 뺀다.
- [X] T010 [US1] T006 PASS, `S/utils/chats/toolCalling/__tests__/*` 전체 PASS(loop-stream-guard 포함)
- [X] T011 [US1] T007 E2E PASS 확인, 실패 시 원인 분석

**Checkpoint**: MVP — 위젯 답변의 표가 조회 결과와 같다.

---

## Phase 4: User Story 3 — 모델 문장은 짧은 요점만 (P2)

- [X] T012 [P] [US3] 견고성 측정 스크립트 → scratch `robust/table-pass.js`. 위젯(전체 허용)에서 대표 20종 × 3회를 실행하고, 다음을 계산한다.
  - 답변 끝 표 = mock 표 일치율
  - 모델 문장 부분의 표·숫자 목록 잔존
  - 빈 칸 대체(사유 칸에 "통상근무" 등)
  - 첫 문장 값 = 표 값(특정 값 질문 10종)
- [X] T013 [US3] 측정하고, 기준(SC-001 100%, SC-002 0, SC-003 0%, SC-005 100%)에 못 미치면 `[표 표시]` 문구나 `sanitizeModelText` 규칙을 조정한다. 조정 후 T003·T006을 다시 PASS시킨다.

---

## Phase 5: User Story 4 — 보호 규칙 유지 (P1)

- [X] T014 [P] [US4] embed E2E 거절·내부값 시나리오(EC-ALLOW-17~19·21·22·26·28, EC-FILTER-08~10·12)에 `answer_not_pattern` `\|.*\|.*\|`(표 없음)를 추가한다. 조직도 시나리오에는 `answer_not_pattern` 내부 코드(`0300|0303`)를 추가한다.
- [X] T015 [US4] 실행 PASS, 견고성 세트(다른 직원·팀 연장근무 포함)에서 유출 0을 확인한다.

---

## Phase 6: 위젯 — 한도 게이지·월별 막대 (D11)

- [X] T016 [P] `OKR/__tests__/MarkdownTable.test.tsx`에 contracts/widget-limit-gauge §테스트 1~5와 "월별 막대 시작점이 모든 줄에서 같다"(격자 첫 칸 폭 고정, 값 칸 고정폭)를 추가하고 FAIL을 확인한다.
- [X] T017 `OKR/markdownTableUtils.ts`에 `limitTableKind` 추가, `OKR/MarkdownTable.tsx`에 gauge·monthly 모드 구현(미리보기 v7 모양) → T016 PASS. 기존 MarkdownTable 테스트 PASS. `tsc` 오류 0. i18n 사용 여부를 확인한다(위젯이 다른 문자열에 i18n을 쓰면 같은 방식으로).

---

## Phase 7: 017 연 단위 표 정리 (D12)

- [X] T018 [P] `S/__tests__/storage/plugins/agent-skills/overtime-status.test.js`와 `period-year-mode.test.js`의 기대를 바꾸고 FAIL을 확인한다.
  - 실패 달은 `| 2026-03 | — | — | — |`
  - 합계는 `| 합계 (조회된 N개월) | — | X | — |`
  - 정보 줄 `> 조회되지 않은 달은 표에 —로 표시했습니다.`
- [X] T019 `S/storage/plugins/agent-skills/_shared/overtimeStatus.js` `renderYear` 수정 → PASS. 017 계약(`specs/017-hr-overtime-limit/contracts/tool-output-overtime.md` §3)을 갱신한다.

---

## Phase 8: Polish & 회귀

- [X] T020 단위 전체 기준선 비교(새 실패 0), okrservice chatbot 테스트 전체 PASS
- [X] T021 E2E 전건: embed(표 기대 포함) + @agent(D9로 기존 동작 — 회귀 없음)
- [X] T022 라우팅 평가 2회(기준선 161·162/168 이상)
- [X] T023 [P] 문서: `HR-SKILL-GUIDE.md`(표 직접 출력 동작·지시 줄 규칙 — 새 handler는 모델용 지시를 `> [`로 시작하게), `docs/conventions/hr-skill-description-pattern.md` v1.8 이력, 016/017 보고서의 관련 항목 각주
- [X] T024 code-reviewer + security-reviewer 검토(캡처 응답·거르기·블록 추출이 거절·내부값 우회 통로가 되지 않는지), CRITICAL·HIGH 수정
- [ ] T025 미리보기와 실제 위젯 비교(사용자) — 운영 반영 전
- [X] T026 보고서 `docs/04-report/features/018-hr-table-passthrough.report.md`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2(규칙) → Phase 3(MVP) → Phase 4·5(같은 측정 인프라)
- Phase 6(위젯)과 Phase 7(017)은 Phase 2 이후 Phase 3과 **독립**(다른 저장소·파일)
- Phase 8은 모두 끝난 뒤

## Parallel Opportunities

- T001 ∥ T002
- T003 ∥ T004 (같은 모듈의 다른 테스트 파일)
- T006 ∥ T007
- Phase 6 ∥ Phase 7 ∥ Phase 3 구현
- T012 ∥ T014

## Implementation Strategy

1. 규칙 모듈을 먼저 확정한다(Phase 2). 골든 155개로 추출 규칙이 기존 출력 전부에 맞는지 확인한 뒤 루프에 붙인다.
2. MVP(Phase 3): 위젯 답변의 표가 글자 그대로 붙는다. 사용자 핵심 요구(표, 빈 칸 지어내기 금지)를 여기서 충족한다.
3. 측정(Phase 4·5) → 위젯 게이지(6) → 017 정리(7) → 회귀·리뷰·보고(8)
4. 커밋은 사용자 요청 시에만 한다(teamplgpt·okrservice 각각).
