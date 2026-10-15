# Data Model: HR 챗봇 다른 직원 정보 차단

저장 데이터는 추가하지 않는다. 아래는 코드에 정적으로 두는 값이다.

## 1. 제공 중단 조회 (BlockedQueryTypes)

`_shared/otherEmployee.js`에 둔다.

| skill | 제공 중단 query_type | 남는 query_type |
|---|---|---|
| hr-attendance | vacation_calendar | annual_leave_balance, timesheet, work_status, work_calendar, leave_requests, overtime, overtime_limit |
| hr-personnel | birthday | profile, profile_detail, org_tree, org_members, todo_count, schedule_day, schedule_titles, education |
| hr-approval | pending, completed, rejected, referenced | drafted |

규칙:
- 제공 중단 query_type이 오면 HR 호출 없이 `OTHER_EMPLOYEE_REFUSAL`을 반환한다.
- 문구: `> ⚠️ 다른 직원의 정보는 제공하지 않습니다. 본인 정보만 조회할 수 있어요.`
- 목록에 없는 잘못된 query_type은 기존 "가능한 값" 안내를 그대로 쓴다(남는 값만 나열).

## 2. 조직도 표시 항목 (OrgChartFields)

| 조회 | 표시 | 숨김 |
|---|---|---|
| org_tree | 조직명(ORG_NM)·조직전체명(ORG_FNM)·조직장(CHIEF_INFO)·인원수(STAFF_CNT)·조직코드(ORG_CD)·상위조직코드(PRIOR_ORG_CD) — 기존과 같다 | (기존과 같다) |
| org_members | 성명(STAFF_NM)·소속(ORG_NM)·직위(POS_NM)·직책(RES_NM) | 사번(STAFF_NO)·회사(CORP_NM)·근무정보(WORK_TYPE)·근무상황(WORK_INFO) |

## 3. 본인 데이터 안내 (SelfDataNotice)

`server/utils/hrSelfDataNotice.js`에 둔다.

| 항목 | 값 |
|---|---|
| 적용 대상 | 이름이 `hr-`로 시작하는 tool의 문자열 결과 |
| 예외 | `hr-personnel`의 `query_type` ∈ {org_tree, org_members} |
| 위치 | 결과 끝, 빈 줄 하나 뒤 |
| 문구 | contracts/self-data-notice.md |
| 입력 불변 | 원래 결과 문자열을 바꾸지 않고 새 문자열을 반환한다 |

판정 입력은 `(toolName, args, result)`다. `args`는 객체 또는 JSON 문자열이고, 파싱에 실패하면 예외 없이 "예외 아님"(안내 부착)으로 본다.

## 4. 상태 전이

없음.
