# Research: embed E2E 스위트 kiwibox 재정렬

Phase 0 — spec의 plan 단계 확인 항목 2건 포함, 미확정 0건.

## R1. embed 경로 override 파싱 — 존재, 배선 불요

- **Decision**: 제품 코드 무수정. runner는 `x-tool-runtime-override-HR_BASE_URL` 등
  현행 키 헤더만 사용 (specs/012 T020에서 이미 교체 완료).
- **Rationale**: `server/endpoints/embed/index.js:20-52`에 override 파서 존재 —
  게이트(dev/`ALLOW_TOOL_RUNTIME_OVERRIDE`)·대문자화 규약이 workspace endpoint와 동일.
  embed 채팅은 toolCallingLoop(executor.js) 경로라 `#mergeRuntimeOverrides` 병합도 기존 배선.
- **Alternatives**: 없음 (확인 항목이었음 — 존재 확정).

## R2. embed_config skill 식별자 — 이미 현행 hubId

- **Decision**: `helpers/embedconfig.js` 무수정. runner의 EMBED_CONFIGS
  (`allowedSkillHashes: "hr-attendance"`, `"hr-salary,hr-personnel"`) 유지.
- **Rationale**: 식별자가 구 skill명이 아니라 현행 hubId — FILTER 축 로직 유효.
- **비고**: 테스트 워크스페이스를 매 실행 타임스탬프 slug로 신규 생성 → 히스토리
  오염 구조적으로 없음. specs/012의 workspace_chats wipe 이식 **불요**.

## R3. 구질의 → 현행 계약 매핑 (22건)

- **Decision**: 정본은 [contracts/scenario-mapping.md](./contracts/scenario-mapping.md).
  현행 미제공 조회 3건 교체 (D5):
  - EC-ALLOW-06 보너스 → hr-salary `salary_statement` (성과급은 description에서 미제공 명시)
  - EC-ALLOW-08·EC-FILTER-07 자격증 → hr-personnel `education` (license query_type 부재 —
    현행 query_types: profile/profile_detail/org_tree/org_members/todo_count/schedule_day/contact_directory/education)
- **Rationale**: 죽은 기대 승계 금지(FR-003). 교체 후에도 skill 분포(축별 대상 skill 다양성) 유지.
- **Alternatives**: 시나리오 삭제 — 축 건수 보존(D1/FR-006) 위반, 기각.

## R4. fixture 전략 — URL/body 검증은 빈 응답으로 충분

- **Decision**: 공유 mock에 fixture 추가는 **최소**: 기존 3종(연차/사용내역/근무현황) +
  CommonCode 재사용. 신규 cmd fixture는 answer assertion을 거는 대표 시나리오
  (EC-ALLOW-03 연차)에만 필요 — 이미 존재. 나머지는 빈 응답(`data:[]`)으로
  URL/body 패턴 검증 (hr-skill 스위트 K계열과 동일 방식).
- **Rationale**: 스위트 목적은 권한 축 검증 — 답변 품질 축은 specs/012 소관.
  대표 1건(ALLOW-03)에만 `answer_pattern` 적용해 embed 경로에서도 footer 소비가
  동작함을 스모크 확인. 과설계 방지.
- **Alternatives**: 전 시나리오 fixture+answer assertion — fixture 10여 종 추가 비용
  대비 검증 가치 낮음(권한 축과 무관), 기각.

## R5. runner 이식면

- **Decision**:
  - mock spawn 경로: `SCRIPT_DIR/mock-hr-api.js` → `../e2e-hr-skill/mock-hr-api.js` (1줄)
  - 자체 `mock-hr-api.js` 삭제
  - relevantMock 필터: `/^\/api\/v1\//` → `/\.do$/`
  - assertion 3종(`answer_pattern`/`answer_not_pattern`/`max_hr_calls`) 로드 검증·판정
    이식 — 계약은 specs/012 [e2e-assertion-schema.md](../012-hr-answer-quality/contracts/e2e-assertion-schema.md) 준용
    (runner 2개뿐이라 공용 모듈 추출 대신 복사 허용 — 단순성 우선)
  - `effectiveToolCall`(mock-hit 근거 판정)·DENY/FILTER 차단 판정 로직은 무변경 (FR-006)
- **실행**: `npm run e2e:embed-hr-skill` (기존 script), MOCK_PORT 기본 8001 유지
  (hr-skill 스위트 8000과 병행 실행 충돌 방지).
- **Rationale**: 최소 diff로 판정 능력 동급화. 축 판정 로직 불변이 회귀 안전선.
