# Feature Specification: embed E2E 스위트 kiwibox 재정렬

**Feature Branch**: `013-embed-e2e-kiwibox-realign`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "e2e-embed-hr-skill 스위트가 구 REST(/api/v1) 시대 기대로 전건 작성돼 있어 kiwibox 재편(specs/011) 이후 무효. 축(ALLOW/DENY/FILTER) 구조는 보존하고 기대를 현행 kiwibox 정본으로 재작성. specs/012에서 만든 mock fixture·답변 assertion 재사용."

## 배경 및 문제

embed 위젯 경로(`/api/embed/{uuid}/stream-chat`)의 HR tool calling 검증 스위트
(`server/scripts/e2e-embed-hr-skill/`, 22건)가 전량 구 REST 기대로 남아 있다:

- `mock_url_pattern`이 폐기된 `/api/v1/*` — 현행 skill은 kiwibox `.do`만 호출
- runner mock 대조 필터도 `/api/v1` 전용 — 현행 호출은 계수조차 안 됨
- message가 "사번 20070133 직원의 …" — 현행 skill은 self 강제(사번 파라미터 없음)
- 자체 mock-hr-api.js 중복 보유 (hr-skill 스위트 mock과 별개, fixture 없음)

결과: embed 면(헌장 V 4면 중 하나)의 회귀망이 사실상 부재. specs/011 재편이
hr-skill 스위트만 커버한 공백.

## 사전 결정표 (사용자 방향 승인: "011 패턴 이식, 축 보존" — 2026-07-27)

| ID | 결정 사항 | 선택 | 근거 |
|----|----------|------|------|
| D1 | 축 구조 | ALLOW(10)/DENY(5)/FILTER(7) 3축·22건 규모 보존 | embed tool 권한 검증이 이 스위트의 고유 가치 — 죽은 것은 HR 기대뿐 |
| D2 | mock | 자체 mock 폐기, `e2e-hr-skill/mock-hr-api.js` 공유 | cmd 기반 fixture(specs/012 T003) 재사용, 중복 제거 |
| D3 | 기대 재작성 소스 | 신판 카탈로그 정본 + hr-skill 스위트 K/KB 패턴 | `.do` URL + `cmd=` body 검증 — 두 스위트 간 기대 일관성 |
| D4 | message 스타일 | "사번 NNNNN 직원의" → 본인 기준("내/이번 달") | 현행 skill self 강제 계약 정합 |
| D5 | 현행 미제공 조회 대체 | 보너스(EC-ALLOW-06) 등 현행 계약 밖 항목은 동일 skill의 유효 query_type로 교체 | hr-salary는 성과급 미제공 명시 — 죽은 기대 승계 금지 |
| D6 | runner 판정 | `.do` 필터 + specs/012 assertion 3종(answer/max_hr_calls) 이식 | 판정 능력 hr-skill 스위트와 동급화 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ALLOW 축: 전체 허용 embed에서 kiwibox 호출 검증 (Priority: P1)

전체 허용 embed 위젯에서 HR 질문 시 현행 kiwibox 엔드포인트(`.do` + `cmd=`)가
호출되고 질문 적합 답변이 오는지 검증된다.

**Why this priority**: 유일하게 기대 전면 재작성이 필요한 축 — 스위트 부활의 본체.

**Independent Test**: `npm run e2e:embed-hr-skill -- --only=EC-ALLOW-*` (러너 인자 체계 준용)

**Acceptance Scenarios**:

1. **Given** allow-all embed, **When** "내 연차 잔여일 알려줘", **Then** `/TAADclzVcatnList.do` + `cmd=getTAADclzVcatnList1` 호출 + 답변에 fixture 잔여값 포함
2. **Given** allow-all embed, **When** 현행 계약이 제공하지 않는 구질의(보너스), **Then** 해당 시나리오는 유효 query_type 질의로 교체돼 있다 (죽은 기대 잔존 0건)

---

### User Story 2 - DENY/FILTER 축: 권한 차단 회귀 유지 (Priority: P2)

전부 차단(DENY)·부분 허용(FILTER) embed에서 차단 대상 질문은 tool 미호출,
허용 대상은 kiwibox 호출로 판정된다.

