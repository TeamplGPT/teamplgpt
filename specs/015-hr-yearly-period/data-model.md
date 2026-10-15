# Data Model: HR 챗봇 연도 단위 기간 질의

이 기능은 저장 데이터를 추가하지 않는다. 아래는 handler 실행 중에만 존재하는 값의 구조다.

## 1. YearPeriod (연도 단위 기간)

`resolveYearPeriod(raw, { kind, now })`의 반환값. 연도 단위가 아니면 `null`.

| 필드 | 타입 | 예 (now = 2026-10-15) | 설명 |
|---|---|---|---|
| `year` | string `YYYY` | `"2026"` | 대상 연도 |
| `start` | string `YYYYMMDD` | `"20260101"` | 항상 1월 1일 |
| `end` | string `YYYYMMDD` | `"20261015"` (record·올해) / `"20261231"` | FR-003/FR-004 규칙 |
| `months` | string[] `YYYYMM` | `["202601", …, "202610"]` | `start`~`end`에 걸친 월. 월 고정형 조회의 반복 대상 |
| `isCurrentYear` | boolean | `true` | 표시 문구("오늘까지") 결정용 |
| `label` | string | `"2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)"` | 도구 결과 "조회 기간" 줄에 그대로 쓴다 |

**검증 규칙**
- `raw`를 문자열로 바꾼 뒤 모든 공백을 제거하고 판정한다.
- 연도 단위 판정 표현과 오프셋:

| 표현 | 오프셋 |
|---|---|
| `YYYY`, `YYYY년`, `YYYY년도` | 그 연도 그대로 (`YYYY년도`는 구현 중 추가 — "2025년도 연말정산" 같은 흔한 표현) |
| 올해, 금년, 이번년도, 이번해, 당해 (+ 리뷰 보정: 올, 금년도, 이번연도, 당해년도, 당해연도) | 0 |
| 작년, 지난해, 전년도 (+ 리뷰 보정: 작년도, 지난년도, 전년) | −1 |
| 재작년 | −2 |
| 내년 | +1 |
| 내후년 | +2 |

- `YYYY`는 1900~2999만 인정한다. 그 밖의 4자리 숫자는 연도로 보지 않는다.
- (리뷰 보정 HIGH-2) 공백 제거 후 끝의 범위 강조 접미사 `전체|전부|한해|일년|동안|내내`(반복 가능)를 떼고 판정한다. "2026년 전체"·"올 한해 동안" → 연도. "3월 전체"는 떼어도 "3월"이라 `null`. "1년"은 "2021년"의 끝과 겹쳐 넣지 않는다. 가드 4항이 "표현 그대로 전달"을 지시하므로 모델이 이런 원문을 넘길 수 있다.
- 위 표에 없는 입력(월·일 포함, 빈 값, `undefined`)은 `null`을 반환한다.
- `kind`가 `"record"`이고 대상 연도가 올해일 때만 `end` = 오늘이다. 그 외에는 `end` = 12월 31일이다.
- `now`의 날짜는 서울 기준으로 계산한다(`[HR_DATE_CONTEXT]`와 동일 기준).

## 2. PeriodKind (조회 성격)

각 query_type에 정적으로 붙는 값. `"record"` 또는 `"schedule"`.

| skill | record (실적 기록) | schedule (일정) |
|---|---|---|
| hr-attendance | timesheet, work_status, overtime, overtime_limit, leave_requests | work_calendar, vacation_calendar |
| hr-personnel | — | schedule_day, birthday, schedule_titles |
| hr-salary | pay_periods, salary_statement, daylabor | — |
| hr-approval | pending, drafted, completed, rejected, referenced | — |
| hr-year-end-tax | (연도만 사용 — kind 무관) | — |

**구현 보정 (T028·T029)**: `yearOnly` 모드인 leave_requests·salary_statement는 요청이 항상 그해 1/1~12/31(휴가·회계연도 칸, `findText=YYYY`)이다. 머리 줄이 "오늘까지"라고 적으면 실제 조회 범위보다 좁게 표기되므로, 이 둘은 `resolveYearPeriod` 호출 시 `kind: "schedule"`을 넘겨 "(YYYY년 전체)"로 표기한다. 실적 성격 분류(위 표)는 그대로다.

## 3. YearQueryMode (연도 질의 처리 방식)

query_type별로 정적으로 정하는 값.

| 모드 | 동작 | 대상 |
|---|---|---|
| `range` | `start`~`end`를 기존 기간 파라미터 이름에 넣어 1회 호출 | timesheet, work_status, vacation_calendar, work_calendar(D7 — 실서버 확인 전제), daylabor, approval 5종, schedule_day, birthday, schedule_titles |
| `monthly` | `months`의 각 월로 기존 월 단위 요청을 그대로 만들어 순차 호출 후 병합 | overtime, overtime_limit, pay_periods |
| `yearOnly` | 기존 연도 파라미터에 `year`만 넣음 | leave_requests(휴가·회계연도), salary_statement(findText), year-end-tax(cal_yy) |
| (없음) | 연도 표현이 와도 기존 경로 | annual_leave_balance, education, welfare, certificate, payslip 계열 등 |

## 4. MonthlyMergeResult (월별 병합 결과)

`monthly` 모드의 내부 결과.

| 필드 | 설명 |
|---|---|
| `perMonth` | `[{ ym, records }]` — 성공한 달만, 월 오름차순 |
| `emptyMonths` | 조회는 성공했지만 데이터가 없는 달 |
| `failedMonths` | `[{ ym, reason }]` — hrFetch가 `errorMessage`를 돌려준 달 |

**규칙**
- **첫 번째 달이 실패하면 즉시 중단하고 그 `errorMessage`를 그대로 반환한다.** 세션 만료·연동 미구성·위젯 닫힘처럼 모든 달이 실패할 원인일 가능성이 높아서, 남은 달을 헛되이 호출하지 않는다. 이 방식은 오류 문구를 판별하지 않으므로 `_shared/hrSession.js`를 수정하지 않는다.
- 두 번째 달부터 실패한 달은 `failedMonths`에 기록하고 나머지 달은 계속 조회한다.
- 모든 달이 데이터 없음이면 기존 "조회 결과가 존재하지 않습니다" 문구에 조회 기간을 붙여 반환한다.
- **시간 예산 60초**: 매 호출 전에 누적 경과 시간을 확인한다. 60초를 넘었으면 남은 달은 호출하지 않고 `failedMonths`에 사유 "시간 초과"로 기록한다(research R3 — tool 실행 전체 상한이 없어 handler가 직접 막는다).
- **급여 지급 회차 중복 제거**: 지급 건 코드(`CODE`)가 같은 행은 한 번만 넣는다.
- 결과 머리에 "조회 기간" 줄을 붙인다. `failedMonths`가 있으면 "조회되지 않은 달: …" 줄을 붙이고, 합계 표기를 "조회된 달 합계"로 바꾼다.

## 5. 상태 전이

없음. 요청마다 새로 계산하고 버린다.
