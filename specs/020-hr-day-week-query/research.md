# Research: HR 챗봇 하루·주 단위 조회

## R1. 원인 — 날짜가 세 군데에서 버려진다

1. **시스템 지시** `server/utils/hrSkillGuard.js` `[HR_SKILL_COMMON]` 4항: "일(day) 정보는 무시하고 월만 전달하세요."
2. **설명 예시** `hr-attendance/plugin.json`: "2월 27일자 출퇴근 내역 → year_month: '2'".
3. **파라미터** 근태·인사는 `year_month`(월) 하나뿐 — 하루를 담을 칸이 없다.

그 결과 조회는 한 달, 018 표 직접 출력으로 한 달 표가 붙는다. 결과의 "특정 날짜만 물으면 그 날만 답하세요"(DAY_TABLE_LINE)는 모델 문장에만 적용된다.

- **Decision**: 세 곳을 모두 고친다 — 새 파라미터 `date`, 설명·예시, 시스템 지시 4항(§7.2 "가드가 포괄 못 하면 가드를 고친다").

## R2. 파라미터 이름·형식

- **Decision**: `date` (선택). 하루(오늘·금일·어제·그저께·그제·내일·모레·"10월 15일"·"15일"·"20261015"·"2026-10-15"·"10/15") 또는 한 주(이번 주·금주·지난주·저번 주·다음 주·차주). 사용자가 한 표현을 그대로 전달하게 한다(서버가 해석 — `year_month`와 같은 원칙).
- **Alternatives**: `from_date`/`to_date` 두 칸 — 모델이 범위를 계산해야 해 날짜 계산 오류·지어내기 위험. 기각. `year_month`에 하루를 담기 — 기존 월 질의 골든과 섞인다. 기각.

## R3. 범위 해석 (`_shared/dateRange.js` 신규)

- 하루: 기존 `resolveDateParam(value, "base_date")`(sugar-date ko + 2026-10-21 정규화)로 YYYYMMDD. "15일"은 이번 달. 연도 없는 날짜는 올해.
- 주: 정규식으로 이번/지난/다음 주 → 서울 기준 오늘이 속한 주의 월요일 ± 7일, 월~일.
- 결과: `{ start, end, kind: "day"|"week", label }` — label은 안내 문구용("10월 23일", "이번 주(10/20~10/26)").
- 해석 실패 → 공통 안내(`periodCheck.UNRESOLVED_PERIOD`). 빈 값·"최근" 등은 지정 없음.

## R4. 조회별 적용 방법 (5240 요청 형태)

| 조회 | 기간 요청 칸 | 적용 |
|---|---|---|
| 출퇴근 기록·근무현황(`TAAWrkTimeStatusMgr`) | `searchBaseSYmd/EYmd`, `searchSYmd/EYmd` (period "range-both") | 범위를 그대로 보낸다. 끝은 오늘로 자른다(기존 "오늘까지만"). 시작이 오늘 이후면 조회하지 않고 안내 |
| 근무캘린더(`TAADclzWorkSearchCldr`) | `searchYm` + 범위(rangeAltToo) | 범위가 걸친 달을 조회(주가 두 달에 걸치면 두 번) 후 `ymd`로 범위 행만 |
| 연장근무(`overtimeStatus`) | 한도: 기준일 / 내역: SQL이 월초부터 | 한도 표는 그대로(기준일 = 범위 끝, 오늘 이후면 오늘). 내역은 Person 1회(start ~ min(end, 오늘) — SQL이 시작 달 1일부터라 두 달에 걸친 주도 한 번) 후 `workYmd`로 범위만 |
| 인사 일정(`getScheduleDay`, `getHRDetailList`) | `staYmd/endYmd` (month-range) | 범위를 그대로 보낸다(일정 제목은 날짜 칸이 없어 조회 범위가 곧 거르기) |

브리지: 보내는 경로·키가 같다 — 허용 키 목록 변화 없음(017 `ALLOWED_PARAM_KEYS`는 모바일 연장 경로만, 거기 키도 같음).

## R5. 근무현황(하루·주) 출력

- 요약 줄은 조회된 범위 행으로 계산(2026-10-21 하루 한 분류 그대로) — 자연히 범위만 센다.
- 019 월 근무시간 블록은 `date`가 있으면 붙이지 않는다(D5).
- 범위 안 행이 0이면 `> ⚠️ {label} 출퇴근 기록이 없습니다.`

## R6. 연도 가드·기간 검사 연결

- `hrYearGuard.correctToolArgs` YEAR_PARAMS에 `date` 추가(말하지 않은 연도 제거 — "2023-10-15" 같은 지어낸 연도).
- `periodCheck`에 `date` 검사(`rangeProblem`) — 해석 실패면 안내.

## R7. 가짜 HR 서버

- **Decision**: 요청 범위가 7일 이하(하루·주 조회)면 그 날짜들의 행을 실서버 형식(`workYmd` "MM-DD" + `ymd` "YYYYMMDD", 2026-10-21 실서버 확인)으로 만들어 돌려준다(오늘 행 포함, 정해진 요일에 지각 1건). 월 단위 요청은 지금처럼 7월 고정 행 — 기존 시나리오 기대값(`| 20260701 | 수 | 08:55 |…`)을 바꾸지 않는다.
- **Alternatives**: 근태 응답 전체를 실서버 형식으로 — 기존 시나리오 다수의 표 줄 패턴 갱신이 필요하고 이번 기능과 무관한 변경이 커진다. 후속으로 남김.