**Why this priority**: 축 로직 자체는 유효 — message 현행화 + 허용측 기대만 교체.

**Independent Test**: DENY·FILTER ID 격리 실행, 차단 5+3건 미호출·허용 4건 `.do` 호출 확인.

**Acceptance Scenarios**:

1. **Given** deny embed, **When** HR 질문, **Then** tool 미호출 (mock 호출 0건)
2. **Given** filter-attendance embed, **When** 급여 질문, **Then** tool 미호출 / **When** 근태 질문, **Then** `.do` 호출

---

### User Story 3 - 스위트 실행 가능성 복원 (Priority: P1)

재편 후 스위트가 라이브 환경(서버 `:3001` + mock)에서 전건 실행·판정된다 —
embed 면 최초 라이브 실측.

**Independent Test**: 전건 실행 exit 0.

**Acceptance Scenarios**:

1. **Given** 재편 완료, **When** 전건 실행, **Then** 22건 전건 PASS + 구 `/api/v1` 기대 잔존 0건

---

### Edge Cases

- embed 경로 override: `/api/embed` 엔드포인트의 override 파싱 존재 확인 — 부재 시 배선은 specs/012 T020과 동일 계약으로 최소 diff (스펙 범위 내 허용)
- DENY-05(무관 질문 — 복지 설명)는 tool 미호출 유지 — 현행화만
- FILTER 축 embed_config의 skill 목록이 구 skill 명이면 현행 hubId로 교체
- 히스토리 오염: hr-skill 스위트의 wipe 패턴 이식 여부는 embed 세션 격리 방식(embed_config별 세션) 확인 후 plan에서 결정

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: embed 스위트 22건의 `mock_url_pattern`·기대는 전량 현행 kiwibox 정본(`.do` + `cmd=` body)이어야 하며 `/api/v1` 기대 잔존 0건.
- **FR-002**: message는 현행 self 강제 계약(본인 기준)으로 재작성 — 사번 지정 문구 잔존 0건.
- **FR-003**: 현행 skill 계약이 제공하지 않는 조회(성과급 등)는 동일 skill의 유효 query_type 질의로 교체.
- **FR-004**: mock은 `e2e-hr-skill/mock-hr-api.js` 단일 공유 — embed 자체 mock 제거. 필요한 신규 fixture는 공유 mock에 추가(기존 시나리오 무영향 원칙 유지).
- **FR-005**: embed runner는 `.do` 필터 + specs/012 assertion 3종을 지원하고, 신규 필드는 옵셔널.
- **FR-006**: ALLOW/DENY/FILTER 축 구성·건수 의도(10/5/7) 보존 — 축별 판정 로직 변경 금지.
- **FR-007**: hr-skill 스위트(50건) 회귀 0건 — 공유 mock 변경이 기존 판정에 영향 주지 않아야 함.

## Success Criteria *(mandatory)*

- **SC-001**: embed 스위트 전건(22건) 라이브 PASS — 최초 실측 기록
- **SC-002**: `/api/v1`·사번 지정 문구 잔존 0건 (grep 검증)
- **SC-003**: hr-skill 스위트 50/50 유지
- **SC-004**: mock 파일 1개로 수렴 (중복 제거)

## Assumptions

- embed 서버 경로는 toolCallingLoop(executor) 사용 — override 병합 기존 배선 활용, 게이트 동일(dev/`ALLOW_TOOL_RUNTIME_OVERRIDE`)
- embed_config 헬퍼(embed 생성·권한 설정)는 구조 재사용, skill 식별자만 현행화
- E2E-First 적용 방식: 재작성 시나리오는 "기대만 신판" 상태로 먼저 실행해 현재 인프라에서 FAIL(구 필터·mock 부재)을 확인 후 runner/mock 이식 — 헌장 III 준수
- 실행 환경: specs/012와 동일 (서버 `:3001`, postgres 컨테이너, mock `:8000`)

## Out of Scope

- embed 위젯 프론트(R1 클라이언트 위임) 브라우저 실측 — 서버 폴백 경로 검증까지만
- hr-skill 스위트 시나리오 변경 (fixture 추가 제외)
- embed 권한 모델 자체 변경
