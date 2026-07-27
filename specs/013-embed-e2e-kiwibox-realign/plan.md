# Implementation Plan: embed E2E 스위트 kiwibox 재정렬

**Branch**: `main` (별도 브랜치 미생성 — 사용자 지시 시 분기) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-embed-e2e-kiwibox-realign/spec.md`

## Summary

구 REST(`/api/v1`) 기대로 전량 무효화된 embed E2E 스위트(22건)를 현행 kiwibox
정본으로 재정렬한다. 축(ALLOW 10 / DENY 5 / FILTER 7) 구조·건수는 보존, HR 기대만 교체:

- **mock 단일화**: embed 자체 mock 폐기 → `e2e-hr-skill/mock-hr-api.js` 공유 (D2)
- **runner 동급화**: mock 대조 필터 `.do` 교체 + specs/012 assertion 3종 이식 (D6)
- **시나리오 재작성**: message 본인 기준 현행화(D4), `.do`+`cmd=` 기대(D3),
  현행 미제공 조회 3건 교체(D5 — 보너스·자격증×2)

## Technical Context

**Language/Version**: Node.js 18+ (CommonJS), 빌드 불필요 — E2E 스크립트 전용

**Primary Dependencies**: 없음(신규 패키지 0) — 기존 embed runner·embedconfig 헬퍼·공유 mock 연장

**Storage**: N/A (embed_config·테스트 워크스페이스는 헬퍼가 psql로 생성·정리 — 기존 방식)

**Testing**: `node server/scripts/e2e-embed-hr-skill/runner.js` (연동 npm script는 research.md R5). 사전 조건: 서버 `:3001` + postgres 컨테이너 (specs/012와 동일)

**Target Platform**: Linux server (WSL2 동일)

**Project Type**: E2E 테스트 인프라 (제품 코드 무수정)

**Performance Goals**: 해당 없음

**Constraints**: 제품 코드(서버·skill) 무수정 — 테스트 파일만 / 축 로직 변경 금지(FR-006) / 신규 assertion 옵셔널(FR-005) / hr-skill 스위트 50건 회귀 0건(FR-007)

**Scale/Scope**: embed runner + scenarios.json(22건 재작성) + mock 삭제 1파일 + 공유 mock fixture 소폭 추가 + README

## Constitution Check

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 최소 범위 + fork-safe | PASS | 전부 fork 전용 E2E 파일. 제품 코드 0건 — embed override 파싱은 이미 존재(research R1)라 배선 불요 |
| II. 스펙 비례 | PASS | 22건 계약 재정의 — 스펙 경로 진행 중 (spec 승인 완료) |
| III. E2E-First | PASS(계획) | 시나리오 재작성 최선행 → 구 인프라(자체 mock·`/api/v1` 필터)에서 FAIL 확인 → runner/mock 이식 → PASS. 이 피처는 "테스트가 산출물"이라 FAIL-first가 곧 인프라 공백 증명 |
| IV. Description-Driven + Multi-Layer | 해당 없음 | LLM 제어 변경 없음 — description·handler·footer 무수정 |
| V. 3-Mode 일관성 | PASS | embed 면(4면째) 회귀망 복원이 이 피처의 목적 자체 |
| VI. Conventional Commits | PASS | 사용자 지시 시 `test(embed-e2e-kiwibox-realign): …` |

**Convention doc**: T-A/T-B 해당 없음 (plugin.json 무수정).

## Project Structure

### Documentation (this feature)

```text
specs/013-embed-e2e-kiwibox-realign/
├── spec.md              # 승인 완료
├── plan.md              # 이 파일
├── research.md          # Phase 0 (R1~R5)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── scenario-mapping.md   # 22건 구→신 매핑 정본 (교체 3건 포함)
└── tasks.md             # /speckit-tasks 산출
```

### Source Code (repository root)

```text
server/scripts/e2e-embed-hr-skill/
├── runner.js            # [수정] mock 경로 공유화, `.do` 필터, assertion 3종 이식
├── scenarios.json       # [재작성] 22건 — contracts/scenario-mapping.md 정본
├── mock-hr-api.js       # [삭제] 공유 mock으로 대체
├── helpers/embedconfig.js  # [무수정] skill 식별자 이미 현행 hubId (research R2)
└── README.md            # [수정] mock 공유·신규 expect 필드·kiwibox 예시

server/scripts/e2e-hr-skill/
└── mock-hr-api.js       # [수정] fixture 추가분만 — 기존 cmd 무영향 (FR-004)
```

**Structure Decision**: 제품 코드 무수정. 삭제 1(중복 mock) + 수정 4 + 문서.

## Complexity Tracking

위반 없음 — 해당 없음.
