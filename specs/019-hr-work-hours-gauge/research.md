# Research: HR 챗봇 월 근무시간 게이지

근거 파일(kiwibox, 읽기 전용):
- SQL `kiwibox/src/main/resources/kiwibox/sqlmap/SYS/CMM/Home_SQL.xml` `getHomeWorkStatusBarWidgetMap`
- 화면 `kiwibox/src/main/webapp/WEB-INF/jsp/kiwibox/SYS/CMM/home/homeWorkStatusBarWidget.jsp`
- 컨트롤러 `HomeController.getHomeWorkStatusBarWidgetMap` (`@RequestMapping(params = "cmd=getHomeWorkStatusBarWidgetMap")`, 경로 `/Home.do`)

## R1. 데이터 출처와 응답 형식

- **Decision**: `/Home.do?cmd=getHomeWorkStatusBarWidgetMap`을 쓴다. 요청 칸은 `cmmSearchStaffId`(대상 직원)와 `searchYmd`(기준일, `-` 있어도 됨) 두 개다. 응답은 `{ Map: {...} }` 하나다(`jsonView`, `mv.addObject("Map", map)`).
- 화면이 쓰는 값과 계산:

| 화면 | 계산(JSP) | 응답 키 |
|---|---|---|
| 막대 채움(누적근로시간) | `data.workT.toFixed(1)` | `workT` (= SQL `XROUND(WORK_TIME,4)`, 소정 + 시간외 포함) |
| 표시선(월간소정근로시간) | `data.basTime1` | `basTime1` |
| 막대 끝(최대근로가능시간 = 소정 + 연장근로 가능) | `data.basTime1 + data.basTime2` | `basTime1`, `basTime2` |
| "근무 이력" 표시선(전주기준 소정) | `data.basTime12` | `basTime12` — 이번 범위에서 쓰지 않음(spec D7) |
| 소정까지 | (화면 미사용) | `remT` = `CMMF_FORM_HHMM(소정 − WORK_TIME, 'R', '11')` |

- 화면은 `data.basTime1 != null`일 때만 값을 그린다(값이 없으면 그리지 않음).
- **Rationale**: 직원이 보는 화면과 같은 숫자(spec D1, SC-001). 합계·차감을 챗봇이 하지 않는다. 최대 가능의 합은 화면과 같은 방식이다(FR-003).
- **Alternatives**: 날짜별 근무현황(`TAAWrkTimeStatusMgr`)을 합산 — 소정 계산식(`TRUNC(SUM(..)*5/7)`, `LEAST(BAS_TIME1, LAW_TIME1)`)과 연장 분리 규칙을 재현해야 해 숫자가 달라질 수 있다. 기각.

## R2. 대상 직원 — 본인 고정

- **사실**: 대상 조건이 정확히 같음이다(`A.STAFF_ID = X.STAFF_ID`, `X.STAFF_ID = xTRIM(#{cmmSearchStaffId})`). 칸이 비면 맞는 행이 없다. "비면 팀 전체" 구조가 아니다. 재직 중(`OFFICE_STAT_CD = '10'`) 조건도 있다.
- **Decision**: 그래도 016·017과 같이 handler는 항상 `cmmSearchStaffId = $SELF_STAFF_ID`를 보내고, 세 곳(서버 `staffParams.REQUIRED_STAFF_PARAMS`, 위젯 `hrBridge.ts`, JSP 브리지)에 `/Home.do: ['cmmSearchStaffId']`를 넣는다(spec D10, FR-007).
- **Rationale**: 다층 방어. HR 쪽 SQL이 바뀌어도 사번 칸 없는 요청은 나가지 않는다.

## R3. "본인 한 명 분" 검증

- **사실**: 바깥 SELECT가 `GROUP BY` 없는 집계(`MIN`/`SUM`)라 결과는 항상 1행이다. 맞는 행이 없으면 모든 값이 null이고, egovMap은 null 칸을 비우거나 null로 둔다.
- **Decision**: `records`가 객체 하나이고 `basTime1`·`workT`가 숫자로 읽힐 때만 쓴다. 배열이면(브리지·mock이 배열로 감싼 경우) 길이 1일 때만 그 원소를 쓰고, 그 밖은 실패로 본다(spec D9·D10). 응답 `staffId`와 본인 비교는 하지 않는다(서버는 본인 STAFF_ID를 모른다 — 브리지가 치환).
- **실서버 확인**: 0건 응답의 실제 모양(`{Map: null}` / `{Map: {}}` / null 칸 포함).

## R4. 기준일(searchYmd)

- **사실**: 월 범위 = 기준일이 속한 달 1일~말일(`sta_ymd`, `end_ymd`). 근무 기록(G)은 `WORK_YMD BETWEEN STA_YMD AND BASE_YMD`로 **기준일까지만** 더한다.
- **Decision**: 이번 달 = 오늘(서울, `todayYmd`), 지난 달 = 그 달 말일. 오지 않은 달은 조회하지 않는다(spec D6).
- **Rationale**: 지난 달을 1일로 보내면 1일까지만 누적된다. 말일이어야 한 달 전체다(017 R6와 같은 이유 — 그 달 재직 상태도 반영).
- **실서버 확인**: 5240 홈 위젯에서 9월을 골랐을 때와 같은 값인지.

