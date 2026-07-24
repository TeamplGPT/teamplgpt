# Research: HR 스킬 엔드포인트 신판 카탈로그 재정렬

**Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

근거 원문: `/home/sdh/5240/kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` (신판, last_verified 2026-07-24). 결정 D1~D9는 spec 결정표 권고안대로 사용자 승인됨(/speckit-plan 진행 지시).

## R-1. 현행 코드 실사 결과 (as-is)

| skill | query_type | 현행 endpoint | 신판 판정 |
|---|---|---|---|
| hr-attendance | timesheet | TAAWrkTimeListMgrByDate (TAA-0360) | §2.7 관리자형 — 정본 아님 |
| hr-attendance | work_status | TAAWrkTimeStatusMgr (TAA-1410) | §2.1 정본 — BODY 절반 누락(searchSYmd/EYmd) |
| hr-attendance | work_calendar | TAADclzWorkSearchCldr, searchId만 | §2.2 — cmmSearchStaffId·searchBaseYmd 누락 |
| hr-attendance | overtime/overtime_limit | OtSchdulList2/List, searchType=3 | §2.6 실측 searchType=2 |
| hr-attendance | leave_requests | getMBLLeavDetailStaff | §8 미사용 판정 |
| hr-attendance | annual_leave_balance | getMBLHomeLeaveDetail(searchType=1) | §8 미사용·§9 테스트 NULL |
| hr-attendance | vacation_calendar | TAADclzVcatnCldrMgr | 신판 미수록 — D7 유지 |
| hr-salary | payslip/deductions/payslip_summary | SALPayslipNewMgr | §1.1 정본 — searchYm(YYYY-MM)·searchType=web 누락 |
| hr-salary | salary_statement | SALSalaryDtstmnMgr (SAL-0220) | §1.3 폐기 — 빈 응답 |
| hr-salary | pay_periods | CommonCode getSalYmdTypeCdList2 | §1.4 일치 (closeChk=Y·searchYm 형식 확인 필요 — 신판은 YYYY-MM) |
| hr-salary | daylabor | SALDaylabMgr | 신판 미수록 — D7 유지 |
| hr-personnel | profile/profile_detail | getMBLPrtEmpCard(Pop) | §8 미사용 판정 — D6 보류 |
| hr-personnel | education | Tab220, staffId+checkHst=N | §4 공통 BODY(3중 사번·searchYmd) 누락 |
| hr-personnel | org/일정/todo/contact | getMBL* | 신판 미수록 — D7 유지 |
| hr-approval | 전체 | EAPRequestMgr, selectGubun+searchStaDate/EndDate | §5.1 실측은 searchGubun/searchStatusCd/searchSYmd/EYmd — D8 병행 |
| hr-certificate | requests | CTIMcrtfReqstRefromMgr, staffId+reqNoExist=N | §6.4 — 3중 사번·기간 누락 |
| hr-welfare | loan | LONLoanReqstListMgr, cmmSearchStaffId만 | §6.3 — searchBaseSYmd/EYmd 누락 |
| hr-year-end-tax | — | — | §8 별도 취급 — 범위 외 |

## R-2. E2E 인프라 갭 (핵심 발견)

- **Decision**: mock-hr-api.js와 runner.js를 kiwibox 시대로 확장한다.
- **Rationale**:
  1. `runner.js:378` mock 대조 필터가 `^\/api\/v1\//` — kiwibox `.do` 요청은 무시된다. 현행 kiwibox handler를 검증하는 시나리오가 0건(전 시나리오 `/api/v1/...` 패턴 = 구세대 REST skill 대상).
  2. kiwibox 호출은 파라미터가 POST urlencoded **body**에 있어 `fullUrl` 정규식으로 검증 불가. mock은 urlencoded를 JSON.parse 실패 → `_raw` 문자열로 로그함.
  3. mock 고정 응답 `{success:true,data:[]}`는 hrSession 언랩상 isEmpty 처리라 tool-call 자체는 성립 — 단 파라미터 전량 검증(신판 "임의 축약 금지")은 불가.
- **설계**:
  - mock: `application/x-www-form-urlencoded`를 파싱해 `body`에 객체로 기록(기존 JSON 로직 유지). 응답은 기존 고정 응답 유지(핸들러 흐름 변경 불요).
  - runner: relevant 필터를 `/^\/api\/v1\//.test(p) || /\.do$/.test(p)`로 확장. 시나리오 스키마에 `mock_body_required`(키 존재/정규식 매칭 목록) 추가 — `.do` 요청의 body 필수 파라미터 검증. 기존 필드 미사용 시나리오는 무영향(하위호환).
