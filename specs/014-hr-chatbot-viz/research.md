# Phase 0 Research: HR 챗봇 시각화

## R1. react 모드가 `[HR_VIZ_OUTPUT]` 가드를 상속하는가? (헌장 §V 3-Mode 일관성)

- **Decision**: 별도 조치 불필요. react 모드는 `hrSkillCommonLines()`를 자동 상속한다.
- **Rationale**: `server/utils/chats/react/index.js`가 시스템 프롬프트를 만들 때 `chatPrompt(workspace, user)`(`server/utils/chats/index.js`)를 그대로 재사용하고, `chatPrompt()`는 이미 내부에서 `hrSkillChatGuard()` → `hrSkillCommonLines()`를 호출해 결과에 append한다. `[HR_VIZ_OUTPUT]`을 `hrSkillCommonLines()`에 추가하면 chat/query·embed·@agent·react 4경로 모두 코드 수정 없이 자동 반영된다.
- **Caveat**: react 모드 호출부는 `chatPrompt()`의 3번째 인자(`allowedToolNames`)를 넘기지 않아 embed 대화 단위 제한 개념이 없는 워크스페이스 전역 판단으로 동작한다 — 이는 기존 chat/query 비-embed 경로와 동일한 동작이라 본 기능 범위의 신규 결함이 아니다.
- **Alternatives considered**: react/index.js에 별도로 `hrSkillGuard`를 직접 호출하는 방안 → 이미 간접 상속되고 있어 불필요한 중복.

## R2. 신규 폴백 안내 문구에 i18n(ko/en) 처리가 필요한가? (헌장 §VII i18n)

- **Decision**: 불필요. 기존 컴포넌트 관행을 그대로 따라 하드코딩 한국어 문자열로 작성한다.
- **Rationale**: `widgets/client/messenger/components/chatbot/` 디렉토리 전체(ChatbotView.tsx 포함)에 i18next/react-i18next 등 i18n 레이어가 전혀 없고, 기존 오류 메시지("오류가 발생했습니다. 다시 시도해주세요." 등)도 모두 하드코딩 한국어다. 시각화 폴백 문구도 동일 관행을 따르는 것이 기존 코드와의 일관성을 해치지 않는다.
- **Alternatives considered**: 이번 기능을 계기로 i18n 레이어를 새로 도입 → 헌장 §I(최소 범위) 위반(요청되지 않은 인접 개선), 기각.

## R3. 시각화 JSON을 어디서 Mermaid/Chart.js로 변환할 것인가?

- **Decision**: okrservice `vizRenderers.ts`에 순수 함수 3개(JSON → Mermaid 문자열 / JSON → Chart.js config)로 변환 로직을 둔다. LLM은 고정 스키마 JSON만 생성한다(brainstorming에서 이미 합의, approach B).
- **Rationale**: LLM이 Mermaid 문법을 직접 생성하게 하면(approach A) 문법 오류 위험이 상시 존재. 순수 함수로 분리하면 유닛 테스트로 결정론적 검증이 가능(헌장 §III E2E-First와 별개로 프론트 단위 테스트로 회귀 방지).
- **Alternatives considered**: (A) LLM이 Mermaid 문법 직접 출력 — 기각(문법 깨짐 디버깅 반복 우려). (C) okrservice가 별도로 재조회 — 기각(FR-007 위반, 백엔드 신규 로직 필요).

## R4. mermaid/chart.js 번들 로딩 전략

- **Decision**: 두 라이브러리 모두 동적 `import()`로 지연 로딩하며, `viz` 코드펜스가 실제로 감지된 시점에만 로드한다.
- **Rationale**: 위젯은 임베드형이라 초기 로드 크기가 중요하고, 대부분의 대화에서는 시각화 요청이 없어(FR-001) 상시 번들에 포함할 이유가 없다.
- **Alternatives considered**: 정적 import(빌드 시 항상 포함) — 기각(불필요한 초기 번들 증가).
