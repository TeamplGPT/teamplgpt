# Data Model: 연장근무 한도·사용·잔여

모두 handler 안의 일시 값이다. 저장하지 않는다. 필드 원본은 research R1.

## 1. OtLimitRow — 한도 조회 응답 1행 (원본)

| 원본 필드 | 의미 | 사용 |
|---|---|---|
| `LMT_OT` / `lmtOt` | 주간 한도(시간) | searchType=2 |
| `USE_OT` / `useOt` | 주간 사용(결재 중 신청 포함) | searchType=2 |
| `REM_OT` / `remOt` | 주간 잔여 | searchType=2 |
| `LMT_OT2` / `USE_OT2` / `REM_OT2` | 월간 한도·사용·잔여 | searchType=3 |
| `APPL_OT` | 주간 결재 중 신청분 | 사용하지 않음 |
| `STAFF_NO`, `STAFF_NM`, `ORG_NM`, `POS_NM`, `WKTYPE_NM` | 사번·성명·소속·직위·근무유형 | **표에 쓰지 않음**(사번=내부값, 나머지는 본인 질문에 불필요) |

키 조회 규칙: 기존 `field(row, col)`와 같다(`row[col] ?? row[col.toLowerCase()] ?? row[camel(col)]`). kiwibox jsonView는 egovMap을 camelCase로 내보낸다.

검증: 응답 행 수가 정확히 1이 아니면 `PeriodLimit.failed = true`(R3).

## 2. PeriodLimit — 표 한 줄

```text
{
  label: "이번 주(10/19 기준)" | "이번 달(10월)" | "3월" | "2026-03",
  limit: number | null,   // null이면 "—"
  used:  number | null,
  remain: number | null,
  failed: boolean,        // true면 세 칸 모두 "조회 실패"
}
```

숫자 변환은 `parseFloat`, 결과가 유한수일 때만 값으로 쓴다. 표시는 `toFixed(1)`이다. 음수 잔여도 그대로 둔다.

## 3. OtEntry — 날짜별 내역 1건

| 표 머리글 | 원본 | 표시 |
|---|---|---|
| 일자 | `WORK_YMD` | `M/D(요일)`. 8자리가 아니면 원본 |
| 시작 | `STA_HM` | `toHHMM`(attendanceDisplay) |
| 종료 | `END_HM` | `toHHMM` |
| 연장시간 | `OT_TIME` | 원본 시:분 문자열 |
| 근무유형 | `WKTYPE_NM` | 비면 "—" |
| 사유 | `REASON` | 비면 "—" |

`NOTE`는 쓰지 않는다(근무 메모 — 범위 밖). 정렬은 원본 순서(최근 일자 먼저)를 오래된 순으로 뒤집어 표에 넣는다(다른 근태 표와 같은 방향).

## 4. YearOvertime — 연 단위 결과

```text
{
  year: 2026,
  months: [{ ym: "202601", limit, used, remain, failed, empty }],
  // empty: 응답 0행(재직 전 등) — 표에는 "—", 합계 제외
  totalUsed: number,                // failed·empty 제외 성공 달 used 합
  noOtMonths: ["1월", "2월", ...],  // used === 0 인 달
  failedMonths: [{ym, reason}],     // runMonthly 결과 그대로
}
```

## 5. 상태 전이 — 질문 → 조회 계획

```text
year_month 해석
 ├─ 연도 표현(resolveYearPeriod) ─┬─ 미래 해 → 조회 없음, "아직 기록 없음"
 │                               └─ 그 외 → 월별 searchType=3 × N (runMonthly)
 └─ 월(resolveDateParam, 없으면 이번 달)
     ├─ 미래 달 → 조회 없음
     ├─ 이번 달 → searchType=2(오늘) + searchType=3(오늘) + Person(1일~오늘)
     └─ 지난 달 → searchType=3(말일) + Person(1일~말일)
```
