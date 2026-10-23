# Data Model: HR 챗봇 하루·주 단위 조회

## DateRange (서버 내부, `_shared/dateRange.js`)

```text
DateRange = {
  start: "YYYYMMDD",
  end:   "YYYYMMDD",      // 하루면 start와 같다
  kind:  "day" | "week",
  label: string,          // 안내 문구용: "오늘(10/23)", "10월 15일", "이번 주(10/19~10/25)"
}
resolveDateRange(value, now) → DateRange | undefined(지정 없음) | null(해석 실패)
```

## 조회별 사용

| 조회 | 요청 범위 | 행 거르기 기준 |
|---|---|---|
| timesheet / work_status | start ~ min(end, 오늘) | 요청 범위가 곧 결과 |
| work_calendar | 걸친 달마다 searchYm | 행 `ymd` ∈ [start, end] |
| overtime(_limit) 내역 | Person 1회(SQL이 searchBaseSYmd 달 1일 ~ searchBaseEYmd — 두 달에 걸친 주도 한 번, kiwibox MBLDclzWorkOtSchdul_SQL.xml 확인) | 행 `workYmd`(8자리) ∈ [start, end] |
| schedule_day / schedule_titles | staYmd=start, endYmd=end | 요청 범위가 곧 결과 |

## 상태

```text
date 없음                  → 기존 그대로(바이트 동일)
date 해석 실패              → UNRESOLVED_PERIOD, 조회 없음
start > 오늘 (기록류)       → 아직 지나지 않은 날 안내, 조회 없음(연장은 한도 표만)
범위 행 0                   → "{label} … 기록이 없습니다"
그 외                       → 범위 행 표 + "조회 날짜/기간" 정보 줄
```
