# TeamplGPT (anything-llm fork) Constitution

이 헌법은 이 저장소의 개발을 통제한다. `AGENTS.md`, `package.json` 스크립트,
`docs/conventions/`의 기존 컨벤션에서 도출했으며, Spec Kit으로 생산되는 모든
spec-driven 작업에 적용된다.

## Core Principles

### I. Yarn 워크스페이스별 의존성 관리
Yarn이 유일한 패키지 매니저다(`server/`·`frontend/`·`collector/` 각각 독립
`yarn` 프로젝트, Node `>=18`). 의존성 추가·변경은 해당 워크스페이스의
`yarn.lock`을 같은 변경에서 갱신한다. 루트 `package-lock.json`(오케스트레이션
스크립트용)이 존재하지만, 워크스페이스 내부에서 `npm install`로 경쟁 lockfile을
만들지 않는다. 개발 기동은 `yarn dev:server` / `yarn dev:collector` /
`yarn dev:frontend`(또는 `yarn dev:all`)를 사용한다.

### II. 품질 게이트 (NON-NEGOTIABLE)
모든 변경은 커밋·PR 전에 루트 `yarn lint`(server → frontend → collector 3개
워크스페이스 순차 lint)를 통과해야 한다. 번역 파일을 건드리면
`yarn verify:translations`도 통과해야 한다. 게이트를 통과하지 못한 변경은
완료가 아니다.

### III. 테스트 동반 + HR Skill E2E 회귀 (NON-NEGOTIABLE)
동작 변경은 테스트와 함께 배포한다(Jest: 루트 `yarn test`). HR agent-skill
(`hr-attendance`, `hr-salary`, `hr-personnel`, `hr-year-end-tax`)을 건드리는
변경은 E2E 회귀 `npm run e2e:hr-skill`(scenarios.json `E1~E15`) **전건 PASS**가
완료 조건이다(사전 조건: `yarn dev:all`로 서버 `:3001` 기동). 버그 픽스는
회귀 테스트를 추가하고, 테스트를 약화·스킵해서 통과시키지 않는다.

### IV. HR Skill Convention 필수 준수 (NON-NEGOTIABLE)
HR agent-skill 관련 피처의 시작·수정·확장은
`docs/conventions/hr-skill-description-pattern.md`를 **먼저 읽고** 진행한다.

- **handler.js 무수정 원칙** — 모든 LLM 행태 제어는 `plugin.json` description으로.
- **Period Parameter는 `[CRITICAL]` 3단 + `[재강조]` 필수** — Template
  T-A(연·월 가변형) 또는 T-B(연도 단일형) 중 하나 적용.
- 신규 `query_type` 추가 시 3-Location 패턴(Location A/B/C, Convention §7) 적용.
- spec/plan 산출물은 Convention doc 경로를 Related Documents에 명시하고,
  T-A/T-B 적용 여부를 확정해 기록한다.

위반은 `/speckit-analyze`에서 CRITICAL로 처리한다.

### V. 3-Mode Chat 아키텍처 검증
채팅 흐름(chat/query · react · @agent 모드)에 닿는 변경은 **3개 모드 모두**에서
동작을 확인한다. 상세는 `docs/rag-search-flow-chat-vs-react.md` 참조. 하나의
모드만 검증하고 완료를 선언하지 않는다.

### VI. 집중 브랜치 + Conventional Commits
작업당 전용 브랜치를 쓰고 `main`에 직접 커밋하지 않는다. PR은 집중적·최소
범위 — 무관한 리팩터·설정 변경을 섞지 않는다. 커밋 메시지는 Conventional
Commits(`feat(scope):`, `fix(scope):` …)를 따르며 본문은 한국어 허용.
`.env*` 등 비밀값·개인 로컬 파일은 커밋하지 않는다.

## Technology & Scope Constraints

- 스택: Node.js(Express) `server/` + React(Vite) `frontend/` +
  문서 처리 `collector/` + Prisma(`server/prisma/`, SQLite 기본, Oracle 등
  외부 DB 지원). 스키마 변경은 `yarn prisma:generate` / `yarn prisma:migrate`를
  동반한다.
- 이 저장소는 `anything-llm`의 포크(TeamplGPT)다. 변경은 origin에만 반영하며
  upstream 제출을 전제로 하지 않는다.
- 문서: 기능 문서는 `docs/`에, 영구 컨벤션은 `docs/conventions/`에 둔다
  (archive 대상 아님). 레거시 PDCA 문서 경로는 `AGENTS.md` 참조 — 신규 피처의
  명세·계획 정본은 `specs/<NNN-feature>/`다.

## Development Workflow

기능 작업은 Spec Kit의 Spec-Driven 흐름을 따른다:
`constitution → specify → (clarify) → plan → tasks → (analyze) → implement`.
명세·계획은 `specs/<NNN-feature>/`에 커밋되어 source of truth가 된다.
구현 규율은 superpowers 플러그인이 런타임에 집행한다: 실패 테스트 우선
(test-driven-development), 증거 후 완료 선언(verification-before-completion),
근본 원인 우선 디버깅(systematic-debugging). superpowers는 원칙 II·III을
운영화하고, spec-kit이 명세/계획 산출물을 소유한다. 역할 분담은
`SPEC_KIT_GUIDE.md` 참조.

## Governance

이 헌법은 임기응변식 관행에 우선한다. 개정은 근거를 설명하는 전용 PR로 이
파일을 수정하며, 아래 버전을 semantic versioning으로 올린다(MAJOR: 원칙
삭제·재정의, MINOR: 원칙·섹션 추가, PATCH: 명확화). PR·리뷰는 이 원칙들의
준수를 검증하고, 복잡도 추가는 정당화되어야 한다. 에이전트는 런타임 지침으로
`CLAUDE.md`(Claude Code)와 `AGENTS.md`(Codex 등)를 읽는다.

**Version**: 1.0.0 | **Ratified**: 2026-07-13 | **Last Amended**: 2026-07-13
