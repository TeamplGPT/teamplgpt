# Implementation Plan: HR 챗봇 다른 직원 정보 차단 (조직도만 예외)

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-hr-other-employee-block/spec.md`

## Summary

다른 직원 정보는 조직도(조직 구조 + 조직원 이름·소속·직위·직책)를 빼고 어떤 질문에도 답하지 않게 한다. 세 층으로 막는다.

- **L1 시스템 지시**
  - 공통 지시 10항: 다른 직원 지칭 질문이면 tool 없이 거절한다. [ORDER] 예외 단서를 둔다(즉시 완화로 작업 트리에 반영됨, 이 기능에서 확정·보완).
  - 3개 skill 설명에서 제거 조회의 선택지와 설명을 삭제한다.
- **L2 코드**
  - 제공 중단 조회(휴가 캘린더·생일자·결재함 미결/기결/반려/참조)는 handler 진입 즉시 고정 거절 문구를 반환한다. HR 시스템은 호출하지 않는다.
  - 조직원 목록 렌더는 이름·소속·직위·직책만 남긴다.
  - 조직도를 뺀 모든 HR tool 결과 **끝**에 "본인 데이터" 안내 한 줄을 붙인다. 채팅·embed 루프와 @agent 경로가 같은 모듈을 쓴다. handler 출력 자체는 바꾸지 않으므로 015 골든은 유지된다.
- **위젯 주의 (research R10)**: 전체 허용 위젯은 첫 응답에 tool 호출이 강제된다. L1 "tool 없이 거절"이 그 경로에서는 불가능하므로, 위젯에서는 L2 본인 데이터 안내가 실질 방어선이다.
- **L3 검증**
  - 라우팅 평가: 다른 직원 지칭 10건 이상을 추가하고, 제거 조회 기대 18건의 기대값을 갱신한다.
  - E2E: 거절 시나리오를 추가하고 K8·K58을 갱신한다.
  - 단위 테스트: 거절·컬럼·안내 부착을 검증한다.

## Technical Context

**Language/Version**: Node.js 18 (teamplgpt server, CommonJS). 실행 검증은 nvm v18.19.0.

**Primary Dependencies**: 신규 의존성 없음.

**Storage**: N/A

**Testing**:
- jest `server/__tests__/**`, `server/utils/**/__tests__/**`
- 라우팅 평가 `node server/evals/hr-routing/run.js` (OpenAI만 호출)
- E2E `server/scripts/e2e-hr-skill`, `e2e-embed-hr-skill` (서버·Postgres 필요. 3001 점유 시 `SERVER_PORT`·`E2E_SERVER_URL`로 다른 포트)

**Target Platform**: teamplgpt 서버. 채팅/query·embed(위젯)·@agent 경로.

**Project Type**: 웹 서비스 내부 플러그인(agent-skill) + 채팅 도구 실행 계층

**Performance Goals**: 영향 없음. 안내 한 줄 추가, 제거 조회는 호출 자체가 사라진다.

**Constraints**:
- 본인 조회 질문의 요청·결과는 바뀌지 않아야 한다(FR-009). handler 출력은 안 바꾸고, 015 골든은 제거 조회 스냅샷만 의도적으로 정리한다(spec D8).
- 신규 HR 엔드포인트 없음(FR-011).
- `loop.js`의 오류·가드 판정(`startsWith("Error")`, `startsWith("> ⚠️")`)이 깨지지 않게 안내는 결과 끝에 붙인다.

**Scale/Scope**:

| 구분 | 파일 |
|---|---|
| 신규 | `server/utils/hrSelfDataNotice.js` — 본인 데이터 안내 부착·조직도 예외 판정 |
| 신규 | `server/storage/plugins/agent-skills/_shared/otherEmployee.js` — 거절 문구·제공 중단 조회 목록 |
| 수정 (skill) | handler 3개(attendance·personnel·approval), plugin.json 3개 |
| 수정 (공통) | `server/utils/hrSkillGuard.js`(10항 보완), `server/utils/chats/toolCalling/loop.js`, `server/utils/agents/imported.js`(업스트림 파일 — 최소 diff) |
| 테스트 인프라 | `server/scripts/e2e-hr-skill/runner.js`(`mock_body_pattern_none`), mock·시나리오 2스위트, 평가 데이터셋 |
| 선택 (D10) | okrservice `widgets/client/messenger/widget/hrBridge.ts` 허용 목록 |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| §I 최소 범위 + 업스트림 발산 | 통과 (조건부) | `agents/imported.js`는 업스트림 파일이다. 감싸기 한 줄 + require 한 줄로 최소 diff를 지킨다. 로직은 신규 fork 파일(`hrSelfDataNotice.js`)에 격리한다 |
| §II 스펙 비례 | 통과 | 파라미터 계약(query_type enum) 구조 변경이라 스펙 경로 진행 중 |
| §III E2E-First | 계획 반영 | 평가 케이스는 이미 추가해 FAIL(0/7)을 확인했다. tasks에서 E2E 시나리오·단위 테스트를 코드 수정 전에 작성하고 FAIL을 확인한다 |
| §IV Description-Driven + Multi-Layer | 통과 (spec D7) | L1 description·공통 지시 / L2 handler 거절·컬럼·결과 안내 / L3 평가·E2E·단위. handler 수정은 조회 차단·렌더(코드 계층 소관)이고 LLM 행태 제어가 아니다 |
| §V 3/4-Mode 일관성 | 통과 | 공통 지시는 chat/query·embed·@agent가 공유한다. 결과 안내는 loop.js(chat/query·embed)와 imported.js(@agent) 두 곳에서 같은 모듈을 쓴다. react 모드는 HR handler를 실행하지 않는다 |
| §VI 커밋 | 준수 | 사용자 요청 시에만 커밋 |
| §VII i18n·non-Latin | 해당 | 거절 문구·안내는 한국어 전용 응답 재료다. UI 문자열 변경은 없다 |

## Project Structure

### Documentation (this feature)

```text
specs/016-hr-other-employee-block/
├── spec.md
├── plan.md                 # 이 파일
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1
├── contracts/
│   ├── guard-rule.md               # 공통 지시 10항·[ORDER] 단서
│   ├── blocked-query-types.md      # 제공 중단 조회·거절 문구·skill 설명 변경
│   ├── self-data-notice.md         # 본인 데이터 안내 문구·부착 위치·예외
│   └── test-expectations.md        # 평가·E2E 기대값 변경 목록
├── checklists/requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server/utils/
├── hrSkillGuard.js                       # 10항 보완(휴가자·생일자·남의 결재 문서 포함)
├── hrSelfDataNotice.js                   # 신규
├── chats/toolCalling/loop.js             # 결과 전달 직전 안내 부착
└── agents/imported.js                    # @agent handler 감싸기(업스트림 최소 diff)

server/storage/plugins/agent-skills/
├── _shared/otherEmployee.js              # 신규 — 거절 문구·목록
├── hr-attendance/{handler.js,plugin.json}   # vacation_calendar 제거
├── hr-personnel/{handler.js,plugin.json}    # birthday 제거, org_members 컬럼 축소
└── hr-approval/{handler.js,plugin.json}     # drafted만

server/__tests__/
├── storage/plugins/agent-skills/other-employee-block.test.js   # 신규
├── utils/hrSelfDataNotice.test.js                              # 신규
└── storage/plugins/agent-skills/period-*.test.js               # 제거 조회 케이스 정리(D8)

server/evals/hr-routing/dataset.jsonl     # oth-* 추가, 18건 기대값 갱신
server/scripts/e2e-hr-skill/{runner.js,mock-hr-api.js,scenarios.json,README.md}
server/scripts/e2e-embed-hr-skill/scenarios.json
```

**Structure Decision**:
- 거절과 안내는 신규 모듈 두 개로 격리한다. 각 handler에는 진입부 한 줄(제공 중단 조회면 거절 문구 반환)만 추가한다.
- 제거 조회의 ENDPOINT_MAP·라벨·컬럼·렌더 코드는 삭제한다. 죽은 코드를 남기지 않는다.
- 안내는 handler 출력이 아니라 "모델에 넘기는 계층"에 붙인다. 그래서 015 골든(handler 직접 실행)은 제거 조회 스냅샷 외에는 그대로다.

## Implementation Approach

### 단계 0 — 기준선 (코드 수정 전)

1. 단위 테스트 전체와 통과 목록을 기록한다. 015 최종 상태(1161 통과)가 기준이다.
2. 라우팅 평가 기준선은 즉시 완화 가드(E4)의 2회 측정을 쓴다: 151/158·152/158, 기준선 7건 외 실패 0.

### 단계 1 — L3 먼저 (E2E-First)

3. 평가 데이터셋을 바꾼다.
   - 다른 직원 지칭 케이스를 10건 이상으로 늘린다(소속·사번·생일 지칭 포함).
   - 제거 조회 기대 18건을 contracts/test-expectations.md대로 바꾼다.
4. E2E를 준비한다.
   - runner에 `mock_body_pattern_none`(기록된 어떤 요청 body와도 맞지 않아야 함)을 추가한다.
   - 시나리오: K8·K58을 거절 기대로 바꾸고, 다른 직원 연차(@agent·embed)·남이 올린 결재 목록·미결 건수·조직도 사번 미노출 시나리오를 추가한다(contracts/test-expectations.md §3·§4).
5. 단위 테스트를 쓰고 FAIL을 확인한다.
   - 제공 중단 조회 6종: 호출 0건 + 거절 문구
   - org_members 컬럼
   - 안내 부착(조직도 예외, 오류·가드 판정 유지)
   - @agent 감싸기의 `this` 보존

### 단계 2 — 구현

6. `_shared/otherEmployee.js` → handler 3개 진입부 거절 + 제거 코드 삭제 → org_members 컬럼 축소
7. plugin.json 3개: enum·description·examples 정리. 결재는 단일값형(`drafted`), 경계 문구 갱신.
8. `hrSelfDataNotice.js` → loop.js 부착 → imported.js 감싸기
9. 가드 10항 보완: 휴가자·생일자·남이 올린 결재 문서도 같은 거절 대상임을 명시한다.

### 단계 3 — 검증 (quickstart.md)

10. 단위·골든: 기준선 대비 통과 감소 0. 제거 조회 골든 33건은 D8 목록대로 정리한다.
11. 라우팅 평가 2회: 기대값을 바꾼 케이스 외 신규 실패 0, 다른 직원 케이스 100%, 연도 14/14.
12. EC-FILTER-03 16회: HEAD 수준(≥ 10/16)을 유지한다. 가드를 바꿨으니 015에서 찾은 회귀 조건을 다시 확인한다.
13. E2E 두 스위트 전건. 실서버·위젯에서 "김기현 연차 알려줘"(사용자 확인).

## Constitution Check — Phase 1 이후 재확인

| 원칙 | 판정 | 설계 반영 |
|---|---|---|
| §I | 통과 | 업스트림 `imported.js` 변경은 감싸기 1줄 + require 1줄. `loop.js`는 fork 파일이다 |
| §III | 통과 | 평가 FAIL은 확인됨(0/7). E2E·단위는 tasks에서 FAIL을 먼저 확인한다 |
| §IV | 통과 | 거절 문구(L2)와 공통 지시 10항(L1)이 같은 문장을 쓴다. 안내(L2)는 L1이 실패한 경우를 받는다 |
| §V | 통과 | 두 실행 경로가 같은 모듈을 쓴다. E2E가 @agent·embed 둘 다 검증한다 |

## Complexity Tracking

| 항목 | 이유 | 더 단순한 대안을 택하지 않은 이유 |
|---|---|---|
| 업스트림 파일 `agents/imported.js` 수정 | @agent 경로는 이 파일이 handler를 aibitat에 넘긴다. 결과 안내를 붙일 수 있는 유일한 공통 지점이다 | handler마다 안내를 붙이면 7개 skill 출력과 015 골든 전부가 바뀐다. `ToolExecutor`에 붙이면 기존 executor 테스트(정확한 반환값 비교)가 깨지고 @agent를 못 덮는다 |
