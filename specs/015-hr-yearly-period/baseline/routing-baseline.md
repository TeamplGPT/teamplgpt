# 라우팅 평가 기준선 (T003, 변경 전 HEAD)

- 실행: `cd server && node evals/hr-routing/run.js` × 2회, 조건 변경 없음 (OpenAI만 호출)
- 원본 리포트(gitignore): `server/evals/hr-routing/reports/2026-10-15T09-51-12-932Z.{json,md}`, `2026-10-15T09-51-55-698Z.{json,md}`

| 회차 | 정확도 | date 태그 | 실패 |
|---|---|---|---|
| 1 | 94.9% (130/137) | 85.7% (6/7) | 7 |
| 2 | 94.9% (130/137) | 85.7% (6/7) | 7 |

## 실패 케이스 (두 회차 동일)

| id | 발화 유형 | 기대 | 실제 | 비고 |
|---|---|---|---|---|
| att-ts-date-02 | colloquial·date ("지난달 출퇴근 기록 보여줘") | hr-attendance.timesheet | hr-attendance.timesheet | skill·query_type은 맞고 파라미터(`params_regex`) 불일치 |
| att-wc-03 | — | hr-attendance.work_calendar | hr-attendance.timesheet | 혼동 |
| per-sd-01 | — | hr-personnel.schedule_day | hr-personnel.birthday | 혼동 |
| per-sd-02 | — | hr-personnel.schedule_day | hr-personnel.schedule_titles | 혼동 |
| amb-sch-02 | ambiguous | hr-personnel.schedule_day | hr-personnel.schedule_titles | 혼동 |
| per-cd-01 | — | hr-personnel.contact_directory | (no-tool) | contact_directory는 handler에서 제거된 query_type(HTTP 404) — 데이터셋 잔재 |
| prod-per-05 | production | hr-personnel.contact_directory | (no-tool) | 위와 같음 |

## 비교 기준 (T034)

- "신규 실패"는 위 7건 밖의 id가 실패하는 경우다.
- 위 7건이 변경 후에도 실패하는 것은 기존 상태로 본다. 다만 att-ts-date-02(날짜 파라미터)는 이번 기능과 같은 영역이라 변경 후 결과를 따로 적는다.
