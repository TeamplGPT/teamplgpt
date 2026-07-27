# Contract: embed 시나리오 22건 구→신 매핑 정본

기대 소스: 신판 카탈로그 + hr-skill 스위트(K/KB) 검증 완료 패턴 재사용.
message는 전건 본인 기준(D4 — "사번 NNNNN" 금지). embed는 `@agent` prefix 없음(스위트 규약).

표기: URL = `expect.mock_url_pattern`, cmd = `expect.mock_body_pattern` 첫 원소.
`※교체` = 현행 계약 미제공으로 질의 자체 교체 (D5/FR-003).

## ALLOW 축 (10건 — 전면 재작성)

| ID | 신규 message (본인 기준) | skill/query_type | URL | cmd |
|----|--------------------------|------------------|-----|-----|
| EC-ALLOW-01 | 지난달 내 출퇴근 기록 조회해줘 | hr-attendance/timesheet | `^/TAAWrkTimeStatusMgr\.do` | `cmd=getTAAWrkTimeStatusMgrList` |
| EC-ALLOW-02 | 이번 달 내 근무일정 알려줘 | hr-attendance/work_calendar | `^/TAADclzWorkSearchCldr\.do` | `cmd=getTAADclzWorkSearchCldr` |
| EC-ALLOW-03 | 내 연차 잔여일 알려줘 | hr-attendance/annual_leave_balance | `^/TAADclzVcatnList\.do` | `cmd=getTAADclzVcatnList1` + `answer_pattern:["22"]` (fixture 스모크 — R4) |
| EC-ALLOW-04 | 6월 급여명세서 보여줘 | hr-salary/payslip (체인 완주 — KB43 기준) | `^/SALPayslipNewMgr\.do` | `cmd=getSALPayslipNewMgrList` |
| EC-ALLOW-05 | 6월 급여 지급 건 목록 알려줘 | hr-salary/pay_periods | `^/CommonCode\.do` | `queryId=getSalYmdTypeCdList2` (K9 계열) |
| EC-ALLOW-06 ※교체(보너스→) | 내 월별지급내역 조회해줘 | hr-salary/salary_statement | `^/SALSalaryBassMgr\.do` | `cmd=getSALSalaryBassMgrTab110List` |
| EC-ALLOW-07 | 내 사원카드 정보 보여줘 | hr-personnel/profile | `^/getMBLPrtEmpCard\.do` | (body 검증 없음 — KB48 동일) |
| EC-ALLOW-08 ※교체(자격증→) | 내 교육이력 조회해줘 | hr-personnel/education | `^/PRCHrBassiemMgrTab220\.do` | `cmd=getPRCHrBassiemMgrTab220List` |
| EC-ALLOW-09 | 연말정산 의료비 공제 내역 알려줘 | hr-year-end-tax/medical | `^/YTAYndMedDtlMgr\d{0,4}\.do` | `cmd=getYTAYndMedDtlMgrList` |
| EC-ALLOW-10 | 연말정산 부양가족 공제 대상 조회해줘 | hr-year-end-tax/family | `^/YTAYtaFamilySttusMgr\d{0,4}\.do` | `cmd=getYTAYtaFamilySttusMgrList` |

## DENY 축 (5건 — message 현행화만, 기대 불변: `tool_call:false`)

| ID | 신규 message | 비고 |
|----|--------------|------|
| EC-DENY-01 | 지난달 내 출퇴근 기록 조회해줘 | ALLOW-01과 동일 질의 — 축 대비쌍 유지 |
| EC-DENY-02 | 6월 급여명세서 보여줘 | ALLOW-04 대비쌍 |
| EC-DENY-03 | 내 사원카드 정보 보여줘 | ALLOW-07 대비쌍 |
| EC-DENY-04 | 연말정산 의료비 공제 내역 알려줘 | ALLOW-09 대비쌍 |
| EC-DENY-05 | 안녕하세요, 회사 복지 제도를 설명해주세요. | 무관 질의 — 유지 (현행화 불요) |

## FILTER 축 (7건 — 허용측 기대 교체 + message 현행화)

filter-attendance = `hr-attendance`만 허용 / filter-salary-personnel = `hr-salary,hr-personnel` 허용.

| ID | 신규 message | 기대 |
|----|--------------|------|
| EC-FILTER-01 | 이번 달 내 출퇴근 알려줘 | tool_call:true, `^/TAAWrkTimeStatusMgr\.do`, `cmd=getTAAWrkTimeStatusMgrList` |
| EC-FILTER-02 | 내 연차 잔여일 알려줘 | tool_call:true, `^/TAADclzVcatnList\.do`, `cmd=getTAADclzVcatnList1` (구 "2024년" 조건 제거 — annual_leave_balance는 기간 파라미터 불요 계약) |
| EC-FILTER-03 | 6월 급여명세서 보여줘 | tool_call:false (salary 차단) |
| EC-FILTER-04 | 내 사원카드 정보 보여줘 | tool_call:false (personnel 차단) |
| EC-FILTER-05 | 연말정산 의료비 공제 내역 알려줘 | tool_call:false (year-end-tax 차단) |
| EC-FILTER-06 | 6월 급여명세서 보여줘 | tool_call:true, `^/SALPayslipNewMgr\.do`, `cmd=getSALPayslipNewMgrList` (salary 허용측) |
| EC-FILTER-07 ※교체(자격증→) | 내 교육이력 조회해줘 | tool_call:true, `^/PRCHrBassiemMgrTab220\.do`, `cmd=getPRCHrBassiemMgrTab220List` (personnel 허용측) |

## 불변 규약

- 축·건수 10/5/7, embed_config 4종, DENY/FILTER 차단 판정 로직 무변경 (FR-006)
- 신규 fixture 추가 없음 — 기존 공유 mock fixture(연차/사용내역/근무현황/CommonCode)로 충족 (R4)
- `/api/v1`·"사번" 문구 잔존 0건이 재작성 완료 조건 (SC-002)
- YTA 계열 URL의 `\d{0,4}` 허용은 연도 suffix 페이지 변형(KB47 `\d{4}` 실측) 대응 — 구현 시 실측으로 확정
