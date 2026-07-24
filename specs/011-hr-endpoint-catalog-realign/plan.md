# Implementation Plan: HR 스킬 엔드포인트 신판 카탈로그 재정렬

**Branch**: `feat/5240hr` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-hr-endpoint-catalog-realign/spec.md`

## Summary

HR agent-skill 6종의 kiwibox 호출을 신판 엔드포인트 카탈로그(실호출 전수 검증본)에 재정렬한다: 미사용/폐기/관리자형 endpoint 교체(D1·D2·D5), 실측 필수 BODY 보강(D3·D9, §3 휴가 공통 BODY 포함), 신규 setup_arg `HR_WKAREA_CD`(D4). LLM 노출 파라미터 계약은 불변. 검증은 E2E-First — mock/runner를 kiwibox `.do` + POST body 검증 가능하게 확장 후 FAIL-first로 진행.

**Convention doc**: `docs/conventions/hr-skill-description-pattern.md` — description 문구·period 파라미터 계약 불변이므로 T-A/T-B 재작성 비대상(§6.2 회귀 검증 절차만 준용). 신규 주기 파라미터 없음.

## Technical Context

**Language/Version**: Node.js 18+ (AnythingLLM server 런타임, agent-skill 플러그인)

**Primary Dependencies**: 없음(신규 의존성 0) — `_shared/hrSession.js`·`dateResolver.js`·`formatTable.js` 재사용

**Storage**: N/A (DB 스키마 무변경)

**Testing**: `server/scripts/e2e-hr-skill` 러너(L3) + `node --test` `_shared/__tests__`(L2)

**Target Platform**: Linux server (AnythingLLM :3001) + embed 클라이언트 위임(브라우저 브리지)

**Project Type**: AnythingLLM fork의 agent-skill 플러그인 세트 (fork-custom 격리 영역)

**Performance Goals**: 해당 없음 (조회 프록시 — 기존 타임아웃 10s 유지)

**Constraints**: 신판 "실측 성공 본문 그대로, 임의 축약 금지" / self 강제(사번 파라미터 LLM 미노출) / ★민감 필드 렌더 차단 / 업스트림 파일 무접촉

**Scale/Scope**: skill 6종 handler.js + plugin.json 2종 + `_shared/hrSession.js` + E2E runner/mock + scenarios.json 전면 재편(132건 폐기/개편, legacy 보존 파일 신설) — 약 12파일

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위·fork-safe | PASS | 전 변경이 fork-custom 파일(agent-skills·e2e 스크립트). 업스트림 diff 0. D6/D7로 범위 확장 억제 |
| II. 스펙 비례 | PASS | 통합 대상 교체 트리거 → 스펙 경로 진행 중. 결정표 승인 완료 |
| III. E2E-First | PASS | Phase 계획이 시나리오 append+FAIL 확인을 코드 수정 선행으로 배치. 단 mock/runner의 kiwibox 미지원 갭 발견(research R-2) → 인프라 확장을 시나리오 append와 같은 선행 단계에 포함(인프라 없이는 FAIL-first 자체가 불성립) |
| IV. Description-Driven·Multi-Layer | PASS | description 문구 불변(handler.js 무수정 원칙은 LLM 행태 제어 관점 — endpoint 교체는 handler 고유 영역). L1 기존 유지 / L2 화이트리스트·마커 가드 / L3 신규 시나리오 |
| V. 3-Mode | PASS(확인 항목) | skill 실행은 모드 공통이나 클라이언트 위임(embed) 경로의 신규 `.do` path 통과를 실동작 검증에 포함 (quickstart §실동작 4) |
| VI. 커밋 | PASS | 사용자 요청 시에만 |
| VII. i18n | N/A | UI 문자열 변경 없음 (테이블 라벨은 skill 출력물 — 기존 한글 단일 관례 유지) |

**Post-design 재평가**: 위반 없음. Complexity Tracking 불요.

## Project Structure

### Documentation (this feature)

```text
specs/011-hr-endpoint-catalog-realign/
├── spec.md              # 승인된 결정표 D1~D9 포함
├── plan.md              # This file
├── research.md          # Phase 0 — as-is 실사·E2E 갭·파생 규칙·화이트리스트
├── data-model.md        # Phase 1 — ENDPOINT_MAP/화이트리스트/hrSession/시나리오 스키마
├── quickstart.md        # Phase 1 — FAIL-first E2E·L2·실동작 검증 절차
├── contracts/
│   └── kiwibox-request-bodies.md  # query_type별 to-be BODY 계약 (구현 정본)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server/storage/plugins/agent-skills/
├── _shared/
│   ├── hrSession.js          # [수정] 언랩 Map/codeList 추가, todayDashed/monthsAgoFirstYmd
│   └── __tests__/            # [추가] hrSession 헬퍼·언랩 단위 테스트
├── hr-attendance/
│   ├── handler.js            # [수정] D1·D2·D3, §3 공통 BODY, range-both, 화이트리스트 3종 추가
│   └── plugin.json           # [수정] setup_args.HR_WKAREA_CD 신설 (description 불변)
├── hr-salary/handler.js      # [수정] searchYm 유도+searchType=web, D5 SAL-0050 교체+화이트리스트
├── hr-salary/plugin.json     # [수정] salary_statement 라벨 문구만 (enum 불변)
├── hr-approval/handler.js    # [수정] D8 searchSYmd/EYmd 병행 추가
├── hr-certificate/handler.js # [수정] D9 3중 사번 마커+기간
├── hr-welfare/handler.js     # [수정] D9 기간 + 마커 공란 중단 L2
└── hr-personnel/handler.js   # [수정] education BODY 보강 (D6 보류로 profile 무접촉)

