# AGENTS.md — TeamplGPT (AnythingLLM fork) 가이드

상세 원칙은 `.specify/memory/constitution.md`(헌장) 참조 — 이 파일은 요약 + 라우팅 진입점.
CLAUDE.md와 동일 내용(멀티-agent tool 표준 준수). SPECKIT 컨텍스트 블록은 CLAUDE.md에만 존재.

## 작업 라우팅 (spec-kit × superpowers)

작업 시작 전 유형 판정:

1. **버그/회귀** → `superpowers:systematic-debugging` 먼저 → 수정 → 관련 E2E 재실행. 스펙 생략.
2. **HR skill description·파라미터 변경 (문구·매핑 조정에 한함)** → `docs/conventions/hr-skill-description-pattern.md` §6 절차 → 시나리오 append → E2E tier 전건 PASS. 스펙 생략 가능. 단 파라미터 계약 구조 변경·통합 대상 교체는 5번 스펙 경로.
3. **소규모 수정 (≤3파일)** → 직접 수정 → 실동작 검증. 스펙 생략.
4. **성능 개선** → 측정 → 수정 → 수치 확인.
5. **신규 기능 (다중 파일 / 신규 화면 / API·스키마 변경 / 신규 agent-skill)** →
   `superpowers:brainstorming` → `/speckit-specify` → **사용자 승인** → `/speckit-plan` → `/speckit-tasks` → **사용자 승인** → `/speckit-implement`
6. **대형/불명확 기능** → 5번 + `/speckit-clarify`(plan 전) + `/speckit-analyze`(implement 전).
7. **업스트림 동기화** → upstream-master 경유 머지 → fork 커스텀 회귀 확인. 스펙 생략.

스펙 생략 경로에서 범위가 3파일 초과, API 변경, 3-Mode 횡단으로 커지면 → 중단, 5번으로 전환.
**파일 수와 무관한 스펙 경로 트리거**: 외부 시스템 통합 추가·교체 / 파라미터 계약(entrypoint.params 등 인터페이스 스키마) 구조 변경 / 인증 방식 변경.

## 필수 규칙

- **라우팅 선언**: 작업 착수 첫 응답에 적용 트랙(위 1~7)과 판정 근거를 한 줄로 명시.
- **단계별 승인 게이트 (풀 게이트)**: 스펙 경로 산출물은 단계마다 사용자 승인 후 진행 — spec 승인 전 plan 금지, plan/tasks 승인 전 구현 금지. 설계 결정(제거·통합·보류)은 spec 결정표로 승인받는다.
- **E2E-First**: LLM 행태 변경은 코드 전에 시나리오 append → FAIL 확인 → 수정 → 전건 PASS. 빌드 통과 ≠ 완료.
- **handler.js 무수정 원칙**: HR skill LLM 제어는 `plugin.json` description으로.
- **Multi-Layer Defense**: L1 description 가드 + L2 코드 가드 + L3 E2E 시나리오. 한 층만으로 완료 보고 금지.
  L2 코드 가드에는 tool 결과 footer(조회 결과 소비 방식 제어, `_shared/formatTable.js` `ANSWER_GUIDE`) 포함 — 문구 정본은 `specs/012-hr-answer-quality/contracts/footer-contract.md`.
- **업스트림 발산 최소화**: upstream 파일은 최소 diff, 신규 기능은 신규 파일·skill로 격리.
- **최소 범위**: 요청된 변경만. 인접 개선은 제안만.
- **커밋**: Conventional Commits, `type(feature-slug): 한국어 요약`. 사용자가 요청할 때만 커밋.
- **i18n**: UI 문자열 ko/en 동시 반영. 문자열 유틸은 한글 경계 테스트 필수.

## HR Agent Skills — 필수 참조 Convention

HR agent-skill 7종(`hr-attendance`, `hr-salary`, `hr-personnel`, `hr-year-end-tax`,
`hr-approval`, `hr-certificate`, `hr-welfare`) 관련 피처를
**시작·수정·확장**할 때는 반드시 먼저 참조:

- **`docs/conventions/hr-skill-description-pattern.md`** — `plugin.json` description 작성 표준

| 작업 종류 | 참조 필요 섹션 |
|----------|---------------|
| 신규 HR skill 생성 | §3 T-B / §4 T-A Template + §7 3-Location 패턴 |
| 신규 주기 파라미터 추가 (`*_date`, `*_month`, `*_year`, `cal_*`, `from_*`, `to_*` 등) | §6.1 신규 파라미터 체크리스트 |
| 주기 파라미터 description 수정 | §6.2 회귀 검증 절차 |
| 신규 `query_type` 추가 + 자연어 매핑 | §7 Location A/B/C 3-Location 패턴 |
| 경계 키워드(2+ skill 동일 단어) 추가 | §5 적용 현황 매트릭스 + §5 경계 키워드 표 |

핵심: Period Parameter는 `[CRITICAL]` 3단 + `[재강조]` 필수 (Template T-A/T-B).
스펙 경로 진입 시 spec.md/plan.md에 Convention doc 경로와 T-A/T-B 적용 여부를 명시한다.

## 스펙·PDCA 문서 경로

| 단계 | 위치 |
|-------|------|
| Spec (Plan 대체) | `specs/NNN-기능명/spec.md` |
| Plan+Tasks (Design 대체) | `specs/NNN-기능명/plan.md`, `tasks.md` |
| Analysis | `docs/03-analysis/{feature}.analysis.md` |
| Report | `docs/04-report/features/{feature}.report.md` |
| Archive | `docs/archive/YYYY-MM/{feature}/` |
| Convention (영구) | `docs/conventions/{name}.md` (archive 대상 아님) |

## E2E Test Infrastructure

- **Runner**: `server/scripts/e2e-hr-skill/runner.js`
- **Scenarios**: `server/scripts/e2e-hr-skill/scenarios.json`
- **Mock HR API**: `server/scripts/e2e-hr-skill/mock-hr-api.js` (runner가 자동 기동, `:8000`)
- **Execution**: `npm run e2e:hr-skill` (리포 루트, AnythingLLM 서버 `:3001` 사전 기동: `yarn dev:all`)
- **격리 재실행**: `--only=ID1,ID2` 또는 `E2E_ONLY` env
- **Results**: `server/scripts/e2e-hr-skill/runs/{timestamp}/result.json`

## 3-Mode Chat Architecture (주의)

채팅 경로 수정 시 3개 모드 모두 확인 (embed 관련 시 embed 경로까지 4면):

- **chat/query** 모드 · **react** 모드 · **@agent** 모드

경로 실물: chat/query=`server/utils/chats/index.js`·`stream.js`, react=`server/utils/chats/react/`,
@agent=`server/utils/agents/aibitat/`, embed=`server/utils/chats/embed.js`.
(`docs/rag-search-flow-chat-vs-react.md`는 유실 — `docs/`가 gitignore라 미커밋 상태로 소실)