- **Alternatives considered**: 실서버(ntest.5240.kr) 직결 E2E — 세션·데이터 비결정성, CI 불가로 기각. mock에 kiwibox 실측 응답 재현 — 렌더 검증까지 가능하나 범위 과대, 후속으로 미룸(본 작업 판정 기준은 "요청 BODY 정확성 + tool-call 성립").
- **전제(환경)**: E2E 실행 시 대상 워크스페이스의 HR skill setup_args가 서버 폴백 모드로 mock을 가리켜야 함 — `HR_BASE_URL=http://localhost:8000`, `HR_SESSION_COOKIE=JSESSIONID=e2e-dummy`, `HR_STAFF_ID=100:2007:00204:kkHT`(형식 무관 임의값 가능). quickstart.md에 절차 기재.
- **runner 재검증 (2026-07-24 실물 테스트)**: mock을 직접 기동해 kiwibox식 urlencoded POST 송신 — mock은 `.do` 요청을 로깅하며 body는 `_raw` 문자열로 보존됨. 차단점은 runner 2곳뿐: ① relevant 필터 `^\/api\/v1\//`(`.do` 탈락 → mock_url_pattern 시나리오 무조건 FAIL), ② body 검증 코드 부재. **mock 수정은 선택(편의), runner 수정이 필수** — `mock_body_pattern`은 `_raw`(URL 디코드 후) 정규식 대조로 구현 가능.
- **legacy 스위트 전수 감사 (사용자 지시 반영 — FR-015)**: E1~E130 전 132건이 `agent-skills-backup/20260716`(kiwibox-hr-api 이전 REST 방식, **완전 폐기됨**) 시대 `/api/v1/` 패턴. 유효 시나리오 0건. 처분:
  - **폐기(제거)**: 현행 skill 대응 기능 부재 — hr-personnel-search 전건(11, skill 자체 폐기), salary 세부(bonus·account·base-amount·compare·retroactive·annual-total·leave-pay-rate·pay-step ≈22), personnel 세부(appointment·licenses·career·employment·family·rewards·address·contact·disciplines·visa ≈26), attendance 세부(business-trips·substitute-leave·timesheet-requests·work-type ≈10). 원본은 `scenarios-legacy-20260716.json`으로 보존(기능 재도입 시 참조).
  - **개편(재작성)**: 대응 query_type 존재 — annual-leave(7)→annual_leave_balance, timesheet(4), overtime(4), leave-requests(3), work-plan(5)→work_calendar, payslip(4)+deductions(4)→2단 체인(pay_periods→payslip) 반영 재설계, education(4), year-end-tax(24)→현행 hr-year-end-tax(kiwibox식) query_type 매핑, E5(null 패턴). 행태 검증 의도(결정론성 repeat=10, 되묻기 금지, 상대 기간 표현) 승계.
  - 재작성 스위트는 신규 ID 체계(K1~ 또는 E200~, tasks에서 확정)로 scenarios.json 전면 교체.

## R-3. 파생 파라미터 산출 규칙

- **searchYm (SAL-0527)**: `pay_item`(예 `20260619P`) 선두 6자리에서 유도 → `2026-06`. 정규식 `/^(\d{4})(\d{2})\d{2}/` 불일치 시 오류 안내(임의 축약·추측 금지). *Rationale*: searchItem 자체가 지급일 기반 복합키(§1.4) — 별도 입력 불요, LLM 계약 불변.
- **pay_periods searchYm**: 신판 §1.4 실측은 `2026-06`(하이픈) — 현행 `YYYYMM` 전송을 `YYYY-MM`으로 정정.
- **휴가/회계연도 범위 (§3)**: 조회 연월의 연도 Y → `searchSymdLv/Fy=Y0101`, `searchEymdLv/Fy=Y1231`. year_month 미지정 시 현재 연도.
- **searchBaseYmd**: 오늘 `YYYY-MM-DD`(하이픈) — hrSession에 `todayDashed()` 헬퍼 추가(기존 todayYmd 유지).
- **기간 기본값 (certificate·welfare)**: 오늘 기준 과거 18개월 초일 ~ 오늘(YYYYMMDD) — 신판 실측(20250101~20260722, 약 19개월) 준용.
- **wkareaCd**: setup_arg `HR_WKAREA_CD` 기본 `1000` (D4). 클라이언트 위임 모드에서도 setup_arg 값 사용(브리지 계약 확장 없음).
- **orgCd**: 미전송 (D4) — §2.2가 orgCd 없이 실측 성공한 선례. 실환경 검증에서 실패 시 후속 조정.

## R-4. 컬럼 화이트리스트 (신판 실측 필드 기준)

| query_type | 노출 (필드=라벨) | 차단 |
|---|---|---|
| annual_leave_balance | workNm=휴가종류, creDd=발생일수, useDd=사용일수, remDd=잔여일수, staYmd=시작일, endYmd=종료일 | leavCd(코드) |
| leave_requests | ymd=사용일, week=요일, leavNm=휴가종류, useDd=사용일수, reason=사유 | dayTypeCd, addNum |
| timesheet | workYmd=일자, week=요일, staTime=출근, endTime=퇴근, baseStaTime=기준출근, baseEndTime=기준퇴근, mark=상태, workComment=특이사항, lateYn=지각, earlyYn=조퇴, absentYn=결근 | 사번·PK·ot세부(42필드 중 잔여) |
| work_status | 기존 화이트리스트 유지 (d2bebffc) | — |
| salary_statement (SAL-0050) | salYmd=지급일, orgNm=소속, posNm=직위, jtotAmt=지급합계, gtotAmt=공제합계, ctotAmt=실수령 | detail(HTML), staffId, 코드류 |

기존 화이트리스트 미정의 query_type(통짜 렌더)은 현행 유지 — 최소 범위.

## R-5. hrSession 언랩 확장

신판 §1.1 payslip_summary(`{"Map":{...}}`)·§1.4 pay_periods(`{"codeList":[...]}`) 래퍼는 현행 `parseKiwiboxBody` 언랩 순위(result→DATA→data)에 없음 → passthrough로 객체 통짜 반환 중.
- **Decision**: 언랩 우선순위에 `Map`, `codeList` 추가 (result → DATA → Map → codeList → data). *Rationale*: formatPayPeriods가 현재 `{codeList:[...]}` 객체를 배열로 못 받아 잠재 결함 — 신판 응답 경로 명시로 해소.

## R-6. 승인 결정 확정 기록

D1 TAA-1410 교체 / D2 List1·List2 교체 / D3 searchType=2 / D4 HR_WKAREA_CD·orgCd 미전송 / D5 SAL-0050 교체(enum 유지) / D6 profile 보류 / D7 미수록 endpoint 유지 / D8 병행 전송 / D9 실측 BODY 보강 — 전건 권고안 채택.