server/scripts/e2e-hr-skill/
├── mock-hr-api.js            # [수정] urlencoded body 객체 파싱 로깅
├── runner.js                 # [수정] .do path 대조 + mock_body_pattern 검증
└── scenarios.json            # [추가] E131~ kiwibox BODY 검증 시나리오 (tier: primary)
```

**Structure Decision**: 전 변경을 기존 fork-custom 경로 안에서 수행. 신규 파일은 단위 테스트뿐. hr-year-end-tax·frontend·server 코어 무접촉.

## 구현 단계 개요 (Phase 2 tasks 입력)

1. **T-인프라 (L3 선행)**: runner `.do` 필터+`mock_body_pattern`(_raw 정규식 대조 — 필수) / mock urlencoded 객체 파싱(선택·편의).
2. **T-스위트 재편 (FR-015)**: 기존 scenarios.json → `scenarios-legacy-20260716.json` 보존 이동 → 신규 스위트 작성: ① 본 피처 대상 query_type의 kiwibox BODY 검증 시나리오(contracts 표 기반), ② legacy 개편분(행태 검증 의도 승계 — 결정론성·되묻기 금지·연말정산 매핑), ③ 대응 기능 부재분 제거. `E2E_ONLY` 실행으로 **BODY 검증 시나리오 전건 FAIL 확인**(현행 handler의 구 endpoint 호출 증빙).
3. **T-공유**: hrSession 언랩·헬퍼 + 단위 테스트.
4. **T-skill별 수정**: contracts/kiwibox-request-bodies.md를 정본으로 handler 6종 + plugin.json 2종. 순서: hr-attendance(P1) → hr-salary(P2) → approval/certificate/welfare/personnel(P3).
5. **T-검증**: 신규 스위트 전건 PASS → SC-004 grep 0건 → SC-006(`/api/v1` 패턴 0건) → L2 테스트 → 실동작 스모크(quickstart).

## 리스크·후속

- D4 orgCd 미전송이 특정 endpoint에서 실측과 달리 필수일 가능성 → 실동작 스모크에서 검출 시 setup_arg `HR_ORG_CD` 추가로 후속 처리(계약 비침습 경로 확보됨).
- D8 병행 전송이 서버측 파라미터 충돌을 일으킬 가능성 낮음(무시되는 여분 파라미터) — E2E+스모크로 확인.
- ~~기존 E1~E130 괴리 후속 이슈~~ → **범위 편입(FR-015)**: backup 시대(kiwibox-hr-api REST) 스킬 완전 폐기 확정(사용자 지시 2026-07-24). legacy 시나리오 전면 폐기/개편 — research R-2 처분표 참조.
- YTA 시나리오 24건 개편은 hr-year-end-tax query_type 매핑 조사 필요(엔드포인트 재정렬 자체는 여전히 범위 외 — 시나리오만 현행 계약 기준 재작성).
