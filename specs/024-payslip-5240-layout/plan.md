# Implementation Plan: 위젯 챗봇 급여명세서를 5240 급여명세서 화면 구성으로

**Branch**: `feature/skill-modify-hrchat-merge` (teamplgpt) · okrservice도 같은 이름의 기능 브랜치 | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-payslip-5240-layout/spec.md`

## Summary

"급여명세서 보여줘"(hr-salary `payslip`)가 5240 급여명세서 화면처럼 합계·지급내역·공제내역·기재사항을 한 답으로 보여주게 한다(spec D1). handler가 같은 지급 건으로 5240 조회 4개를 동시에 부르고([research R1·R2·R6](research.md)), 영역별 표로 묶는다([contracts/payslip-answer.md](contracts/payslip-answer.md)). 기재사항 조회(`List3`)를 위젯 브리지에 허용한다([contracts/bridge-allowlist.md](contracts/bridge-allowlist.md)). 공제만·실수령만 질문은 그대로다(D2).

## Technical Context

**Language/Version**: JavaScript (Node, TeamplGPT `server/storage/plugins/agent-skills/hr-salary`), TypeScript (okrservice `widgets` 위젯 브리지)

**Primary Dependencies**: 기존 `_shared/hrSession.hrFetch`(위젯 경로는 클라이언트 위임), `_shared/formatTable`(renderTable·ANSWER_GUIDE·날짜 표시), `utils/hrTableBlocks`(표 블록 통과). 신규 의존성 없음

**Storage**: 없음

**Testing**: TeamplGPT jest(handler 하네스 `__tests__/storage/plugins/agent-skills/helpers/hrHandlerHarness`), 라우팅 평가 `server/evals/hr-routing`, embed E2E `server/scripts/e2e-embed-hr-skill`, agent E2E `server/scripts/e2e-hr-skill`; okrservice jest(`hrBridge` 테스트)

**Target Platform**: 위젯 챗봇(embed) + chat/query·react·@agent 경로(같은 handler)

**Project Type**: HR agent-skill(서버 plugin) + 웹 위젯 브리지

**Performance Goals**: 명세서 답 대기가 기존(1회 조회)보다 눈에 띄게 늘지 않게 네 조회를 동시에 부른다(R6)

**Constraints**: kiwibox 무수정 · 본인 사번 강제 유지 · 브리지 허용은 List3 하나 · 표 블록 규칙(018) — `## ` 제목은 사용자에게 안 보이고 공통 지침 뒤 줄은 잘린다(R7) · 업스트림 파일 무변경

**Scale/Scope**: handler 1개·plugin.json 1개·mock 1개·시나리오 2개 파일·평가 데이터셋 1개(TeamplGPT), hrBridge 1개(okrservice) + 테스트

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 비고 |
|---|---|---|
| I. 최소 범위·업스트림 발산 최소화 | 통과 | fork 전용 HR skill·위젯 브리지만. 업스트림 파일 무변경 |
| II. 스펙 비례 | 통과 | 외부 시스템 조회 추가 + 브리지 허용 변경 → 트랙 5 진행 중 |
| III. E2E-First | 준수 | 시나리오·평가 케이스 먼저 추가 → FAIL 확인 → 구현 → 전건 확인(tasks Phase 2) |
| IV. Description-Driven·Multi-Layer | 준수(설명 필요) | **handler 수정 사유**: 이 기능은 LLM 행태 제어가 아니라 조회·출력 형식 변경(L2 코드)이다. LLM의 조회 선택은 plugin.json payslip 설명(L1)으로 하고, L3는 평가 케이스·E2E로 둔다 |
| V. 3-Mode 일관성 | 확인 필요 → 계획 반영 | handler 하나라 4경로 동일. embed E2E + agent E2E(K10·KB43) 둘 다 돌린다 |
| VI. Conventional Commits 한국어 | 준수 예정 | scope `hr-salary`·`widget-bridge`, 사용자 요청 시에만 커밋 |
| VII. i18n | 해당 없음 | 위젯 UI 문자열 추가 없음(답변 본문만) |
| Convention(HR description) | 준수 | Location B payslip 항목만 수정, §4.3(2단계 예외) 유지, §7.3 회귀 절차, T-A/T-B 해당 없음 |

Phase 1 후 재확인: 변경 없음, 통과.

## Project Structure

### Documentation (this feature)

```text
specs/024-payslip-5240-layout/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── payslip-answer.md
│   └── bridge-allowlist.md
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Source Code

```text
teamplgpt/server/
├── storage/plugins/agent-skills/hr-salary/
│   ├── handler.js            # payslip: 4조회 동시 + 영역별 표 (변경)
│   └── plugin.json           # query_type 설명의 payslip 항목 (변경)
├── __tests__/storage/plugins/agent-skills/
│   └── payslip-5240-layout.test.js   # 신규 — 영역·숨김 칸·소급·실패 처리
├── evals/hr-routing/dataset.jsonl     # 명세서·공제·실수령 경계 케이스 (추가)
└── scripts/
    ├── e2e-hr-skill/mock-hr-api.js    # List·List2·List3·Map fixture (추가)
    ├── e2e-embed-hr-skill/scenarios.json  # 명세서 답 구성 시나리오 (추가·갱신)
    └── e2e-hr-skill/scenarios.json        # K10·KB43 기대 확인 (필요 시 갱신)

okrservice/widgets/client/messenger/widget/
├── hrBridge.ts               # CMD_ALLOWLIST에 List3 (변경)
└── __tests__/hrBridge.test.ts (또는 기존 위치)  # List3 허용·본인 강제·List4 거부
```

**Structure Decision**: 명세서 조립은 hr-salary handler 안에 둔다(다른 skill 재사용 없음). 표 렌더는 `_shared/formatTable`의 `renderTable`/`ANSWER_GUIDE`를 쓰고 지침은 맨 끝 한 번만 붙인다.

## Complexity Tracking

| 항목 | 왜 필요한가 | 더 단순한 대안을 버린 이유 |
|---|---|---|
| handler 수정(헌장 IV "handler 무수정" 원칙의 예외) | 4개 조회를 한 답으로 묶는 것은 데이터 조립이라 description으로 할 수 없다 | AI가 4번 부르게 하는 안(B)은 누락·표 흩어짐(spec D1 비선택안) |
