# Implementation Plan: HR 챗봇 연장근무 한도·사용·잔여 표시

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-hr-overtime-limit/spec.md`

## Summary

연장근무 질문의 데이터 출처를 HR 시스템 PC 주차별 신청 표에서 **5240 모바일 연장근무현황 조회**로 바꾼다. 한도·사용·잔여(주간 searchType=2, 월간 searchType=3)와 날짜별 내역을 쓴다(research R1).

- **새 공유 모듈** `_shared/overtimeStatus.js`가 질문 기간별 조회 계획, 본인 1행 검증, 표 렌더를 맡는다(R6·R3·R9).
  - 이번 달: 주간·월간 2줄 + 내역
  - 지난 달: 월간 1줄 + 내역
  - 연 단위: 월별 표 + 합계(015 `runMonthly` 재사용)
- **handler**: `overtime`·`overtime_limit` 두 값 모두 새 모듈로 보낸다. 기존 PC 조회 정의, 컬럼, 연도 모드는 제거한다(D1·D7).
- **연장근무 없음**: 사용 0.0 + "기록이 없습니다". "1건"은 금지한다(D5, 계약 §1-a·§3).
- **다른 직원 차단(L2)**:
  - handler는 항상 본인 마커를 보낸다.
  - 두 브리지에 **필수 사번 파라미터** 규칙과 searchType 값 허용을 추가한다(bridge-contract).
  - 응답이 1행이 아니면 결과를 버린다(R3).
- **L1**: plugin.json의 `query_type` 설명과 예시를 새 의미로 고친다(Convention §6.2·§7). 가드·운영 프롬프트는 바꾸지 않는다.
- **L3**:
  - 단위 테스트(모듈·handler·브리지)
  - E2E: 기존 K6·K7·KB21·K66·K68 기대값 갱신 + 신규(없음·지난 달·작년·팀 행 혼입·다른 직원)
  - embed 시나리오, 견고성 세트, 실서버 대조

## Technical Context

**Language/Version**: Node.js 18 (teamplgpt server, CommonJS). okrservice 위젯은 TypeScript(jest).

**Primary Dependencies**: 신규 의존성 없음. 재사용: `_shared/hrSession.hrFetch`·`SELF_STAFF_ID_MARKER`, `_shared/yearQuery`(runMonthly·monthlyPeriod·withPeriodHeader·appendBeforeAnswerGuide), `_shared/periodResolver.resolveYearPeriod`, `_shared/dateResolver.resolveDateParam`, `_shared/formatTable.renderTable`, `_shared/attendanceDisplay.toHHMM`.

**Storage**: N/A

**Testing**:
- jest `server/__tests__/storage/plugins/agent-skills/**`
- okrservice `widgets` jest(`hrBridge.test.ts`)
- E2E `server/scripts/e2e-hr-skill`·`e2e-embed-hr-skill`
- 라우팅 평가 `server/evals/hr-routing/run.js`
- scratch 견고성 세트

**Target Platform**: teamplgpt 서버(@agent · chat/query · embed 위젯 경로의 hr-attendance tool). 위젯 브리지(okrservice), HR 시스템 JSP 브리지.

**Project Type**: 웹 서비스 내부 agent-skill + 브라우저 브리지 스크립트

**Performance Goals**:
- 이번 달 질문은 HR 호출 3회(주간·월간·내역)를 **병렬**로 보낸다.
- 연 단위는 최대 12회를 순차로 보낸다(015와 같은 예산 60초, 연속 실패 중단). SC-006

**Constraints**:
- kiwibox 읽기 전용(HR 시스템 쪽 변경 없음)
- 내부값 비노출(사번·코드)
- 지어내기 금지(null → "—", 실패 → "조회 실패")
- 세션 정보는 env로만

**Scale/Scope**:
- 수정 파일(예상): teamplgpt 신규 1 + 테스트 신규 1 + 수정 약 9, okrservice 2
- E2E 시나리오: 갱신 5, 신규 5 + embed 4

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위 + 업스트림 발산 최소화 | PASS | 변경은 fork 전용 파일(agent-skills, extras, okrservice)뿐이다. upstream 파일은 수정하지 않는다. 다른 근태 조회는 그대로 둔다. 구 경로 브리지 허용 제거는 후속으로 미룬다(R8). |
| II. 스펙은 규모에 비례 | PASS | 외부 시스템 조회 교체 + 브리지 2곳 → 트랙 5. spec 승인 완료. |
| III. E2E-First | PASS(계획) | tasks에서 시나리오 갱신·추가 → FAIL 확인 → 구현 → 전건 PASS 순서로 배치한다. |
| IV. Description-Driven + Multi-Layer | **예외 있음** | L1 plugin.json, L2 handler·모듈·브리지, L3 E2E. 데이터 출처 교체는 description으로 할 수 없어 handler를 수정한다 → Complexity Tracking. |
| V. 3-Mode 일관성 | PASS | 변경은 tool 내부라 chat/query·react·@agent·embed가 같은 handler를 탄다. E2E는 @agent + embed, 평가는 chat 라우팅으로 확인한다. |
| VI. Conventional Commits | 해당(커밋 시) | `feat(hr-overtime-limit): …`. 사용자 요청 시에만 커밋한다. |
| VII. i18n | 해당 없음 | UI 문자열 변경이 없다(tool 출력은 한국어 고정, 기존과 같다). |

Convention doc: `docs/conventions/hr-skill-description-pattern.md`. T-A 유지(year_month 기존 문구 불변), 신규 주기 파라미터 없음(§6.1 N/A), `query_type` 설명 수정은 §6.2 회귀(period-golden·연도 시나리오) + §7 Location A/B/C 점검.

**Phase 1 후 재확인**: 설계 산출물(data-model·contracts)이 위 판정을 바꾸지 않는다. PASS(IV 예외 유지).

## Project Structure

### Documentation (this feature)

```text
specs/017-hr-overtime-limit/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tool-output-overtime.md
│   └── bridge-contract.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
server/storage/plugins/agent-skills/
├── _shared/overtimeStatus.js          # 신규 — 조회 계획·본인 1행 검증·렌더 (fetch 주입)
└── hr-attendance/
    ├── handler.js                     # overtime·overtime_limit → overtimeStatus, 구 PC 조회 정의 제거
    └── plugin.json                    # query_type 설명·예시

server/__tests__/storage/plugins/agent-skills/
├── overtime-status.test.js            # 신규 — 계약 §1~§5
├── hr-attendance-handler.test.js      # 연장근무 경로 기대 갱신
├── period-year-mode.test.js           # 연장근무 연도 모드 기대 갱신
├── period-golden*.test.js (+ .snap)   # 연장근무 골든 갱신
└── plugin-json-schema.test.js         # 필요 시

server/scripts/e2e-hr-skill/
├── mock-hr-api.js                     # 두 경로 fixture: 일반 달·무연장 달·다중 행 달·500 달
└── scenarios.json                     # K6·K7·KB21·K66·K68 갱신, K77~K81 신규
server/scripts/e2e-embed-hr-skill/scenarios.json   # 위젯·필터 위젯 연장근무 4건

extras/kiwibox-bridge/teamplgpt-hr-bridge.js       # 경로·searchType·필수 사번
/Users/shin-yeji/okrservice/widgets/client/messenger/widget/
├── hrBridge.ts                        # 같은 규칙
└── hrBridge.test.ts

docs/conventions/hr-skill-description-pattern.md   # §5/§7 연장근무 매핑 갱신(버전 올림)
```

**Structure Decision**: 기존 agent-skill 구조를 따른다. 015 `yearQuery`와 같이 네트워크를 주입받는 `_shared` 모듈로 로직을 분리해 handler 크기(672줄)를 늘리지 않고 단위 테스트를 가능하게 한다.

## 구현 메모 (tasks 입력)

1. **overtimeStatus.js 공개 함수**:
   - `planOvertime(year_month, today)` → `{kind: "current"|"month"|"year"|"future", …}` (data-model §5)
   - `runOvertime(ctx, plan, fetch)` → 문자열. 이번 달은 `Promise.all`로 3회 호출한다.
   - `toLimit(rows, type)` → PeriodLimit. 1행이 아니면 failed.
   - `renderCurrent` / `renderMonth` / `renderYear` (계약 §1~§3)
   - `formatHours(v)` → `"12.0"` | `"—"`
2. **R5 예외**(사용 null + 내역 0건 → 0.0)는 함수 하나로 격리하고 실서버 확인 뒤 유지/삭제한다.
3. **handler**: `ENDPOINT_MAP.overtime/overtime_limit`을 `{ custom: "overtimeStatus" }`로 바꾸고, 진입부에서 분기한다. 이때 `isBlockedQueryType` 검사는 기존처럼 먼저 한다. `COLUMNS_BY_QT.overtime(_limit)`, `YEAR_MODE.overtime(_limit)`, `monthTotal`·`fetchSelfMonth` 중 연장근무 전용 코드는 삭제한다(사용처가 없어질 때만).
4. **mock**: 경로별 fixture. `searchBaseSYmd` 월로 분기한다.
   - 2월 = 무연장(USE 0, Person 빈 배열)
   - 3월 = HTTP 500(K68 승계)
   - 5월 = 다중 행 3개(팀 혼입)
   - 그 외 = 일반
5. **브리지 2곳**: bridge-contract §1~§3. teamplgpt JSP 브리지는 테스트 인프라가 없다. 가능하면 `vm`으로 로드하는 jest를 추가하고, 어려우면 okrservice 테스트 + 코드 대조로 확인한다.
6. **실서버 확인**(R5)은 구현 후, 사용자에게 세션을 받아 진행한다. 결과로 R5 예외를 확정한다.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 헌장 IV handler.js 무수정 원칙 예외 | 연장근무 데이터 출처(HR 조회 경로·파라미터) 교체와 본인 1행 검증은 코드에서만 가능하다 | description만 수정하면 모델이 부를 수 있는 조회가 여전히 PC 주차별 표뿐이라 한도·잔여를 답할 수 없다. handler 증가분은 새 `_shared` 모듈로 격리해 handler 자체 변경은 분기·삭제로 한정한다 |
