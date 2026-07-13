<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Workflow

This repository combines **spec-kit** (specification pipeline) and **superpowers**
(implementation discipline). spec-kit owns the spec/plan artifacts under `specs/`
(`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`); superpowers governs
implementation — test-driven development, verification-before-completion, and
root-cause debugging. See [SPEC_KIT_GUIDE.md](SPEC_KIT_GUIDE.md) for the role
split and combined workflow.

프로젝트 컨벤션(HR skill convention, PDCA 문서 경로, E2E 인프라, 3-Mode chat
아키텍처)은 [AGENTS.md](AGENTS.md)와
[.specify/memory/constitution.md](.specify/memory/constitution.md)를 따른다.

## Brainstorming → /speckit-specify 핸드오프

기능 작업은 **복잡도로 분기**한다.

- **단순/명확**: 브레인스토밍 없이 바로 `/speckit-specify`.
- **복잡**: superpowers `brainstorming`으로 의도·요구사항·설계를 정리한 뒤 `/speckit-specify`로 넘긴다.

**핵심 규칙 — brainstorming → speckit 전환은 반드시 "명시적 사용자 선택 단계"를 거친다.**

- brainstorming을 자동 종료하거나 건너뛰지 않는다. 사용자가 넘기라고 하기 전엔 speckit으로 진입 금지.
- 설계가 정리되면 전환을 눈에 보이게 제시하고 사용자가 고른다:
  ① `/speckit-specify`로 진행  ② 더 다듬기  ③ 중단/보류.
- 핸드오프 시점과 넘길 내용(정리된 설계)을 사용자가 확인한 뒤 결정한다.

> 이 규칙은 spec-kit + superpowers를 함께 쓰는 프로젝트의 공통 원칙이다. 새 speckit 프로젝트를
> 만들 때 이 섹션을 그대로 복사해 둔다. (개인 환경에는 `~/.claude/CLAUDE.md`에도 동일 원칙이 있다.)

## 명세 문서 언어 (Spec artifact language)

이 저장소의 spec-kit 산출물(`specs/<NNN-feature>/`의 `spec.md`, `plan.md`,
`tasks.md`, `checklists/`, 분석 노트 등)은 한국인 기획자·개발자를 위해 **한국어로
작성한다**. `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
`/speckit-clarify`, `/speckit-analyze` 등 향후 모든 spec-kit 작업에 적용된다.

- 코드 식별자(`hr-attendance`, `query_type`, `plugin.json` 등), 파일 경로, 셸 명령,
  FR/SC 식별자, BDD 키워드(Given/When/Then)는 원형을 유지한다.
- 템플릿이 영어로 산출되더라도 작성·갱신 시 한국어로 옮긴다.
