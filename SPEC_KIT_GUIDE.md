# Spec Kit + Superpowers 개발 가이드

이 저장소는 두 도구를 **함께** 사용합니다.

- **[Spec Kit](https://github.com/github/spec-kit)** — *무엇을·왜* 만들지를 정하는 **명세 파이프라인**. 기능을 바로 코딩하지 않고 `명세 → 계획 → 작업 → 구현` 순으로 진행하며, 산출물 `specs/`가 source of truth.
- **[Superpowers](https://github.com/obra/superpowers)** — *어떻게* 만들지를 통제하는 **구현 규율**(TDD·검증·디버깅·리뷰). 코드를 짜는 순간 자동으로 작동.

> **핵심 멘탈 모델:** Spec Kit이 **설계도**를 그리고, Superpowers가 **시공 규칙**을 강제합니다. 둘은 겹치지 않고 보완합니다.

| | **Spec Kit** | **Superpowers** |
|---|---|---|
| 담당 | 무엇을·왜 (명세/계획) | 어떻게 (구현 규율) |
| 산출물 | `specs/<NNN>/` (커밋, 정본) | TDD·검증·디버깅 **행동 규칙** |
| 형태 | 프로젝트에 설치된 스킬 | 사용자 전역 **플러그인** |
| 호출 | 수동 `/speckit-*` | SessionStart 훅으로 **자동** |
| 적용 범위 | 이 저장소 | 모든 프로젝트(전역) |

---

## 1. 설치 / 준비

### 1-1. Spec Kit — 이미 설치됨 ✅
`.specify/`, `.claude/skills/speckit-*`, `CLAUDE.md`가 저장소에 커밋되어 있습니다. **clone만 하면 추가 작업 불필요.** 버전 확인: `specify version`.

<details>
<summary><b>처음부터 설치하거나 다른 프로젝트에 적용하려면</b> (펼치기)</summary>

**준비물:** [uv](https://docs.astral.sh/uv/), Python 3.11+, git.

**① `specify` CLI 설치** (전역, 1회) — 최신 태그는 [Releases](https://github.com/github/spec-kit/releases)에서 확인해 `vX.Y.Z`에 넣습니다:
```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version   # 설치 확인
```

**② 프로젝트에 init:**
```bash
specify init . --integration claude --script sh --force   # → .claude/skills/, CLAUDE.md
# Codex도 쓰는 경우:
specify init . --integration codex  --script sh --force   # → .agents/skills/, AGENTS.md
```
두 명령 모두 공유 인프라 `.specify/`(스크립트·템플릿·constitution)를 설치합니다. `claude`·`codex` CLI가 PATH에 없으면 `--ignore-agent-tools`를 추가하세요.

**③ 원칙 작성:** `/speckit-constitution` 실행(또는 `.specify/memory/constitution.md` 직접 편집)로 프로젝트 규칙을 채웁니다.

</details>

### 1-2. Superpowers — 각자 1회 설치 필요 ⚠️
Superpowers는 **사용자 전역 플러그인**이라 저장소에 들어있지 않습니다. 개발자마다 자기 환경에 한 번 설치하세요. (설치는 에이전트 안에서 입력하는 **대화형 명령**입니다.)

**Claude Code:**
```
/plugin install superpowers@claude-plugins-official
```
→ 설치 후 **새 세션을 시작하거나 `/clear`** 해야 SessionStart 훅이 적용됩니다.

**설치 확인:** 새 세션에서 `test-driven-development`, `brainstorming` 등 스킬이 보이면 정상.

---

## 2. 통합 워크플로 (전체 그림)

```
┌─ Spec Kit (명세·계획) ──────────────────────────────────┐
│                                                          │
│  (brainstorming) → specify → (clarify) → plan → tasks    │
│       ▲선택적          │                                  │
│       │ 의도 발산       └→ specs/<NNN>/ 에 커밋(정본)      │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─ implement ─────────────────────────────────────────────┐
│  여기서 Superpowers 규율이 자동 작동:                      │
│    • test-driven-development   (실패 테스트 우선)          │
│    • verification-before-completion (증거 후 완료 선언)    │
│    • systematic-debugging      (근본 원인 우선)           │
│    • using-git-worktrees       (작업당 격리 브랜치)       │
│    • requesting/receiving-code-review (머지 전 리뷰)      │
│  └ /speckit-analyze (산출물 정합성)과 병행                 │
└──────────────────────────────────────────────────────────┘
```

**역할 분담 원칙 (중복 방지):**
- 명세·계획은 **Spec Kit이 소유** → Superpowers `writing-plans` 대신 `/speckit-plan`+`/speckit-tasks`를 씁니다.
- `brainstorming`은 **의도를 다듬는 데만** 쓰고, 확정 내용은 `specs/<NNN>/spec.md`에 인코딩합니다.
- **기존 PDCA 문서 흐름과의 관계:** 기존 `docs/01-plan/` ~ `docs/04-report/` PDCA 경로는 레거시 피처 이력용으로 유지합니다. **신규 피처의 명세·계획 정본은 `specs/<NNN>/`** 입니다. PDCA Plan/Design에 해당하는 내용은 `spec.md`/`plan.md`가 대체하고, 완료 Report는 필요 시 기존 경로를 계속 써도 됩니다.

---

## 3. 단계별 따라하기 (새 기능 만들기)

### ① (선택) 아이디어 다듬기 — brainstorming
아이디어가 막연하면 brainstorming으로 시작합니다. 한 번에 하나씩 질문하고, 2~3개 접근안을 비교한 뒤 설계를 승인받습니다.
```
이 기능 brainstorming부터 하자: <아이디어>.
설계가 확정되면 writing-plans 말고 /speckit-specify 로 넘겨줘.
```
> ⚠️ 인계 override가 중요합니다 — 4절 참고.

### ② 명세 작성 — specify
승인된 설계(또는 바로 아이디어)를 명세로 고정합니다.
```
/speckit-specify <기능 설명>
```
→ 기능 브랜치 + `specs/<NNN>-<이름>/spec.md` 생성. User Story(P1/P2/P3), 요구사항(FR-001…), 성공 기준(SC-001…)이 채워지고 품질 체크리스트(`checklists/requirements.md`)가 만들어집니다. `[NEEDS CLARIFICATION]`은 최대 3개.

### ③ (권장) 모호함 해소 — clarify
```
/speckit-clarify
```
→ 남은 모호한 요구사항을 질문으로 정리해 spec.md에 반영.

### ④ 기술 계획 — plan
```
/speckit-plan Node.js(Express) server + React(Vite) frontend + Prisma 스택에 맞춰 작성
```
→ `plan.md`와 설계 산출물 생성. `constitution.md` 제약(HR skill convention, E2E 회귀 등)을 반영합니다.

### ⑤ 작업 분해 — tasks
```
/speckit-tasks
```
→ 의존성 순서의 실행 가능한 `tasks.md` 생성.

### ⑥ (권장) 정합성 점검 — analyze
```
/speckit-analyze
```
→ spec·plan·tasks 간 불일치 점검. HR skill convention 위반은 CRITICAL 처리.

### ⑦ 구현 — implement (여기서 Superpowers가 작동)
```
/speckit-implement
```
→ `tasks.md`를 순서대로 구현. 이 동안 5절의 Superpowers 규율이 자동 적용됩니다.

---

## 4. brainstorming → specify 인계 (override 2가지)

Superpowers `brainstorming`은 원래 Spec Kit과 **무관하게** 설계되어 있어, 이 저장소에선 두 가지 기본 동작을 덮어써야 합니다.

| 분기점 | brainstorming 기본값 | 이 저장소에서는 |
|---|---|---|
| **다음 단계** | 끝에서 `writing-plans` 호출 | **`/speckit-specify`로 넘기라고 명시** |
| **설계 문서** | `docs/superpowers/specs/...md` 작성+커밋 | 그 경로는 **gitignore(스크래치)**. 정본은 `specs/<NNN>/spec.md` |

brainstorming은 "다음은 오직 writing-plans"라고 강하게 못박혀 있으므로 **사용자 지시로 명시적으로 전환**해야 합니다(스킬 규칙보다 사용자 지시가 우선). 방법 2가지:

- **한 번에 지시:** `이 기능 brainstorming 후 /speckit-specify 로 넘겨줘`
- **승인 게이트에서 전환:** 설계 승인 시점에 `좋아, 이 설계로 /speckit-specify 실행해줘`

> 효과: 모호함을 brainstorming에서 미리 풀어 specify의 `[NEEDS CLARIFICATION]`이 줄고 spec.md 품질이 올라갑니다.
> 작은 변경(설정·버그픽스)은 brainstorming을 건너뛰고 바로 `/speckit-specify`로 가도 됩니다.

---

## 5. 구현 단계의 Superpowers 규율 (자동 적용)

`/speckit-implement` 동안 아래 규율이 작동합니다. 모두 [Constitution](.specify/memory/constitution.md)을 런타임에 집행하는 것입니다.

| 스킬 | 규칙 | 연결되는 Constitution |
|---|---|---|
| `test-driven-development` | 실패하는 테스트를 **먼저** 작성 | III. 테스트 동반 + E2E 회귀 |
| `verification-before-completion` | 검증 명령 **증거** 후에만 "완료" 선언 | II. 품질 게이트 / V. 3-Mode 검증 |
| `systematic-debugging` | 수정 전 **근본 원인** 4단계 조사 | — |
| `using-git-worktrees` | 작업당 **격리 브랜치/워크스페이스** | VI. 집중 브랜치 |
| `requesting`/`receiving-code-review` | 머지 전 리뷰, 맹목적 수용 금지 | VI. 리뷰 후 머지 |
| `subagent-driven-development`·`dispatching-parallel-agents` | 독립 작업 병렬 실행 | — |

---

## 6. 호출 방법 (치트시트)

**Spec Kit 명령 전체:** `constitution · specify · clarify · plan · checklist · tasks · analyze · implement` (+ `taskstoissues`, `agent-context-update`)

Claude Code에서 `/speckit-<명령>` 뒤에 자연어로 의도를 적으면 그대로 입력으로 전달됩니다.

---

## 7. 생성/관리 파일 & 커밋 정책

| 경로 | 용도 | git |
|---|---|---|
| `.specify/memory/constitution.md` | 프로젝트 개발 원칙 (정본) | 커밋 |
| `.specify/templates/`, `.specify/scripts/bash/` | 템플릿·자동화 스크립트 | 커밋 |
| `.claude/skills/speckit-*` | Spec Kit 스킬 정의 | 커밋 |
| `CLAUDE.md` / `AGENTS.md` | 에이전트 컨텍스트 파일 | 커밋 |
| `specs/<NNN-기능>/` | `spec.md`·`plan.md`·`tasks.md` 등 | 커밋 |
| `docs/superpowers/` | brainstorming 초안(스크래치) | **.gitignore** |
| `.worktrees/` | Superpowers 격리 워크스페이스 | **.gitignore** |

> **주의:** upstream(anything-llm) `.gitignore`가 `.claude`·`CLAUDE*.md`를 무시하므로, 이 저장소는 `.gitignore` 하단에 **override(`!.claude/`, `!CLAUDE.md`)** 를 두어 spec-kit 산출물을 커밋합니다. `.claude/settings.local.json`은 개인 설정이라 계속 무시합니다.
>
> **커밋 정책:** Spec Kit 스캐폴딩과 `specs/` 산출물은 모두 커밋(명세가 source of truth). Superpowers는 전역 플러그인이라 저장소에 커밋되지 않으며, 그 스크래치 산출물도 추적하지 않습니다. `.specify/`에 자격증명/비밀값은 두지 마세요.

---

## 8. 규칙 (Constitution 요약)

구현 시 [.specify/memory/constitution.md](.specify/memory/constitution.md)의 원칙을 따릅니다.

1. **Yarn 워크스페이스별 관리** — `server/`·`frontend/`·`collector/` 각자 `yarn`, 워크스페이스 내 `npm install` 금지
2. **품질 게이트** — 커밋·PR 전 루트 `yarn lint` 통과 (번역 변경 시 `yarn verify:translations` 추가)
3. **테스트 동반 + E2E 회귀** — 동작 변경 시 테스트 추가, HR skill 변경 시 `npm run e2e:hr-skill` E1~E15 전건 PASS
4. **HR Skill Convention** — `docs/conventions/hr-skill-description-pattern.md` 필수 참조, handler.js 무수정 원칙
5. **3-Mode Chat 검증** — 채팅 흐름 변경 시 chat/query · react · @agent 3개 모드 모두 확인
6. **집중 브랜치 + Conventional Commits** — 작업당 브랜치, `main` 직접 커밋 금지

---

## 9. 유지보수 / 트러블슈팅

- **Spec Kit 버전 확인:** `specify version`
- **Superpowers 미작동:** 설치 후 **새 세션/`/clear`** 했는지 확인. 스킬이 안 보이면 재설치(`/plugin`).
- **brainstorming이 멋대로 writing-plans로 감:** 4절의 인계 override를 명시하세요.
- ⚠️ **`specify init . --force` 재실행 시** `constitution.md`가 템플릿으로 **덮어써짐**. 업그레이드 전 반드시 백업.
- 원본 문서: Spec Kit `/home/sdh/dev-tools/spec-kit`, Superpowers `/home/sdh/dev-tools/superpowers`. 원본 결합 사례: `/home/sdh/blog/notion-cms`.
