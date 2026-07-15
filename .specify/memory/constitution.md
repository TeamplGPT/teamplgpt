# TeamplGPT Constitution

AnythingLLM fork(TeamplGPT) 개발 헌장.
spec-kit(무엇을/왜) + superpowers(어떻게) + PDCA(기록/회고)를 결합한 워크플로우의 최상위 규칙이다.
CLAUDE.md / AGENTS.md는 이 헌장의 요약 + 라우팅 진입점이다.

## Core Principles

### I. 최소 범위 + 업스트림 발산 최소화 (Minimal-Scope, Fork-Safe Change)

요청된 변경만 수행한다. 인접한 "개선"(리네이밍, 스타일 통일)은 적용하지 않고 제안만 한다.
이 저장소는 업스트림(Mintplex-Labs/anything-llm)을 주기적으로 머지하는 fork다:

- 업스트림 파일 수정은 최소 diff로. 가능하면 신규 파일·agent-skill·plugin으로 기능을 격리한다.
- 업스트림 동기화는 `upstream-master` 브랜치 경유 → `main` 머지. 머지 후 fork 커스텀
  (브랜딩, HR agent skills, embed tool calling, Oracle 지원, hybrid search 정책) 회귀 확인 필수.

### II. 스펙은 규모에 비례 (Spec-Proportional Rigor)

버그 수정·3파일 이하 소규모 변경은 스펙 없이 진행한다.
다중 파일 / 신규 화면 / API·스키마 변경 / server·frontend·embed 횡단 기능은
spec-kit 경로(specify → plan → tasks → implement)를 통과해야 한다.
스펙 생략 경로에서 범위가 3파일 초과, API 변경, 3-Mode 횡단으로 커지면 중단하고 스펙 경로로 전환한다.

### III. 시나리오 우선 검증 — E2E-First (NON-NEGOTIABLE)

이 프로젝트의 TDD는 E2E 시나리오다. 타입체크·빌드 통과는 검증이 아니다.

- LLM 행태를 바꾸는 변경(HR skill description, tool calling, 프롬프트)은
  **코드 수정 전에** `server/scripts/e2e-hr-skill/scenarios.json`(또는 해당 러너)에
  시나리오를 append하고 FAIL을 확인한 뒤 수정한다. (기존 E6/E7 → 11/11 PASS 방식)
- 완료 보고 전 관련 E2E 전건 PASS + 변경 화면·플로우 실동작 확인.
  (superpowers verification-before-completion 준수)
- 회귀 재현·격리는 `--only=ID1,ID2` / `E2E_ONLY` 사용.

### IV. Description-Driven LLM Control + Multi-Layer Defense

- **handler.js 무수정 원칙**: HR agent skill의 LLM 행태 제어는 `plugin.json` description으로 한다.
  Period parameter는 `[CRITICAL]` 3단 + `[재강조]`, Template T-A/T-B, 3-Location 패턴 준수
  (`docs/conventions/hr-skill-description-pattern.md`).
- 행태 보증이 필요한 기능은 **Multi-Layer Defense**로 봉합한다:
  L1 프롬프트/description 가드 → L2 코드 가드(enrichment·출력 검증) → L3 E2E 회귀 시나리오.
  한 층만으로 "고쳤다"고 보고하지 않는다.

### V. 3-Mode 일관성 (3-Mode Chat Architecture)

채팅 경로 수정 시 **chat/query · react · @agent** 3개 모드 영향을 모두 확인한다.
(`docs/rag-search-flow-chat-vs-react.md` 참조) embed 위젯이 관련되면 embed 경로까지 4면 확인.

### VI. Conventional Commits — 한국어 본문

`type(feature-slug): 한국어 요약` 형식. PDCA 단계 태그(`[Do]`, `[Act-1]`) 허용.
사용자가 요청할 때만 커밋·푸시한다. 시크릿 하드코딩 금지.

### VII. i18n · non-Latin 안전성

