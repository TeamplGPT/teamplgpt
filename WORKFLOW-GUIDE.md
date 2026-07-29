# WORKFLOW-GUIDE — spec-kit × superpowers 결합 워크플로우 사용 가이드

- 작성: 2026-07-29 · 정본: [`.specify/memory/constitution.md`](.specify/memory/constitution.md) v1.2.0 헌장. 충돌하면 헌장이 이긴다.
- 독자: 이 리포에서 AI Agent(Claude Code)와 함께 개발하는 팀원
- [`CLAUDE.md`](CLAUDE.md)가 이 워크플로우의 요약이자 라우팅 진입점이고 이 문서는 사용법 해설이다.

---

## 1. 세 도구의 분업

| 도구 | 담당 | 산출물 |
|---|---|---|
| **spec-kit** | 무엇을 왜 만드는가. 요구 명세·설계·작업 분해·승인 게이트 | `specs/NNN-기능명/spec.md·plan.md·tasks.md` |
| **superpowers** | 어떻게 만드는가. 실행 품질 규율(디버깅·TDD·검증·리뷰) | 코드 + E2E 시나리오 + 검증 증빙 |
| **PDCA** | 기록하고 회고한다. 분석·보고·패턴 승격 | `docs/03-analysis/` · `docs/04-report/` · `docs/conventions/` |

관문은 spec-kit으로 세운다. 관문 사이에서 어떻게 일할지는 superpowers가 규율로 강제하고 다 끝난 뒤에는 PDCA로 지식을 남긴다.

```
[요구 발생]
   │  불명확? ──▶ superpowers:brainstorming (의도 좁히기)
   ▼
/speckit-specify ──▶ spec.md ──▶ ★사용자 승인★
   │  (대형/불명확이면 /speckit-clarify 선행)
   ▼
/speckit-plan + /speckit-tasks ──▶ plan.md·tasks.md ──▶ ★사용자 승인★
   │  (대형이면 /speckit-analyze로 교차 정합성 검사)
   ▼
/speckit-implement  ← 내부에서 superpowers 규율 실행:
   ├─ E2E-First (시나리오 append → FAIL 확인 → 구현 → 전건 PASS)
   ├─ systematic-debugging (막히면 근본 원인 4단계)
   └─ verification-before-completion (완료 선언 전 실검증)
   ▼
[PDCA] analysis / report / convention 승격 → docs/
```

---

## 2. 라우팅 판정 (선언 의무)

모든 작업 착수 첫 응답에 트랙 번호와 판정 근거를 한 줄로 선언한다. 판정 자체를 산출물로 만들어 놓아야 오분류가 드러난다.

| 트랙 | 조건 | 워크플로우 | 스펙 |
|---|---|---|---|
| 1 | 버그/회귀 | `superpowers:systematic-debugging` → 수정 → 관련 E2E 전건 PASS | 생략 |
| 2 | HR skill description·파라미터 문구·매핑 조정 | convention doc §6 절차 → 시나리오 append → tier 전건 PASS | 생략 가능 |
| 3 | 소규모 (≤3파일) | 직접 수정 → 실동작 검증 | 생략 |
| 4 | 성능 개선 | 측정 → 수정 → 수치 확인 | 생략 |
| 5 | 신규 기능 (다중 파일/신규 화면/API·스키마 변경/신규 agent-skill) | brainstorming → specify → 승인 → plan → tasks → 승인 → implement | **풀 게이트** |
| 6 | 대형/불명확 (전면 개선급) | 트랙 5 + `/speckit-clarify`(plan 전) + `/speckit-analyze`(implement 전) | 풀 게이트 |
| 7 | 업스트림 동기화 | `upstream-master` 경유 머지 → fork 커스텀 회귀 확인 | 생략 |

계약이 바뀌면 손대는 파일이 적어도 큰 작업이다. 아래 항목은 파일 수와 무관하게 트랙 5로 간다.

- 외부 시스템 통합 추가·교체, 즉 호출 백엔드나 프로토콜이 바뀌는 경우
- 파라미터 계약 구조 변경. `entrypoint.params` 같은 인터페이스 스키마에 항목을 더하거나 빼거나 의미를 바꾸는 경우
- 인증 방식 변경

