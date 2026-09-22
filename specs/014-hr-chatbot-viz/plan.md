# Implementation Plan: HR 챗봇 시각화(조직도·근무현황·급여추세)

**Branch**: `feature/skill-modify-hrchat-merge` (teamplgpt + okrservice 양쪽 동일 브랜치명) | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-hr-chatbot-viz/spec.md`

## Summary

임직원이 okrservice HR 챗봇 위젯에서 근무현황/급여추세/소속 팀 조직도를 "그래프로/차트로/도표로" 명시적으로 요청하면, 텍스트 표 대신(또는 함께) 실제 그래프(막대·선 그래프, 1단계 트리 다이어그램)를 볼 수 있게 한다.

기술 접근: teamplgpt는 기존 hr-attendance(work_status)/hr-salary(salary_statement)/hr-personnel(org_members) tool 호출 결과를 **새로 조회하지 않고 그대로** 재사용해, 명시적 시각화 요청 시에만 고정 스키마의 ` ```viz ` JSON 코드블록 1개를 추가로 출력하도록 공통 가드(`hrSkillGuard.js`)에 규칙을 추가한다. okrservice는 기존 마크다운 렌더러(`ChatbotView.tsx`)의 코드펜스 처리부에 `viz` 언어 태그 분기를 추가해, JSON을 파싱하고 타입별로 React 컴포넌트용 데이터로 변환·렌더링한다(근무현황·급여추세는 recharts 막대/선 그래프, 조직도는 커스텀 React 트리 컴포넌트 — 2026-09-22 개정, research.md R5). 신규 백엔드 조회 로직은 추가하지 않는다.

## Technical Context

**Language/Version**: Node.js (teamplgpt server, CommonJS) / TypeScript + React 18 (okrservice widgets, webpack)

**Primary Dependencies**: teamplgpt — 기존 `_shared/hrSession.js`, `hrSkillGuard.js`(신규 의존성 없음). okrservice — `recharts`(근무현황 막대·급여추세 선 그래프, 동적 import). 조직도는 외부 라이브러리 없이 순수 React 트리 컴포넌트(`charts/OrgChartTree.tsx`)로 구현하며 별도 청크로 동적 import한다. (2026-09-22 개정: 최초 채택했던 `mermaid`/`chart.js`는 제거 — research.md R5)

**Storage**: N/A (신규 저장소 없음, 기존 kiwibox 조회 결과를 그 자리에서 소비)

**Testing**: teamplgpt — `server/scripts/e2e-hr-skill`(러너 기반 시나리오) + embed E2E(`e2e-embed-hr-skill`). okrservice — `jest` + `@testing-library/react`(이미 devDependencies에 존재, 신규 설정 불필요).

**Target Platform**: okrservice 임베드형 메신저 위젯(웹, 모바일 폭 포함) — teamplgpt는 서버(HTTP API, 변경 없음).

**Project Type**: 2-repo 통합 기능 — teamplgpt(server, LLM 가드) + okrservice(frontend, widgets/client 렌더러). 순수 웹서비스도 라이브러리도 아닌 "LLM 출력 계약 + 소비자 렌더러" 구조.

**Performance Goals**: 시각화 여부 판단·렌더링이 기존 텍스트/표 응답 대비 체감 지연을 유발하지 않아야 함(정성적 — 정량 SLA 없음, 기존 chat 응답 속도에 편승).

**Constraints**: (1) teamplgpt 신규 백엔드 조회 로직 금지(FR-007) — 기존 tool 결과만 재사용. (2) `handler.js` 무수정 원칙(헌장 §IV) — 시각화 트리거는 프롬프트 가드(L1)로만 구현. (3) okrservice 번들 크기 증가 최소화 — recharts는 동적 import(`React.lazy`), 조직도 트리 컴포넌트는 recharts와 별도 청크로 분리해 조직도만 요청해도 recharts가 함께 로드되지 않게 한다.

**Scale/Scope**: 시각화 타입 3종(orgchart/workstatus/salarytrend) 고정. 조직도는 "사용자 소속 팀 1단계"로 범위 한정(FR-004).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| §I 최소 범위 + 업스트림 발산 최소화 | PASS | teamplgpt 변경은 fork 커스텀 파일(`hrSkillGuard.js`, 업스트림에 없는 파일)에 한정. okrservice 변경은 신규 파일(`vizRenderers.tsx` + `charts/` 3개, 2026-09-22 개정) + 기존 `ChatbotView.tsx`의 코드펜스 분기 1곳 추가(최소 diff). |
| §II 스펙은 규모에 비례 | PASS | server(teamplgpt) + frontend(okrservice) + 2개 저장소 횡단이라 스펙 경로 필수 트리거 해당 — 이미 spec-kit 경로 진행 중. |
| §III E2E-First (NON-NEGOTIABLE) | PASS (계획 단계) | Phase 2(tasks)에서 `e2e-hr-skill`/`e2e-embed-hr-skill`에 시각화 요청 시나리오를 **코드 변경 전** append → FAIL 확인 → 구현 → 전건 PASS 순서로 명시. |
| §IV Description-Driven + Multi-Layer Defense | PASS (구조 조정) | 신규 `query_type`이 없으므로 `plugin.json` description 변경 불필요, `handler.js` 무수정. L1 = `hrSkillGuard.js`의 `[HR_VIZ_OUTPUT]` 프롬프트 가드. L2는 통상 teamplgpt 서버 코드 가드지만, 본 기능은 조회 로직 추가가 없어 서버 측 신규 코드 가드 지점이 없다 — 대신 **okrservice 렌더러의 파싱 검증(타입/필드 불일치 시 원본 표시로 폴백)**을 L2로 채택(Complexity Tracking에 근거 기록). L3 = E2E 시나리오. |
| §V 3-Mode 일관성 | PASS (Phase 0 확인 완료) | `chats/react/index.js`가 `chatPrompt()`(chat/query와 동일 함수)를 그대로 재사용해 `hrSkillCommonLines()`를 간접 상속함을 확인(research.md R1). react 모드 전용 추가 코드 불필요. |
| §VI Conventional Commits | PASS | 사용자 요청 시에만 커밋(이미 준수 중). |
| §VII i18n | PASS (Phase 0 확인 완료) | `chatbot/` 디렉토리에 i18n 레이어 자체가 없고 기존 오류 문구도 하드코딩 한국어임을 확인(research.md R2) — 신규 폴백 문구도 동일 관행을 따르면 되므로 신규 작업 없음. |

