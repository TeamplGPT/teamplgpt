# Implementation Plan: HR 조회 답변 품질 제어 (echo·fan-out 억제)

**Branch**: `main` (별도 브랜치 미생성 — 사용자 지시 시 분기) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-hr-answer-quality/spec.md`

## Summary

HR 조회 skill의 tool 결과 표를 LLM이 통째로 재출력(echo)하고, 질문 하나에 query_type을
과잉 호출(fan-out)하는 문제를 3겹 방어로 봉합한다:

- **L2 (핵심)**: `_shared/formatTable.js` 렌더 함수(`renderWhitelisted`·`renderTable`) 반환값
  말미에 **질문 유형 적응 응답 지침 footer** 주입 — 고정 분량 숫자 없이
  "특정 값 질문 = 값+맥락 / 내역·현황 질문 = 관련 행·열 / 전체·상세 명시 = 전체 표" 3분기 규칙.
  HR skill 7종 자동 적용, 각 skill handler.js 무수정.
- **L1**: `hr-attendance/plugin.json` description에 fan-out 억제 가드
  ("한 질문에는 가장 적합한 query_type 하나만, 동일 정보 중복·병렬 조회 금지") + 응답 원칙 한 줄.
- **L3**: E2E runner에 옵셔널 assertion 3종(`answer_pattern[]`, `answer_not_pattern[]`,
  `max_hr_calls`) 추가, 시나리오 append → FAIL 확인 → 구현 → tier 전건 PASS.

## Technical Context

**Language/Version**: Node.js 18+ (CommonJS) — AnythingLLM server 사이드, 빌드 불필요

**Primary Dependencies**: 없음(신규 패키지 0) — 기존 `_shared/formatTable.js`, `plugin.json`, `e2e-hr-skill/runner.js` 연장

**Storage**: N/A (데이터 저장 없음 — 문자열 렌더링·검증 로직만)

**Testing**: E2E `npm run e2e:hr-skill` (mock HR API `:8000` 자동 기동, AnythingLLM 서버 `:3001` 사전 기동 필요). `_shared/formatTable.js` 단위 테스트는 현재 부재 — footer 상수·부착 여부만 검증하는 최소 unit test는 선택 사항, 판정은 E2E가 정본

**Target Platform**: Linux server (WSL2 개발 환경 동일)

**Project Type**: AnythingLLM fork의 agent-skill 계층 + E2E 인프라 (web-service 내 격리 모듈)

**Performance Goals**: 해당 없음 — footer 수백 자 증가는 표 echo 제거로 상쇄 (spec Assumptions)

**Constraints**: 각 skill `handler.js` 무수정(헌장 IV) / 신규 E2E 필드 전부 옵셔널(FR-005) / 0건·오류 경로 문구 불변(FR-007) / footer 원문 사용자 노출 금지(FR-006)

**Scale/Scope**: 코드 3파일(formatTable.js, hr-attendance/plugin.json, runner.js) + scenarios.json + CLAUDE.md 1줄 + 문서

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 최소 범위 + fork-safe | PASS | 수정 파일 전부 fork 커스텀 영역(_shared, HR plugin.json, e2e 스크립트, CLAUDE.md). 업스트림 파일 0건 — aibitat 전역 주입안은 spec Out of Scope로 기각 |
| II. 스펙 비례 | PASS | LLM 행태 변경 + 7종 횡단 → 스펙 경로 진행 중 (spec 승인 완료) |
| III. E2E-First | PASS(계획) | tasks에서 시나리오 append·FAIL 확인이 구현 태스크보다 선행하도록 강제. runner assertion 확장은 시나리오 실행의 전제라 예외적으로 최선행 |
| IV. Description-Driven + Multi-Layer | PASS | L1 description 가드 + L2 코드 가드(footer = "출력 검증·enrichment" 범주, spec D6) + L3 E2E. handler.js 무수정. CLAUDE.md에 D6 해석 한 줄 명문화 포함 |
| V. 3-Mode 일관성 | PASS(확인 필요 항목 기록) | footer는 tool 결과 문자열에 부착 — @agent·chat/query(toolCallingLoop)·embed 모든 경로에서 동일하게 LLM 입력으로 소비됨. E2E는 기존 runner 방식(stream-chat) 유지, 모드별 회귀는 research.md R4 |
| VI. Conventional Commits | PASS | 커밋은 사용자 요청 시만, `type(hr-answer-quality): 한국어 요약` |

**Convention doc**: `docs/conventions/hr-skill-description-pattern.md` 리포 부재 (spec Assumptions 기록).
T-A/T-B 템플릿 **해당 없음** — 주기 파라미터 신설·수정 없음. description 수정은 매핑표 보강이
아닌 행동 가드 추가로, §6 회귀 절차는 E2E tier 전건 PASS로 대체.

## Project Structure

### Documentation (this feature)

```text
specs/012-hr-answer-quality/
├── spec.md              # 승인 완료
├── plan.md              # 이 파일
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── footer-contract.md        # 응답 지침 footer 문구·부착 규약
│   └── e2e-assertion-schema.md   # scenarios.json 신규 필드 스키마
└── tasks.md             # /speckit-tasks 산출 (이 명령에서 생성 안 함)
```

### Source Code (repository root)

```text
server/storage/plugins/agent-skills/
├── _shared/
│   └── formatTable.js            # [수정] ANSWER_GUIDE 상수 + renderWhitelisted/renderTable 말미 부착
└── hr-attendance/
    └── plugin.json               # [수정] description fan-out 가드 + 응답 원칙 한 줄

server/scripts/e2e-hr-skill/
├── runner.js                     # [수정] answer_pattern/answer_not_pattern/max_hr_calls 검증
└── scenarios.json                # [수정] 신규 시나리오 append (US1·US2·US3 + 노출 금지)

CLAUDE.md                         # [수정] 헌장 IV 예외(D6) 한 줄 명문화
```

**Structure Decision**: 전부 기존 파일의 최소 diff. 신규 파일은 spec 문서군뿐.
handler.js 7종·aibitat·upstream 파일 무수정.

## Complexity Tracking

위반 없음 — 해당 없음.