**에스컬레이션**: 스펙 생략 트랙으로 시작했는데 3파일을 넘거나, API가 바뀌거나, 3-Mode를 횡단하거나, 위 트리거에 걸리면 그 자리에서 중단하고 트랙 5로 전환한다. 하던 작업을 밀어붙이지 않는다.

---

## 3. 트랙 5/6의 spec-kit 풀 게이트

### 3.1 단계와 명령

| 단계 | 명령 (Claude Code slash) | 산출물 | 다음 단계 조건 |
|---|---|---|---|
| (선택) 브레인스토밍 | `superpowers:brainstorming` 스킬 | 좁혀진 의도 | 요구가 불명확할 때만. 명확하면 바로 specify |
| 명세 | `/speckit-specify` | `specs/NNN-기능명/spec.md` | **사용자 승인**. 승인 전에는 plan 금지 |
| (트랙 6) 명확화 | `/speckit-clarify` | spec.md 보강 | plan 전 |
| 설계+분해 | `/speckit-plan` → `/speckit-tasks` | `plan.md` · `tasks.md` | **사용자 승인**. 승인 전에는 구현 금지 |
| (트랙 6) 정합성 | `/speckit-analyze` | 교차 검사 리포트 | implement 전 |
| 구현 | `/speckit-implement` | 코드 + E2E | §4의 superpowers 규율 준수 |

### 3.2 풀 게이트 규칙 (NON-NEGOTIABLE)

- 각 단계 산출물은 사용자 승인을 받은 뒤에만 다음 단계로 넘어간다. 승인 없이 구현에 들어가면 안 된다.
- 항목을 제거하거나 통합하거나 보류하는 설계 결정은 spec.md에 결정표로 명시해 승인 대상임을 드러낸다. `specs/011-hr-endpoint-catalog-realign/spec.md`의 D1~D9 결정표가 그 선례다.
- 소급 스펙, 그러니까 구현을 끝낸 뒤에 쓰는 문서는 사고를 보정하는 수단일 뿐이라 관문을 대신하지 못한다.

### 3.3 spec.md와 plan.md의 필수 항목

plan 단계에서는 아래를 반드시 확인한다.

- 3-Mode(+embed 4면) 영향
- 업스트림 발산(수정 파일이 upstream 파일인지)
- Convention doc 적용 여부(T-A/T-B 등)
- E2E 시나리오 목록

HR skill 관련이면 `docs/conventions/hr-skill-description-pattern.md` 경로와 적용 템플릿을 spec.md와 plan.md에 명시한다.

### 3.4 산출물 위치

```
specs/NNN-기능명/
  spec.md          # Plan (무엇/왜) — PDCA 01-plan 대체
  plan.md          # Design — PDCA 02-design 대체
  tasks.md         # 작업 분해 (의존 순서)
  contracts/       # 계약 문서 (BODY·footer 문구 등 — 코드가 참조하는 정본)
  research.md      # (필요 시) 조사 기록
```

기능 브랜치 단위로 관리하고 코드와 함께 커밋한다. 실례로는 결정표와 contracts를 갖춘 `specs/011-hr-endpoint-catalog-realign/`, footer-contract를 둔 `specs/012-hr-answer-quality/`, 그리고 `specs/013-embed-e2e-kiwibox-realign/`가 있다.

---

## 4. superpowers 규율과 발동 시점