UI 문자열은 ko/en locale 동시 반영. 문자열 가공 유틸(sentenceCase 등)은
한글 입력 경계 케이스를 반드시 테스트한다. (non-Latin drop 회귀 이력 있음)

## Development Workflow

작업 유형별 라우팅 — 아래가 spec-kit × superpowers 결합 원칙이다:

| 작업 유형 | 워크플로우 |
|---|---|
| 버그/회귀 (`fix`) | superpowers:systematic-debugging → 수정 → 관련 E2E 재실행(전건 PASS) → 실동작 검증. 스펙 생략 |
| HR skill description·파라미터 변경 | Convention doc §6 절차 필수 → 시나리오 append → E2E tier 전건 PASS. 스펙 생략 가능 |
| 소규모 수정 (≤3파일, `style`/`chore`/단순 `feat`) | 직접 수정 → 실동작 검증. 스펙 생략 |
| 성능 개선 (`perf`) | 측정 먼저(재현·계측) → 수정 → 개선 수치 확인 |
| 신규 기능 (다중 파일 / 신규 화면 / API·스키마 변경 / 신규 agent-skill) | superpowers:brainstorming → /speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement |
| 대형/불명확 기능 ("전면 개선"급) | 위 + /speckit-clarify(plan 전) + /speckit-analyze(implement 전) 필수 |
| 업스트림 동기화 | 스펙 생략. upstream-master 경유 머지 → fork 커스텀 회귀 확인 → 보고 |

결합 원칙:

1. **spec-kit은 "무엇을/왜", superpowers는 "어떻게", PDCA는 "기록/회고"**:
   specify/plan/tasks가 산출물 구조를 만들고, implement 단계 내부에서 superpowers 스킬
   (시나리오 우선 E2E-First, systematic-debugging, verification-before-completion)이 실행 품질을 담당하며,
   완료 후 PDCA Report/Convention이 지식을 축적한다.
2. **brainstorming이 specify의 입력**: 요구가 불명확하면 specify 전에 brainstorming으로
   의도를 좁힌다. 명확하면 바로 specify.
3. **스펙 산출물은 `specs/NNN-기능명/`** 아래 기능 브랜치 단위로 관리하고 코드와 함께 커밋한다.
   spec.md가 기존 PDCA의 Plan(01-plan), plan.md+tasks.md가 Design(02-design)을 대체한다.
4. **plan 단계 필수 체크**: 3-Mode 영향(§V), 업스트림 발산(§I), Convention doc 적용 여부,
   E2E 시나리오 목록을 plan.md에 명시한다.
5. **에스컬레이션**: 스펙 생략 경로에서 §II 임계 초과 시 중단하고 스펙 경로로 전환.

## PDCA 문서 매핑

| 단계 | 산출물 | 위치 |
|---|---|---|
| Plan (무엇/왜) | spec.md | `specs/NNN-기능명/` |
| Design (구조/방법) | plan.md, tasks.md | `specs/NNN-기능명/` |
| Do | 구현 + E2E 시나리오 | 코드, `scenarios.json` |
| Check | 분석 (필요 시) | `docs/03-analysis/{feature}.analysis.md` |
| Act / Report | 완료 보고 | `docs/04-report/features/{feature}.report.md` |
| Archive | 월별 이관 | `docs/archive/YYYY-MM/{feature}/` |
| Convention (영구) | 패턴 승격 | `docs/conventions/{name}.md` (archive 대상 아님) |

Convention 승격 조건: 동일 패턴이 3회 이상 반복 검증되고 적용 매트릭스가 채워졌을 때
(기존 `hr-skill-description-pattern.md` §5 방식 준용).

## Governance

- 이 헌장은 다른 관행·문서보다 우선한다. CLAUDE.md/AGENTS.md는 요약이며 충돌 시 헌장이 이긴다.
- 개정은 PR로 하며 버전·개정일을 갱신하고 사유를 커밋 본문에 남긴다.
- 모든 스펙 경로 PR은 §III(E2E 전건 PASS)·§IV(Multi-Layer Defense) 준수를 리뷰에서 확인한다.

**Version**: 1.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-15
