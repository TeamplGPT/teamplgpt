# Implementation Plan: HR 챗봇 하루·주 단위 조회

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

## Summary

"오늘 출근시각"에 한 달 표가 붙는 원인 세 곳(시스템 지시 "일 정보는 무시", 예시, 월 단위뿐인 파라미터 — research R1)을 고친다. `hr-attendance`·`hr-personnel`에 선택 파라미터 `date`(하루·주)를 추가하고, 범위 해석은 신규 `_shared/dateRange.js`, 조회·거르기는 각 handler가 맡는다(R4). `date`가 없으면 모든 결과는 지금과 같다.

## Technical Context

**Language/Version**: Node.js 18 (CommonJS)

**Primary Dependencies**: 신규 없음. 재사용: `_shared/dateResolver.resolveDateParam`(base_date), `_shared/periodCheck`(UNRESOLVED_PERIOD·cleanPeriod), `_shared/hrSession`(todayYmd), `_shared/monthHours`(seoulToday·dashed), `_shared/overtimeStatus`, `utils/hrYearGuard`.

**Testing**: jest(`agent-skills/**`, `utils/**`), E2E(@agent·위젯, mock), 라우팅 평가, 실서버 handler 직접 연결.

**Target Platform**: teamplgpt 서버 hr-attendance·hr-personnel(chat/query·embed·@agent 공통). 위젯·브리지 변경 없음(R4).

**Constraints**: `date` 없는 경우 바이트 동일(골든), 지어내기 금지, 서울 날짜, kiwibox 읽기 전용, 세션은 env로만.

**Scale/Scope**: 신규 2(모듈·테스트) + 수정 약 9(근태·인사 handler·plugin.json, overtimeStatus, hrSkillGuard, hrYearGuard, periodCheck, mock) + 시나리오·평가·문서.

## Constitution Check

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위·업스트림 발산 최소화 | PASS | fork 전용 파일만. 범위 밖(휴가 월 질문·급여·결재·증명서) 명시 |
| II. 스펙 비례 | PASS | 파라미터 계약 변경 → 트랙 5, spec 승인 완료(2026-10-23) |
| III. E2E-First | PASS(계획) | 시나리오·평가 먼저 → FAIL 확인 → 구현 |
| IV. Description-Driven + Multi-Layer | **예외** | L1 plugin.json + 가드 4항, L2 handler 범위 해석·거르기·연도 가드, L3 E2E. 조회 범위는 description으로 만들 수 없어 handler 수정 → Complexity Tracking |
| V. 3-Mode | PASS | tool 내부. E2E는 @agent + 위젯 |
| VI. Conventional Commits | 해당(커밋 시) | `feat(hr-day-week-query): …` |
| VII. i18n | 해당 없음 | UI 문자열 변경 없음 |

Convention: §5.2 형식(형식·되묻기 규칙은 `[HR_SKILL_COMMON]` 위임 — CLAUDE.md의 "[CRITICAL] 3단"은 v1.4 이전 표현), §7.2 체크리스트 전 항목(가드 4항이 `date`를 포괄하도록 수정 포함), §5.4 examples, §7.3 회귀, §6 매트릭스 갱신.

## Project Structure

```text
specs/020-hr-day-week-query/  spec.md · plan.md · research.md · data-model.md · contracts/date-param.md · quickstart.md · tasks.md

server/storage/plugins/agent-skills/
├── _shared/dateRange.js            # 신규 — resolveDateRange, inRange, monthsOf
├── _shared/periodCheck.js          # rangeProblem(date)
├── _shared/overtimeStatus.js       # 내역 범위 거르기(range 옵션)
├── hr-attendance/handler.js        # date 분기: range-both 요청, 캘린더 거르기, 연장 range, 근무시간 블록 생략
├── hr-attendance/plugin.json       # date param·설명·examples
├── hr-personnel/handler.js         # month-range에 date 범위
└── hr-personnel/plugin.json
server/utils/hrSkillGuard.js         # [HR_SKILL_COMMON] 4항
server/utils/hrYearGuard.js          # YEAR_PARAMS에 date
server/__tests__/storage/plugins/agent-skills/date-range.test.js, day-week-query.test.js (신규)
server/scripts/e2e-hr-skill/mock-hr-api.js     # 근태 fixture 실서버 형식·요청 범위 날짜
server/scripts/e2e-*/scenarios.json, server/evals/hr-routing/dataset.jsonl
docs/conventions/hr-skill-description-pattern.md (v1.11), HR-SKILL-GUIDE.md
```

## 구현 메모 (tasks 입력)

1. `resolveDateRange`(contracts §3) — 주는 서울 오늘 기준 월요일 계산, 하루는 `resolveDateParam(v,"base_date")`.
2. 근태 handler: `date` 해석 → `rangeProblem` → work_status/timesheet는 `form.searchBaseSYmd/EYmd/searchSYmd/EYmd = start ~ min(end,today)`, start>today면 안내. yearPeriod·근무시간 블록은 date가 있으면 건너뜀. 머리 정보 줄(contracts §4).
3. 캘린더: 걸친 달 조회(최대 2) 후 `rowYmd`로 거르기.
4. 연장: `runOvertime(plan, fetch, { range })` — 한도는 기존 계획(기준일 = min(end, today)의 달), 내역은 Person 1회 조회 후 범위만(구현 중 SQL 확인으로 변경).
5. 인사: month-range 분기에서 `date`가 있으면 staYmd/endYmd = 범위.
6. mock: `TAAWrkTimeStatusMgr` 요청 범위가 7일 이하면 그 날짜 행을 실서버 형식으로 생성(research R7), 월 단위 요청은 기존 고정 행 그대로. 근무캘린더·연장 내역·일정도 하루·주 시험에 필요한 날짜 행이 있도록 같은 방식.
7. 평가: 하루·주 질문 → `date` params_regex(오늘|금일|…), 월·연 질문 → `date` 없음(경계).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| handler.js 수정(헌장 IV) | 조회 범위·행 거르기는 description으로 만들 수 없다 | 설명만 바꾸면 모델이 날짜를 알아도 조회는 한 달, 표도 한 달(018 직접 출력) |
