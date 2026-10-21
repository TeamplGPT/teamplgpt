# Implementation Plan: HR 챗봇 월 근무시간 게이지

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-hr-work-hours-gauge/spec.md`

## Summary

근무현황 답변과 근무시간 질문에 5240 홈 "월별 근무현황"의 값(누적 근로·월간 소정·최대 가능·소정까지)을 막대 하나(A안)로 붙인다.

- **조회**: `/Home.do?cmd=getHomeWorkStatusBarWidgetMap` (research R1). 대상은 항상 본인 마커, 이번 달은 오늘·지난 달은 말일 기준(R4).
- **새 공유 모듈** `_shared/workHours.js`: 조회 계획(이번 달/지난 달/오지 않은 달/연 단위), 응답 검증(R3), 표 렌더(contracts/tool-output-work-hours.md). fetch 주입으로 단위 테스트.
- **handler**: 신규 `query_type: work_hours` 분기, 월 단위 `work_status`는 근무현황 조회와 근무시간 조회를 병렬로 하고 근무시간 표를 앞에 붙인다(R7).
- **브리지 세 곳**: `/Home.do` 경로·cmd 1개·필수 사번·허용 키(contracts/bridge-contract.md).
- **위젯**: 머리글로 표를 알아보고 `WorkHoursGauge`로 그린다(contracts/widget-work-hours-gauge.md). 게이지를 모르는 화면은 표.
- **L1**: plugin.json `query_type` enum·설명(차이 축)·examples, `year_month` 사용 목록(Convention §7.1). 공통 가드는 바꾸지 않는다.
- **L3**: E2E(@agent + 위젯) 시나리오를 먼저 추가해 FAIL 확인, 라우팅 평가 케이스(근무시간·경계), 단위 테스트, 실서버 대조.

## Technical Context

**Language/Version**: Node.js 18 (teamplgpt server, CommonJS). okrservice 위젯 TypeScript + React(jest, @testing-library).

**Primary Dependencies**: 신규 의존성 없음. 재사용: `_shared/hrSession.hrFetch`·`SELF_STAFF_ID_MARKER`·`todayYmd`, `_shared/dateResolver.resolveDateParam`, `_shared/periodResolver.resolveYearPeriod`, `_shared/formatTable.safeCell`·`ANSWER_GUIDE`, `_shared/staffParams`, 위젯 `chatbotTheme`·`markdownTableUtils.cellText/plainNumber`, framer-motion(기존 사용 중).

**Storage**: N/A

**Testing**:
- jest `server/__tests__/storage/plugins/agent-skills/**`, `server/__tests__/extras/kiwibox-bridge.test.js`
- okrservice `widgets` jest(`hrBridge.test.ts`, `MarkdownTable.test.tsx`, `markdownTableUtils.test.ts`, 신규 `WorkHoursGauge.test.tsx`)
- E2E `server/scripts/e2e-hr-skill`·`e2e-embed-hr-skill`(mock `/Home.do` fixture)
- 라우팅 평가 `server/evals/hr-routing/run.js`

**Target Platform**: teamplgpt 서버 hr-attendance tool(chat/query·embed 위젯·@agent 공통), 위젯 브리지(okrservice), HR 페이지 JSP 브리지.

**Project Type**: 웹 서비스 내부 agent-skill + 브라우저 브리지 + 위젯 UI

**Performance Goals**: work_hours는 HR 호출 1회. 월 단위 work_status는 2회 병렬(근무현황 응답 지연 없음).

**Constraints**:
- kiwibox 읽기 전용
- 내부값·신상 비노출(FR-013)
- 지어내기 금지: 값 없음 → "—"(FR-006), 계산 금지(FR-003, 최대 가능 = 5240 화면과 같은 합만)
- 세션 정보는 env로만, 실서버 호스트 ntest.5240.kr만

**Scale/Scope**:
- teamplgpt: 신규 2(모듈·테스트) + 수정 약 8(handler, plugin.json, staffParams, JSP 브리지, mock, 시나리오 2, 평가 데이터) + 문서(컨벤션·HR-SKILL-GUIDE)
- okrservice: 신규 2(게이지·테스트) + 수정 4(MarkdownTable, utils, hrBridge, 테스트)

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위 + 업스트림 발산 최소화 | PASS | 변경은 fork 전용 파일(agent-skills, extras, okrservice)뿐. upstream(aibitat, chats) 수정 없음. 연 단위·주 단위·"전주까지 기준 소정"은 범위 밖(spec D5). |
| II. 스펙은 규모에 비례 | PASS | 외부 조회 추가 + 브리지 3곳 + 신규 query_type + 위젯 → 트랙 5. spec 승인 완료(2026-10-21). |
| III. E2E-First | PASS(계획) | tasks에서 시나리오·평가 케이스 추가 → FAIL 확인 → 구현 → 전건 PASS 순서. |
| IV. Description-Driven + Multi-Layer | **예외 있음** | L1 plugin.json(enum·설명·examples), L2 handler·모듈·브리지 3곳·응답 검증, L3 E2E·평가. 새 조회는 description으로 만들 수 없어 handler 수정 → Complexity Tracking. |
| V. 3-Mode 일관성 | PASS | tool 내부 변경이라 chat/query·react·@agent·embed가 같은 handler를 탄다. 게이지는 위젯만, 다른 모드는 같은 표(spec D12·D13). E2E는 @agent + embed. |
| VI. Conventional Commits | 해당(커밋 시) | `feat(hr-work-hours-gauge): …`, 사용자 요청 시에만. |
| VII. i18n | 해당 | 위젯 새 문자열("근무시간", "시간 근로", "소정", "최대", "조회하지 못했습니다")은 기존 차트 컴포넌트처럼 한국어 고정 — 위젯 챗봇 영역은 HR 데이터 표시라 ko 전용(LimitGauge와 같음). en 동시 반영 대상 아님을 tasks에 명시. |

Convention doc: `docs/conventions/hr-skill-description-pattern.md`. 신규 query_type → §7.1 3-Location 동시 수정(A 정체성 문장에 "월 근무시간", B 설명·차이 축, D examples 4형태 중 생략·월만·상대 표현). T-A 유지(year_month 문구 불변, 사용 목록에 work_hours 추가). 신규 주기 파라미터 없음(§7.2 N/A). §7.3 회귀(경계·전체 2회).

**Phase 1 후 재확인**: data-model·contracts가 판정을 바꾸지 않는다. PASS(IV 예외 유지).

## Project Structure

### Documentation (this feature)

```text
specs/019-hr-work-hours-gauge/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R12
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tool-output-work-hours.md
│   ├── bridge-contract.md
│   └── widget-work-hours-gauge.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
server/storage/plugins/agent-skills/
├── _shared/workHours.js               # 신규 — planWorkHours·toWorkHours·renderWorkHours·runWorkHours(fetch 주입)
├── _shared/staffParams.js             # REQUIRED_STAFF_PARAMS '/Home.do'
└── hr-attendance/
    ├── handler.js                     # work_hours 분기, 월 단위 work_status 병렬 조회 + 앞에 붙이기
    └── plugin.json                    # enum·설명·examples·year_month 사용 목록

server/__tests__/storage/plugins/agent-skills/
├── work-hours.test.js                 # 신규 — contracts/tool-output §1~§6
├── self-staff-guard.test.js           # '/Home.do' 필수 사번
└── period-golden*.test.js (+ .snap)   # work_status 골든(근무시간 표 추가) 갱신
server/__tests__/extras/kiwibox-bridge.test.js     # bridge-contract 벡터

server/scripts/e2e-hr-skill/
├── mock-hr-api.js                     # '/Home.do' fixture: 이번 달·9월(소정 초과)·8월(빈 Map)·7월(500)
└── scenarios.json                     # 근무시간·근무현황·경계·다른 직원
server/scripts/e2e-embed-hr-skill/scenarios.json   # 위젯 표 줄 글자 일치·표 없음 검사
server/evals/hr-routing/dataset.jsonl              # work_hours 케이스 + overtime 경계

extras/kiwibox-bridge/teamplgpt-hr-bridge.js       # 경로·cmd·필수 사번·허용 키 (+ README 오류 표)

/Users/shin-yeji/okrservice/widgets/client/messenger/
├── widget/hrBridge.ts (+ __tests__/hrBridge.test.ts)
└── components/chatbot/
    ├── WorkHoursGauge.tsx             # 신규
    ├── __tests__/WorkHoursGauge.test.tsx  # 신규
    ├── markdownTableUtils.ts          # workHoursTable(headers)
    └── MarkdownTable.tsx              # 판별 시 게이지 렌더

docs/conventions/hr-skill-description-pattern.md   # v1.10 — work_hours 매핑·경계
HR-SKILL-GUIDE.md                                  # hr-attendance 행에 work_hours
```

**Structure Decision**: 017 `overtimeStatus`와 같은 구조 — 네트워크를 주입받는 `_shared` 모듈에 로직을 두고 handler(648줄)는 분기와 합치기만 한다. 위젯은 `LimitGauge`와 나란한 신규 컴포넌트.

## 구현 메모 (tasks 입력)

1. **workHours.js 공개 함수**
   - `planWorkHours(year_month, today)` → data-model §3
   - `toWorkHours(records, plan)` → data-model §2 (R3 검증, R5 파싱)
   - `renderWorkHoursTable(plan, wh)` → 표 + 정보 줄(contracts §1~§3) — work_status 합치기에도 사용
   - `runWorkHours(plan, fetch)` → work_hours tool 결과 전체 문자열(§1~§4 + 응답 형식 줄 + ANSWER_GUIDE)
   - `formatHours(v)` → `"82.5"` | `"—"` (017 것과 같은 규칙이면 공유)
2. **handler**: `ENDPOINT_MAP.work_hours = { custom: "workHours" }`. `isBlockedQueryType` 검사 뒤 분기. 월 단위 work_status(yearPeriod가 null인 경로)에서 `Promise.all([기존 hrFetch, runWorkHoursSection])` 후, 근무현황 출력의 제목 줄 다음에 근무시간 블록을 넣는다(§5). 근무현황 쪽 오류면 기존 오류 문구만 반환.
3. **mock**: `searchYmd` 월로 분기 — 이번 달 `{workT:82.5, basTime1:171, basTime2:53, remT:"88.5"}`, 9월 `{workT:176, basTime1:168, basTime2:52, remT:"-8"}`, 8월 `{Map:{}}`, 7월 HTTP 500. 그 밖 cmd는 404.
4. **E2E 시나리오**(먼저 추가 → FAIL 확인)
   - 위젯: "이번 달 몇 시간 일했어?"(근무시간 표 줄 일치 + 근무판정 머리글 없음), "이번 달 근무현황 알려줘"(두 표), "9월에 몇 시간 일했어?"(`searchYmd=2026-09-30` + 9월 줄), "8월 근무시간"(— 줄 + 조회하지 못했습니다), "이번 달 야근 몇 시간 했어?"(overtime 경로, `/Home.do` 호출 없음)
   - @agent: 같은 질문의 tool 호출·요청 본문 검사(표 직접 출력 없음)
   - 다른 직원: "김OO 이번 달 몇 시간 일했어?" → 조회 없음
5. **평가 케이스**: work_hours 정규·구어·간접 3건 이상, overtime 경계 2건, 근무현황 유지 1건(복사 금지 — 패러프레이즈).
6. **위젯**: `workHoursTable` → 게이지 렌더 분기는 `limitTableKind`보다 먼저. 테스트 벡터는 contracts 표.
7. **실서버**(마지막 task): quickstart §4, 결과로 research R3·R5 갱신.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| handler.js 수정(헌장 IV "handler 무수정 원칙") | 새 HR 조회와 work_status 병렬 조회는 description으로 만들 수 없다 | description만 고치면 모델이 근무시간을 지어내거나 다른 조회로 대신한다(017과 같은 예외). 로직은 `_shared/workHours.js`로 분리해 handler 변경은 분기·합치기만 |
