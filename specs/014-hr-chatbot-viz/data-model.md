# Phase 1 Data Model: HR 챗봇 시각화

새 저장소/DB 테이블은 없다. 아래는 LLM 응답 텍스트 안에 실리는 ` ```viz ` 코드블록의 논리 구조(런타임 값, 영속화되지 않음)다.

## VizBlock (공통 봉투)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `type` | `"orgchart" \| "workstatus" \| "salarytrend"` | Y | 시각화 종류. 렌더러 디스패치 키. |
| `data` | 아래 3종 중 `type`에 대응하는 형태 | Y | 값은 반드시 직전 tool 호출 결과에서 그대로 가져온 값이어야 한다(FR-005) — LLM이 새로 만든 값 금지. |

**검증 규칙(okrservice 렌더러가 소비 시점에 적용)**:
- `type`이 3종 외의 값이거나 없으면 → 폴백(원본 코드블록 평문 표시), 크래시 금지(FR-006).
- `data`가 아래 필수 필드를 만족하지 못하면 → 동일하게 폴백.
- 배열이 비어 있으면(0건) → 폴백 대신 "표시할 데이터가 없습니다" 안내로 대체(엣지 케이스, spec.md 참조).

## OrgChartData (`type: "orgchart"`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `root` | string | Y | 사용자 소속 팀 명칭(트리 루트 라벨). |
| `members` | `{name: string, title?: string}[]` | Y (1개 이상) | 팀 구성원 목록(1단계, 하위 트리 없음). `title`은 직위 — 없으면 이름만 표시. |

출처: `hr-personnel` skill의 `org_members` query_type 결과를 그대로 매핑(신규 조회 없음).

## WorkStatusData (`type: "workstatus"`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `labels` | string[] | Y (1개 이상) | 근태 상태 항목명(예: "정상", "지각", "조퇴", "결근"). |
| `values` | number[] | Y (`labels`와 길이 동일) | 각 항목의 건수. |

출처: `hr-attendance` skill의 `work_status` query_type이 반환하는 집계 요약(`summarizeWorkStatus`) 결과를 그대로 매핑.

## SalaryTrendData (`type: "salarytrend"`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `labels` | string[] | Y (1개 이상) | 기간 라벨(예: "2025-01"). |
| `series` | `{name: string, values: number[]}[]` | Y (1개 이상, 각 `values` 길이는 `labels`와 동일) | 급여 항목별(예: "실지급액") 월별 값. |

출처: `hr-salary` skill의 `salary_statement` query_type이 반환하는 연 단위 월별 급여 레코드를 그대로 매핑.

## 상태 전이

없음 — 각 VizBlock은 단일 응답 turn 안에서 생성·소비되고 영속화되지 않는 무상태 표현이다. 동일 대화에서 재요청 시 최신 tool 결과 기준으로 새 VizBlock을 매번 새로 만든다(spec.md 엣지 케이스).
