# Implementation Plan: HR 챗봇 연도 단위 기간 질의 지원

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-hr-yearly-period/spec.md`

## Summary

월 없이 연도만 말한 질문("올해", "이번년도", "2026년", "작년" 등)을 모든 기간형 HR 조회에서 그해 기준으로 처리한다.

- **공용 기간 해석 함수** `resolveYearPeriod`를 `_shared/periodResolver.js`에 새로 둔다.
  - 연도 단위 표현이면 기간(시작·종료·월 목록)을 돌려준다.
  - 아니면 `null`을 돌려주고, handler는 기존 경로를 그대로 탄다. 이것이 "기존 질문 영향 0"의 구조적 보장이다.
- **handler 4+1개**(근태·인사·급여·결재 + 연말정산)는 query_type별로 처리 방식을 정적으로 정한다.
  - range: 범위 1회 호출
  - monthly: 월별 순차 호출 후 병합
  - yearOnly: 연도만 전달
- **시스템 지시** 4번 규칙만 고쳐 모델이 연도 표현을 생략·변환하지 않게 한다.
- **회귀 증명**: 변경 전 월 단위 요청·결과를 골든 스냅샷으로 고정하고, 변경 후 완전 일치를 확인한다.

## Technical Context

**Language/Version**: Node.js 18 (teamplgpt server, CommonJS). `.nvmrc` = v18.18.0. 이 환경에서는 nvm의 v18.19.0으로 실행 검증했다.

**Primary Dependencies**: 기존 `sugar-date`(dateResolver가 사용 — 이번 기능은 호출 안 함). 신규 의존성 없음.

**Storage**: N/A

**Testing**:
- jest: `server/__tests__/**` — 신규 단위·골든 테스트
- `node --test`: `_shared/__tests__/*.test.js` — 기존 dateResolver·hrSession 테스트(node:test 형식)
- 라우팅 평가: `node server/evals/hr-routing/run.js`
- E2E: `npm run e2e:hr-skill`, `npm run e2e:embed-hr-skill`

**Target Platform**: teamplgpt 서버. 운영 경로는 R1 클라이언트 위임(okrservice hrBridge가 브라우저 세션으로 kiwibox 호출).

**Project Type**: 웹 서비스 내부 플러그인(agent-skill) + 공용 모듈

**Performance Goals**:
- range 모드: 호출 1회로 기존과 같다.
- monthly 모드: 최대 12회 순차(오늘 기준 10회). 정상 시 10~24초다. tool 실행 전체 상한이 없으므로 handler가 **누적 60초 예산**으로 끊는다(research R3).

**Constraints**:
- 월 단위·기간 없음 질의의 kiwibox 요청과 도구 결과가 변경 전과 완전히 같아야 한다(FR-002, SC-002).
- 본인 강제(`$SELF_STAFF_ID`) 경로만 쓴다. 신규 엔드포인트 없음(FR-014).
- `_shared/dateResolver.js`·`_shared/hrSession.js`는 수정하지 않는다.

**Scale/Scope**:
- 신규 2파일:
  - `_shared/periodResolver.js`: 순수 함수 — 연도 판정과 기간 계산
  - `_shared/yearQuery.js`: 조회 도우미 — 월별 순차 호출(첫 달 실패 중단·60초 예산), 조회 기간 머리 줄, `HH:MM` 합산
- 수정 6파일: handler 5개 + `hrSkillGuard.js`
- 테스트 인프라: E2E runner·mock
- 영향 query_type: `year_month`를 쓰는 18종(근태 7·인사 3·급여 3·결재 5) + 연말정산 9종(`cal_yy`). data-model §3 참고

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| §I 최소 범위 + 업스트림 발산 | 통과 | 변경은 fork 전용 파일(HR agent-skill, `hrSkillGuard.js`)에만 있다. 업스트림 파일 수정 없음. 기존 공용 모듈 무수정, 신규 파일로 격리 |
| §II 스펙 비례 | 통과 | 파라미터 의미 변경(`year_month`가 연도 단위를 받음) + 다중 파일 → 스펙 경로 진행 중 |
| §III E2E-First | 계획 반영 | tasks에서 라우팅 평가 케이스와 E2E 시나리오를 코드 수정 **전에** 추가하고 FAIL을 확인한다. E2E 실행은 서버·Postgres가 필요해 사용자 환경에서 한다 |
| §IV Description-Driven + Multi-Layer | 통과 (spec D6) | L1: 시스템 지시 4번 규칙. L2: handler 기간 생성·결과 머리 줄·축약·월별 병합. L3: 라우팅 평가 + E2E + 골든. handler 수정은 LLM 행태 제어가 아니라 조회 기간 생성(코드 계층 소관) |
| §V 3/4-Mode 일관성 | 통과 | handler와 `hrSkillCommonLines()`를 chat/query·react·@agent·embed가 공유한다(research R6). 모드별 분기 코드 없음 |
| §VI 커밋 | 준수 | 사용자 요청 시에만 커밋 |
| §VII i18n·non-Latin | 해당 | 한글 표현 인식 함수 → 공백·접미사 "년" 경계 케이스 테스트 필수(contracts/period-resolver.md 테스트 벡터) |

## Project Structure

### Documentation (this feature)

```text
specs/015-hr-yearly-period/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — 검증 실행 가이드
├── contracts/
│   ├── period-resolver.md     # 공용 함수 인터페이스·테스트 벡터
│   ├── tool-output-year.md    # 연도 질의 도구 결과 형식
│   └── guard-rule.md          # 시스템 지시 4번 규칙 변경 전/후
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server/storage/plugins/agent-skills/
├── _shared/
│   ├── periodResolver.js        # 신규 — resolveYearPeriod (순수 함수)
│   ├── yearQuery.js             # 신규 — runMonthly·formatPeriodHeader·sumHHMM
│   └── __tests__/               # (기존 node:test — 무수정)
├── hr-attendance/handler.js     # range·monthly·yearOnly(leave_requests)
├── hr-personnel/handler.js      # range(schedule_day·birthday·schedule_titles)
├── hr-salary/handler.js         # monthly(pay_periods)·yearOnly(salary_statement)·range(daylabor)
├── hr-approval/handler.js       # range(5종)
└── hr-year-end-tax/handler.js   # yearOnly(cal_yy)

server/utils/hrSkillGuard.js     # 4번 규칙만 수정

server/__tests__/storage/plugins/agent-skills/
├── period-resolver.test.js              # 신규 — 계약 테스트 벡터
├── period-golden.test.js                # 신규 — 월 단위 요청·결과 골든(변경 전 캡처)
├── __snapshots__/period-golden.test.js.snap
├── period-year-mode.test.js             # 신규 — 연도 모드 요청·머리 줄·축약·월별 병합
└── hr-attendance-year-range.test.js     # 삭제 — spec D8 흡수

server/evals/hr-routing/dataset.jsonl    # 연도 질의 케이스 추가
server/scripts/e2e-hr-skill/
├── scenarios.json       # 연도 질의 시나리오 추가
├── runner.js            # min_hr_calls · mock_body_pattern_any 추가 (research R8)
└── mock-hr-api.js       # OT 2종 fixture, CommonCode 월별 코드 (research R8)
server/scripts/e2e-embed-hr-skill/scenarios.json   # 연도 질의 시나리오 추가
```

okrservice 수정 없음(research R4 — 필요한 cmd가 hrBridge 허용 목록에 이미 있고, 날짜 값 검증이 없다).

**Structure Decision**: 신규 공용 모듈 1개 + 기존 handler 국소 수정. 모든 handler에서 분기는 "`resolveYearPeriod` 결과가 `null`이 아니면"으로 시작하는 한 블록이다. 기존 코드는 그 블록의 `else`로 그대로 남는다. 골든 스냅샷은 수정 전 커밋(HEAD) 상태에서 캡처한다.

## Implementation Approach

### 단계 0 — 기준선 고정 (코드 수정 전)

1. 미커밋 근태 변경(`resolveYearOnlyExpression` + `hr-attendance-year-range.test.js`)을 되돌려 HEAD 상태로 만든다(spec D8). 이 변경은 이 세션에서 만든 것이고 커밋된 적 없다.
2. 골든 테스트를 작성하고 HEAD 코드로 스냅샷을 만든다.
   - 입력: `year_month` 18종 × 월 단위 입력 4종("3월", "지난달", "202503", 기간 없음), 그리고 연말정산 9종 × 기존 유효 입력 3종("2024", "작년", 기간 없음)
   - 캡처 대상: kiwibox 요청 `{path, form}`, 고정 mock 응답에 대한 도구 결과 문자열
   - 시계: jest fake timers로 2026-10-15T12:00:00+09:00 고정
   - 전송: handler의 `clientToolTransport`를 mock해 요청을 가로챈다
3. 기존 테스트 통과 목록을 기록한다(jest + node --test).
4. 라우팅 평가 전체 137건 × 2회를 실행해 기준선을 기록한다. OpenAI 호출만 하며 HR 시스템은 호출하지 않는다.

### 단계 1 — L3 먼저 (E2E-First)

5. 라우팅 평가 데이터셋에 연도 질의 케이스를 추가한다. 예상 FAIL: 모델이 "올해"를 생략하는 경우.
6. E2E 러너·mock을 확장하고(research R8), 연도 질의 BODY 검증 시나리오를 추가한다. 예상 FAIL: 1월만 조회.
7. 연도 모드 단위 테스트(`period-year-mode.test.js`)를 작성하고 FAIL을 확인한다.

### 단계 2 — 구현

8. `periodResolver.js` + 계약 테스트 벡터 통과
9. handler 5개에 연도 블록 추가(range → yearOnly → monthly 순)
10. 결과 형식 구현(머리 줄 → 하루 단위 축약 → 월별 병합)
11. `hrSkillGuard.js` 4번 규칙 교체

### 단계 3 — 검증 (quickstart.md)

12. 골든 완전 일치 · 기존 테스트 기준선 대비 증감 없음 · 신규 테스트 통과
13. 라우팅 평가 2회 연속: 신규 실패 0건, 연도 케이스 통과
14. E2E 두 스위트 전건 통과 — 사용자 환경
15. 실서버(ntest.5240.kr) 확인 — 사용자 허용 또는 위젯 직접 확인
    - work_calendar 1년 범위 동작(D7)
    - monthly 위젯 경유
    - 본인 데이터만인지
    - 연장근무 합계 형식(`HH:MM`)

## Constitution Check — Phase 1 이후 재확인

| 원칙 | 판정 | 설계 반영 |
|---|---|---|
| §I | 통과 | okrservice·업스트림 파일 무수정. 테스트 인프라(runner·mock) 확장은 fork 전용 파일 |
| §III | 통과 (조건부) | E2E는 서버 폴백 경로만 검증한다. R1(위젯) 다중 위임은 quickstart 실서버 항목으로 보완한다. 완료 보고 시 이 한계를 명시한다 |
| §IV | 통과 | L2 결과 머리 줄이 L1 규칙("조회 기간보다 넓게 말하지 말 것")의 근거 데이터를 제공한다. 두 층이 짝을 이룬다 |
| §V | 통과 | react는 HR handler를 실행하지 않아 영향 없음(research R6) |

## Complexity Tracking

없음. 헌장 위반 사항이 없다. 신규 공용 모듈 1개는 기존 공용 모듈 수정(회귀 위험)보다 단순한 대안으로 채택했다(spec D3).
