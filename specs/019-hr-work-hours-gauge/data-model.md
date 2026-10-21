# Data Model: HR 챗봇 월 근무시간 게이지

## 1. 응답 필드 (HR 시스템 → 서버)

`/Home.do?cmd=getHomeWorkStatusBarWidgetMap` 응답 `Map` (research R1)

| 키 | 의미 | 사용 |
|---|---|---|
| `workT` | 누적 근로(소정 + 시간외) — 기준일까지 | 누적 근로 |
| `basTime1` | 월간 소정근로시간 | 월간 소정, 최대 가능의 일부 |
| `basTime2` | 연장근로 가능 시간 | 최대 가능의 일부 |
| `remT` | 소정까지 남은 시간(형식 미확인, R5) | 소정까지(이번 달만) |
| `basTime12` | 전주까지 기준 소정 | 사용 안 함 |
| `staffId`, `staffNo`, `staffNm` 등 | 신상 | 출력 금지(FR-013) |
| `workTime`, `remTime`, `overTime`, `officeT2` 등 | 기타 | 사용 안 함 |

## 2. WorkHours (서버 내부)

```text
WorkHours = {
  ok: boolean,            // false면 모든 값 "—" (FR-006)
  worked: number | null,  // workT
  normal: number | null,  // basTime1
  max: number | null,     // basTime1 + basTime2 (둘 다 숫자일 때만)
  toNormal: number | null // remT 파싱(이번 달만, R5)
}
```

검증(R3): 객체 1개(또는 길이 1 배열) && `worked`, `normal`이 숫자 → ok. 아니면 ok=false. `max`는 `basTime2`가 숫자가 아니면 null("—").

## 3. 조회 계획

```text
planWorkHours(year_month, today) →
  { kind: "current", y, m, baseYmd: today }               // 기간 없음·이번 달
  { kind: "month",   y, m, baseYmd: 그 달 말일 }           // 지난 달
  { kind: "future",  label }                               // 오지 않은 달 → 조회 안 함
  { kind: "year" }                                         // 연 단위 → 범위 밖 안내(spec Edge Cases)
```

year_month 해석은 기존 `resolveDateParam`/`resolveYearPeriod`를 쓴다(017 `planOvertime`과 같은 규칙).

## 4. 화면 행 (서버 → 위젯/모델)

| 칸 | 이번 달 | 지난 달 | 실패 |
|---|---|---|---|
| 구분 | `이번 달(10월)` | `9월` / `2025년 9월` | 같은 이름 |
| 누적 근로 | `82.5` | `176.0` | `—` |
| 월간 소정 | `171.0` | `168.0` | `—` |
| 최대 가능 | `224.0` | `220.0` | `—` |
| 소정까지 | `88.5` | `—` | `—` |

## 5. 상태 전이

```text
질문 → query_type
  work_hours  → plan → (current|month) fetch 1회 → WorkHours → 표 1개
                       future → 안내 문장 / year → 범위 밖 안내
  work_status → (월 단위) fetch 2회 병렬: 근무현황 + 근무시간 → [근무시간 표] + [근무현황 표]
              → (연 단위) 기존 그대로(근무시간 없음)
```