| 스킬 | 발동 시점 | 이 프로젝트에서 갖는 의미 |
|---|---|---|
| `superpowers:brainstorming` | 모든 창작 작업 전, 그러니까 기능을 만들거나 동작을 바꿀 때 | specify의 입력을 만든다. 트랙 5 진입 전 필수 검토 |
| `superpowers:systematic-debugging` | 모든 버그·테스트 실패·예상 밖 동작에서 수정을 제안하기 전 | 4단계로 간다. 근본 원인 조사 → 패턴 분석 → 가설·최소 검증 → 구현. 원인을 규명하기 전에는 고치지 않는다. 3회 실패하면 아키텍처를 의심한다 |
| `superpowers:test-driven-development` | 구현 전 | 이 프로젝트의 TDD는 E2E-First다(§5). 유닛보다 시나리오를 먼저 쓴다 |
| `superpowers:verification-before-completion` | 완료 선언 전 | 빌드가 통과해도 완료가 아니다. E2E 전건 PASS와 실동작 확인 후에만 완료를 보고한다 |
| `superpowers:writing-plans` / `executing-plans` | plan.md 작성/소비 시 | spec-kit plan 단계의 작성 품질 규율 |
| `superpowers:requesting-code-review` / `receiving-code-review` | PR 전후 | 스펙 경로 PR은 E2E 전건 PASS와 Multi-Layer Defense 준수를 리뷰에서 확인한다 |
| `superpowers:finishing-a-development-branch` | 기능 브랜치 마무리 | 머지 전 정리 절차 |
| `superpowers:using-git-worktrees` | 병렬 작업 격리 필요 시 | 대형 작업 중 긴급 수정 등 |

스킬이 1%라도 적용 가능하면 반드시 스킬을 먼저 호출하고 작업한다. 프로세스 스킬인 brainstorming과 systematic-debugging이 구현 스킬보다 먼저다.

---

## 5. E2E-First (NON-NEGOTIABLE)

이 프로젝트의 TDD는 곧 E2E-First다. LLM 행태를 바꾸는 모든 변경, 그러니까 HR skill description과 tool calling, 프롬프트 가드를 손댈 때는 다음 순서를 지킨다.

```bash
# 1. 시나리오 먼저 append (server/scripts/e2e-hr-skill/scenarios.json 또는 embed 스위트)
# 2. FAIL 확인 — 현재 코드가 실제로 그 문제를 갖고 있음을 실측
npm run e2e:hr-skill -- --only=Q9        # 격리 실행
# 3. 수정 (L1 description / L2 코드 가드)
# 4. 해당 시나리오 PASS
# 5. 전건 PASS — 회귀 없음 증명
npm run e2e:hr-skill && npm run e2e:embed-hr-skill
```

- 타입체크·빌드 통과는 검증이 아니다.
- FAIL-first가 불가한 경우, 예를 들어 기존 가드를 공유할 때는 시나리오 note에 사유를 남기고 회귀 가드로 등록한다. Q4가 그 선례다.
- 행태 보증은 **Multi-Layer Defense** 3층을 다 채워야 완료로 친다. L1 description·프롬프트 가드, L2 코드 가드(화이트리스트·footer), L3 E2E 시나리오까지 갖춰야 하고 한 층만 고쳐 놓고 완료를 보고하면 안 된다.
- 상세 인프라와 함정은 [`HR-SKILL-GUIDE.md`](HR-SKILL-GUIDE.md) §6·§8을 본다.

---

## 6. PDCA로 남기는 기록

| 단계 | 산출물 | 위치 | 언제 |
|---|---|---|---|
| Check | `{feature}.analysis.md` | `docs/03-analysis/` | 조사·감사 결과를 팀이 재사용할 가치가 있을 때 |
| Act/Report | `{feature}.report.md` | `docs/04-report/features/` | 기능 완료 보고 |
| Archive | 월별 이관 | `docs/archive/YYYY-MM/{feature}/` | 종료 후 |
| **Convention 승격** | `docs/conventions/{name}.md` | 영구. archive 대상 아님 | 동일 패턴을 3회 이상 반복 검증하고 적용 매트릭스를 완성했을 때 |

다만 `docs/`는 `.gitignore` 대상이라 커밋할 문서는 `git add -f`로 명시해 추가해야 한다. 선례가 있다.

---

## 7. 실전 예시

아래 두 건은 이 리포에서 실제로 겪은 이력이다.

### 예시 A. "오늘 출근정보만 요청했는데 한 달치 표가 나옴" (트랙 1)