## Project Structure

### Documentation (this feature)

```text
specs/014-hr-chatbot-viz/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output — viz JSON 스키마 3종
└── tasks.md              # Phase 2 output (/speckit-tasks, 본 명령 이후)
```

### Source Code (repository root) — 2-repo 통합 (Option 2 변형)

```text
# teamplgpt (server) — 기존 파일 수정만, 신규 조회 로직 없음
server/utils/
├── hrSkillGuard.js              # hrSkillCommonLines()에 [HR_VIZ_OUTPUT] 규칙 추가 (수정)
└── chats/
    ├── index.js                  # 변경 없음(hrSkillChatGuard 그대로 hrSkillCommonLines 사용)
    ├── embed.js                  # 변경 없음(동일 경유)
    └── react/                    # 가드 상속 여부 확인 대상

server/utils/agents/aibitat/providers/
└── ai-provider.js                # 변경 없음(hrSkillPeriodGuard 그대로 hrSkillCommonLines 사용)

server/scripts/
├── e2e-hr-skill/scenarios.json           # 시각화 요청 시나리오 추가
└── e2e-embed-hr-skill/ (해당 시나리오 파일)  # 시각화 요청 시나리오 추가

# okrservice (widgets/client) — 신규 파일 1개 + 기존 파일 분기 추가
widgets/client/messenger/components/chatbot/
├── ChatbotView.tsx                # flushCodeBlock()에 viz 언어 태그 분기 추가 (수정)
└── vizRenderers.tsx               # 신규 — renderOrgChart/renderWorkStatusChart/renderSalaryTrendChart + 디스패처 + VizBlockRenderer(에러 바운더리)

widgets/client/messenger/components/chatbot/charts/    # 신규 디렉토리 (2026-09-22 개정, research.md R5)
├── WorkStatusBarChart.tsx         # recharts 막대 그래프
├── SalaryTrendLineChart.tsx       # recharts 선 그래프(다중 시리즈)
└── OrgChartTree.tsx               # 순수 React 트리 컴포넌트(조직도, mermaid 대체)

widgets/client/messenger/components/chatbot/__tests__/
├── vizRenderers.test.ts           # 신규 — renderXxx 3개 함수 유닛 테스트
└── VizBlockRenderer.test.tsx      # 신규 (2026-09-22 개정) — 3개 타입 렌더 결과·empty/invalid 분기 테스트
```

**Structure Decision**: 신규 서비스/화면이 아니라 기존 두 컴포넌트(teamplgpt 프롬프트 가드, okrservice 마크다운 렌더러)에 대한 국소 확장이므로, 표준 "Option 2 웹앱" 구조 대신 "수정 대상 기존 파일 + 신규 파일 최소 추가" 형태로 기술했다. 최초에는 신규 디렉토리 없이 `vizRenderers.ts` 1개 파일만 신규였으나, 2026-09-22 개정(recharts 교체)으로 렌더 컴포넌트가 `charts/` 디렉토리로 분리됐다(research.md R5) — 파일당 200-400줄 관행과 chart 타입별 응집도를 위함.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| §IV L2 코드 가드가 teamplgpt 서버가 아닌 okrservice 클라이언트에 위치 | 시각화 기능이 신규 조회 로직을 추가하지 않아(FR-007), teamplgpt 서버 측에 검증할 새 데이터 경로 자체가 없음. 유일한 신규 "출력 형식"은 LLM이 생성하는 ```viz 블록이며, 이를 실제로 소비·검증하는 지점은 렌더러뿐임 | teamplgpt에 별도 서버 사이드 JSON 스키마 검증 레이어(예: 응답 후처리 미들웨어)를 추가하는 방안도 검토했으나, `handler.js` 무수정 원칙과 "신규 백엔드 로직 없음" 제약(FR-007)에 반하고, 어차피 최종 렌더링 시점에 한 번 더 검증이 필요해 이중 검증이 되어 기각 |