## R5. 소정까지(remT) 형식

- **사실**: `CMMF_FORM_HHMM(값, 'R', '11')` — 형식 옵션 'R','11'의 결과 모양(소수 "88.5" / 시:분 "88:30")은 함수 본문이 없어 확인하지 못했다. 같은 함수가 연장근무 `FIN_HM`에도 쓰인다.
- **Decision**: 소수면 그대로(소수 첫째 자리), `H:MM`이면 시간으로 단위만 바꾼다(분/60, 소수 첫째 자리). 그 밖이면 "—". 이번 달만 표시(spec D8).
- **실서버 확인**: `remT` 실제 문자열. 단위 변환은 계산이 아니라 표기 변경이지만, 실서버에서 소수로 오면 변환 분기는 쓰이지 않는다.

## R6. query_type 분리

- **Decision**: `hr-attendance`에 `work_hours`(월 근무시간)를 추가한다. 근무시간 질문은 이 값으로 게이지만 받는다(spec D4).
- **Alternatives**: query_type 없이 work_status에만 붙임 — 근무시간 질문도 날짜별 표가 붙어 D4 위반. 기각.
- **경계**(R10): `overtime`(야근·연장근무 시간), `work_status`(날짜별 근무현황·지각 등), `timesheet`(출퇴근 시각).

## R7. work_status 병행 조회

- **Decision**: 월 단위 work_status는 기존 조회와 근무시간 조회를 `Promise.all`로 동시에 보내고, 근무시간 표를 근무현황 결과 앞(제목 바로 아래)에 붙인다. 근무시간 쪽 실패는 그 칸만 "—"로 두고 근무현황은 그대로 낸다(spec D9). 연 단위 work_status(015 year mode)에는 붙이지 않는다(spec D5).
- **Rationale**: 응답 지연 없음(Assumptions), 실패 격리.

## R8. 표 형식과 018 표 직접 출력

- **Decision**: 표 머리글 `구분 · 누적 근로 · 월간 소정 · 최대 가능 · 소정까지`, 값은 시간 소수 첫째 자리, 없으면 "—"(contracts/tool-output-work-hours.md).
- **사실**: 018 `extractTableBlock`은 tool 결과의 표 줄과 `> ` 정보 줄을 모두 남기므로 표가 둘(근무시간 + 근무현황)이어도 그대로 붙는다. 표 줄에 파라미터 이름(`year_month` 등)이 있으면 통째로 버리는 fail-closed 규칙이 있으나 새 머리글에는 해당 없다.
- 위젯은 머리글 4개(구분·누적 근로·월간 소정·최대 가능)로 표를 알아본다(contracts/widget-work-hours-gauge.md). 다른 표와 겹치지 않는다.

## R9. 브리지 규칙

- **Decision**(세 곳 동일, contracts/bridge-contract.md):
  - 경로 허용 `/Home.do` 추가
  - cmd 허용 `/Home.do: ['getHomeWorkStatusBarWidgetMap']` — 같은 경로의 다른 홈 위젯 cmd(팀·회사 단위 포함)는 거부(spec D11)
  - 필수 사번 `/Home.do: ['cmmSearchStaffId']`
  - 허용 키 `/Home.do: ['cmd', 'searchYmd', 'cmmSearchStaffId']`(017 MEDIUM-1 이후 신규 경로 규칙)
- **Rationale**: `/Home.do`에는 `getHomeOverTimeChartMapDetailStaff` 등 조직 단위 조회가 함께 있다.

## R10. 라우팅 경계 문장

- **Decision**: `query_type` 설명에 `work_hours=월 근무시간(누적 근로·월간 소정·최대 가능) — 이번 달·지난 달에 몇 시간 일했는지, 소정근로를 얼마나 채웠는지가 관심사일 때(야근·연장근무 시간은 overtime)`를 넣고, `overtime` 쪽에도 "일한 시간 전체는 work_hours" 차이 축을 둔다(Convention §4.1 차이 축). `year_month` 사용 목록에 work_hours를 더한다(T-A 문구 유지).
- 평가: `multi-01`("야근 몇 시간 했어")은 overtime 유지 — 경계 회귀 확인 대상.

## R11. handler 수정 (헌장 IV 예외)

- **Decision**: 새 조회는 description으로 만들 수 없어 handler가 `work_hours` 분기와 work_status 병행 조회를 갖는다. 로직은 `_shared/workHours.js`로 분리해 handler는 분기·합치기만 한다(017 `overtimeStatus`와 같은 방식).

## R12. 위젯 게이지

- **Decision**: `WorkHoursGauge.tsx`(신규). 막대 길이 기준 = 최대 가능. 채움 = 누적/최대(100% 상한), 표시선 = 소정/최대. 누적 > 소정이면 소정 위치까지 기본색, 그 뒤 주황. 소정 뒤 빈 구간은 빗금(연장 가능 구간). 값이 "—"면 막대 없이 "—"와 안내 문장. 숫자는 표에 적힌 문자열 그대로 표시한다(contracts/widget-work-hours-gauge.md).
- **Alternatives**: 기존 `LimitGauge` 확장 — 한도·사용·잔여(잔여 중심)와 의미가 달라 분기가 커진다. 신규 컴포넌트.