1. 첫 응답에 "트랙 1 (버그/회귀) — 발췌 로직 미반영 의심"이라고 라우팅을 한 줄로 선언했다.
2. `systematic-debugging` Phase 1에서 수정 위치를 실측해 보니 footer는 이미 배포돼 있었다. 진짜 원인은 따로 2건이었다. 시스템 프롬프트의 `[HR_TABLE_OUTPUT]`가 footer와 충돌했고 모델이 오늘 날짜를 인지하지 못했다.
3. E2E-First로 Q5/Q6/EC-ALLOW-11 시나리오를 append하고 FAIL을 실측했다. 오늘을 07-01로 잘못 잡고 있었다.
4. 수정: `[HR_DATE_CONTEXT]` 주입 + 가드 문구 조화. 양 경로를 미러링했다.
5. `verification-before-completion`에 따라 hr-skill과 embed 전건 PASS를 확인한 뒤 완료를 보고했다.
6. 커밋은 사용자 요청 시(`fix(hr-answer-quality): ...`).

### 예시 B. endpoint 카탈로그 재정렬 (트랙 5 신규/재정렬, specs/011)

1. spec.md에 교체·보류·폐기를 가르는 결정표 D1~D9를 명시하고 사용자 승인을 받았다.
2. plan.md에 3-Mode 영향과 Convention 적용, E2E 목록을 명시한 뒤 tasks.md를 거쳐 다시 승인받았다.
3. implement 단계에서는 E2E 스위트를 재편해 FAIL을 확인하고 handler와 plugin.json을 재정렬한 다음 전건 PASS를 받았다.
4. 외부 리포에도 영향이 갔다. okrservice hrBridge allowlist 때문에 작업지시서 발주 문서를 따로 산출했다.
5. contracts의 `kiwibox-request-bodies.md`가 이후 작업의 정본이 됐다.

---

## 8. 자주 하는 실수

| 실수 | 교정 |
|---|---|
| 라우팅 선언 없이 바로 코드 수정 | 첫 응답에 트랙과 근거를 한 줄로 쓴다. 오분류를 드러내는 장치다 |
| spec 승인 전에 plan 작성, plan 승인 전에 구현 | 풀 게이트 위반이다. 관문마다 멈추고 승인을 기다린다 |
| 버그를 보자마자 "이거 같은데" 수정 | systematic-debugging Phase 1로 근본 원인을 잡기 전에는 고치지 않는다 |
| 코드 고치고 나서 시나리오 작성 | E2E-First의 역순이다. FAIL 실측이 먼저다 |
| description만 고치고(L1) 완료 보고 | Multi-Layer 3층을 확인한다. 민감정보는 L2에서 원천 차단해야 한다 |
| chat 모드만 확인하고 배포 | 3-Mode(+embed 4면) 확인 |
| 소규모로 시작해 몸집 커졌는데 계속 진행 | §2 에스컬레이션 — 중단 후 트랙 5 전환 |
| 요청 안 한 리팩터링 동봉 | 최소 범위 원칙 — 인접 개선은 제안만 |
| 임의 커밋/푸시 | 사용자가 요청할 때만 |

---

## 9. 치트시트

```bash
# spec-kit (Claude Code slash 명령)
/speckit-specify      # 요구 → spec.md
/speckit-clarify      # (트랙 6) 모호점 질의
/speckit-plan         # 설계 → plan.md
/speckit-tasks        # 분해 → tasks.md
/speckit-analyze      # (트랙 6) spec/plan/tasks 교차 정합성
/speckit-implement    # 구현 실행
/speckit-constitution # 헌장 개정

# E2E
npm run e2e:hr-skill                     # @agent 면 전건
npm run e2e:hr-skill -- --only=ID1,ID2   # 격리
npm run e2e:hr-skill:full                # full tier
npm run e2e:embed-hr-skill               # embed 면 전건

# 관련 문서
.specify/memory/constitution.md          # 정본 헌장
CLAUDE.md                                # 라우팅 요약 (에이전트 진입점)
HR-SKILL-GUIDE.md                        # HR skill 도메인 상세
docs/conventions/hr-skill-description-pattern.md
```
