# Implementation Plan: 위젯 HR 메뉴 권한에 5240 PC 메뉴 권한 반영

**Branch**: `feature/skill-modify-hrchat-merge` (teamplgpt 스펙 문서) · okrservice 구현도 같은 이름의 기능 브랜치 | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-widget-menu-pc-permission/spec.md`

## Summary

위젯 메뉴 버튼을 "5240 모바일 메뉴 권한 **또는** PC 메뉴 권한이 있으면 보임"으로 바꾼다(spec D1). PC 권한은 `/getSubLowMenuList.do`(직원용·담당자용)로 받고([research R1](research.md#r1-pc-메뉴-권한을-받는-조회)), 버튼별 PC 직원용 프로그램 코드 대응표([contracts/menu-pc-map.md](contracts/menu-pc-map.md))로 짝짓는다. 어느 쪽에도 권한이 없으면 절대 보이지 않는다(D10, 필수). 버튼은 지금처럼 모바일 화면을 연다.

## Technical Context

**Language/Version**: TypeScript (okrservice `widgets`, React 위젯 — 인라인 스타일 관행)

**Primary Dependencies**: 기존 위젯 브리지(`requestHrBridge` → 호스트 페이지 `hrBridge.ts`), 신규 의존성 없음

**Storage**: 없음(브라우저 메모리 상태)

**Testing**: jest 29 + jsdom (`widgets`), 기존 `menuPermission.test.ts`·`hrBridge.test.ts`·`ChatbotView.test.tsx`

**Target Platform**: 5240 페이지에 붙는 erxes 메신저 위젯(PC·모바일 브라우저)

**Project Type**: 웹 위젯(프론트엔드만)

**Performance Goals**: 챗봇 첫 화면 표시 지연 없음 — 권한 조회는 화면 표시를 기다리게 하지 않는다(spec SC-005)

**Constraints**: 5240(kiwibox) 무수정 · TeamplGPT 서버·HR skill 무변경 · 브리지 허용은 최소(contracts/bridge-allowlist.md) · okrservice perf 규칙(새 조회는 마운트당 1회, 동시 시작)

**Scale/Scope**: 위젯 버튼 34개, 5240 조회 1→3회(챗봇 화면 마운트당)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 비고 |
|---|---|---|
| I. 최소 범위·업스트림 발산 최소화 | 통과 | okrservice 위젯 4파일만. TeamplGPT 코드 무변경 → 업스트림 영향 없음 |
| II. 스펙 비례 | 통과 | 외부 시스템(5240) 조회 추가 → 스펙 경로(트랙 5) 진행 중 |
| III. E2E-First | 해당 없음(대체 검증) | LLM 행태 변경 아님. jest 전수 조합 테스트 + 실위젯 확인(quickstart Q2~Q5) |
| IV. Description-Driven·Multi-Layer | 해당 없음 | HR skill·description 무변경 |
| V. 3-Mode 일관성 | 해당 없음 | 채팅 경로 무변경(위젯 화면 버튼만) |
| VI. Conventional Commits 한국어 | 준수 예정 | okrservice scope `chatbot`, 사용자 요청 시에만 커밋 |
| i18n | 해당 없음 | 새 UI 문자열 없음(버튼 이름 그대로) |
| okrservice perf 규칙 | 통과 | research R5 — 동시 시작, 비차단 |

Phase 1 후 재확인: 변경 없음, 통과.

## Project Structure

### Documentation (this feature)

```text
specs/023-widget-menu-pc-permission/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── menu-pc-map.md
│   └── bridge-allowlist.md
└── tasks.md             # /speckit-tasks
```

### Source Code (okrservice)

```text
widgets/client/messenger/
├── widget/
│   ├── hrBridge.ts                         # /getSubLowMenuList.do 허용 (menuKind=menu01|menu02)
│   └── __tests__/hrBridge.test.ts          # 허용·거부 요청
└── components/chatbot/
    ├── menuPcMap.ts                        # 신규: 버튼 id → PC 기준 대응표 (contracts/menu-pc-map.md)
    ├── menuPermission.ts                   # PC 응답 파서 + 합집합 판단 + 결재 양식 여는 주소
    ├── useMenuPermission.ts                # 모바일·PC 조회 동시 시작, 각자 반영
    └── __tests__/
        ├── menuPcMap.test.ts               # 신규: 34행 불변식
        └── menuPermission.test.ts          # PC 파서·합집합·D10 전수 조합
```

**Structure Decision**: 대응표는 `chatbotMenus.ts`에 필드로 넣지 않고 별도 `menuPcMap.ts`로 둔다. 버튼 목록(화면 표시)과 권한 대응(5240 프로그램 코드)을 분리해 대응표 갱신이 버튼 정의를 건드리지 않게 하고, 불변식 테스트로 두 파일의 id 집합 일치를 강제한다. `ChatbotView.tsx`는 이미 `canOpenMenu`/`resolveMenuPath`만 쓰므로 변경하지 않는다(훅 시그니처 유지).

## 구현 단계

1. **Q0 실응답 확인**(quickstart) — PC 메뉴 응답의 래퍼·키를 확정. research R1과 다르면 파서 설계만 조정.
2. **브리지 허용**(contracts/bridge-allowlist.md) — 테스트 먼저(거부 5종·허용 2종) → 허용 추가.
3. **대응표**(`menuPcMap.ts`) — 불변식 테스트 먼저 → 표 작성.
4. **PC 파서·판단**(`menuPermission.ts`) — `parsePcMenuPermissions`(progCd 없는 행 버림, applCd 공백 제거, 결재 양식 여는 주소), `isMenuAllowed(path, { mobile, pc })` 합집합, `menuOpenPath` PC 폴백. D10 전수 조합 테스트 먼저.
5. **훅**(`useMenuPermission.ts`) — 모바일·menu01·menu02 동시 조회, 받는 대로 상태 갱신, 실패한 쪽만 null. 반환값(`status`, `canOpenMenu`, `resolveMenuPath`) 유지.
6. **회귀** — `ChatbotView.test.tsx` 포함 widgets 관련 jest 전건 PASS.
7. **실위젯 확인** — quickstart Q2~Q5.

## Risks

| 위험 | 대응 |
|---|---|
| PC 응답 키가 소스 추정과 다름 | 단계 1에서 실응답으로 확정 후 구현 |
| 회사마다 다른 PC 프로그램 코드(전용 신청서) | 표에 없으면 모바일 기준(현행 이하로 나빠지지 않음) — 필요 시 표 추가 |
| PC 메뉴 목록이 커서 조회가 느림 | 비차단 — 버튼이 늦게 나타날 뿐 화면 표시는 그대로 |
| 대응표 오류로 권한 없는 버튼 노출 | 표는 직원용 프로그램만(R3 규칙) + 관리자 코드 미포함 테스트. 메뉴 권한은 보안 경계가 아님(spec 배경) |

## Complexity Tracking

위반 없음.
