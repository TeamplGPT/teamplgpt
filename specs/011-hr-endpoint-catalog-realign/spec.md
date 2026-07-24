# Feature Specification: HR 스킬 엔드포인트 신판 카탈로그 재정렬

**Feature Branch**: `feat/5240hr` (spec dir: `011-hr-endpoint-catalog-realign`)

**Created**: 2026-07-24

**Status**: Draft — 사용자 승인 대기

**Input**: User description: "kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md 엔드포인트 분석 개선 작업을 server/storage/plugins/agent-skills hr 관련 skill 작성에 반영"

**근거 카탈로그**: `/home/sdh/5240/kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` (last_verified 2026-07-24, 권한 카탈로그 85개 프로그램 전수 순회 + 실호출 캡처). 이하 "신판 §N"으로 인용.

**Convention doc**: `docs/conventions/hr-skill-description-pattern.md` — 본 작업은 endpoint 교체·파라미터 보강이 중심이며 query_type enum·year_month 계약은 불변(결정 D5 제외). description 문구 변경 없음 → T-A/T-B 재작성 불요, 기존 `[CRITICAL]` 3단 + `[재강조]` 구조 유지. D5 채택 시에도 enum 값·매핑표 문구 유지(백엔드만 교체)로 §6.1 신규 파라미터 체크리스트 비대상.

## 배경 (Why)

현행 HR skill 6종(hr-attendance·hr-salary·hr-personnel·hr-approval·hr-certificate·hr-welfare)은 **구판 카탈로그**(§4.x 체계, 모바일 self 정본) 기준으로 작성됐다. 신판 카탈로그는 실호출 전수 검증으로 정본을 재판정했고, 그 결과 현행 skill이 다음을 위반한다:

1. **미사용 판정 endpoint 의존**: `getMBLHomeLeaveDetail`(테스트 NULL), `getMBLLeavDetailStaff`, `getMBLPrtEmpCard` — 신판 §8 "중복 모바일 endpoint 미사용".
2. **관리자형 화면 의존**: timesheet가 TAA-0360(srchTypeCd=N 관리자형, 신판 §2.7 "정본 아님") 호출.
3. **폐기 endpoint 의존**: salary_statement가 SAL-0220(신판 §1.3 "빈 응답·폐기 권장") 호출.
4. **필수 파라미터 누락**: SAL-0527 `searchYm`(YYYY-MM)·`searchType=web`(신판 §1.1), 휴가 공통 BODY(신판 §3), EAP-0070 기간 파라미터(신판 §5.1) 등 — "실측 성공 요청 본문 그대로, 임의 축약 금지"(신판 혼동 방지 규칙 1).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 연차/휴가 조회가 실데이터를 반환 (Priority: P1)

직원이 "연차 얼마 남았어?" / "내 휴가 언제 왜 썼어?"를 물으면, 미사용 판정된 모바일 endpoint 대신 정본(TAA-1310 발생내역 / TAA-0490 휴가현황)에서 종류별 발생·사용·잔여와 사용 상세(일자·사유)를 받아본다.

**Why this priority**: annual_leave_balance는 skill description상 기본(fallback) query_type인데 현재 운영 기준 NULL 위험(신판 §9 "테스트 NULL") — 가장 빈번한 질문이 가장 불안정.

**Independent Test**: E2E `annual_leave_balance`·`leave_requests` 시나리오 — mock이 신판 §3.1/§3.2 BODY(필수 파라미터 포함)를 수신하는지 + 응답 필드(workNm/creDd/useDd/remDd, ymd/leavNm/reason/useDd) 렌더 확인.

**Acceptance Scenarios**:

1. **Given** 로그인 세션, **When** "연차 잔여 알려줘", **Then** TAADclzVcatnList1 호출(BODY에 staffId+cmmSearchStaffId 마커, searchSymdLv/EymdLv·searchSymdFy/EymdFy·searchBaseYmd·chkAppYn=Y·wkareaCd 포함), 휴가종류별 발생/사용/잔여 테이블 반환.
2. **Given** 로그인 세션, **When** "내 휴가 신청 내역", **Then** TAADclzVcatnList2 호출, 사용일·종류·사유·일수 테이블 반환.
3. **Given** 필수 파라미터 하나라도 누락된 요청, **Then** (mock 검증) FAIL — 신판 "임의 축약 금지" 회귀 방지.

---

### User Story 2 - 출퇴근·근태가 직원 정본 화면 기준으로 조회 (Priority: P1)

직원이 출퇴근 기록을 물으면 관리자형 화면(TAA-0360)이 아닌 직원 정본 TAA-1410(근태현황, 42필드 일일 근태 대표)에서 조회된다.

**Why this priority**: 관리자형 화면은 권한 구성에 따라 직원 계정에서 미인가·전사 노출 위험. self 스코핑 원칙 위반 소지.

**Independent Test**: E2E `timesheet` 시나리오 — 호출 path가 `/TAAWrkTimeStatusMgr.do`로 변경됐는지 + 출퇴근 중심 컬럼 화이트리스트 렌더 확인.

**Acceptance Scenarios**:

1. **Given** 로그인 세션, **When** "이번 달 출퇴근 기록", **Then** TAA-1410 호출, 일자·요일·출근(staTime/inTime)·퇴근(endTime/outTime)·상태 테이블 반환.
2. **Given** work_status 조회, **Then** 신판 §2.1 BODY 전량(searchBaseSYmd/EYmd + searchSYmd/EYmd 동시) 전송.

---

### User Story 3 - 급여명세 조회가 필수 BODY로 안정 동작 (Priority: P2)

직원이 특정 월 급여명세를 조회하면 SAL-0527 필수 파라미터(searchYm YYYY-MM 하이픈, searchType=web, searchItem)가 전량 포함되어 호출된다. 기간 급여 이력은 폐기된 SAL-0220 대신 SAL-0050 월별지급내역에서 조회된다.

**Why this priority**: 현행도 부분 동작하나 필수 파라미터 누락은 빌드별 회귀 위험. salary_statement는 현재 항상 빈 응답(기능 사실상 죽어있음).

**Independent Test**: E2E `payslip`/`payslip_summary`/`deductions` — BODY에 searchYm(searchItem에서 유도)+searchType=web 포함 검증. `salary_statement` — SAL-0050 호출·13필드 중 화이트리스트 렌더.

**Acceptance Scenarios**:

1. **Given** pay_item=`20260619P`, **When** payslip 조회, **Then** BODY에 `searchYm=2026-06`·`searchType=web`·`searchItem=20260619P`·마커 포함.
2. **Given** "올해 월별 급여 이력", **When** salary_statement 조회, **Then** SALSalaryBassMgr Tab110 호출, 지급일·지급합·공제합·실수령 테이블 반환.

---

### User Story 4 - 결재함·증명서·대출 조회가 실측 BODY로 정렬 (Priority: P3)

결재문서함은 신판 §5.1 실측 파라미터(searchSYmd/EYmd)로, 증명서(§6.4)·대출(§6.3)은 실측 BODY(사번 3중 지정·기간) 그대로 호출된다.

**Independent Test**: E2E 각 skill 시나리오에서 mock 수신 BODY 검증.

**Acceptance Scenarios**:

1. **Given** "이번 달 기안함", **Then** EAPRequestMgr 호출 BODY에 searchSYmd/searchEYmd(YYYYMMDD) 포함.
2. **Given** 증명서 신청내역 조회, **Then** cmmSearchStaffId+staffId+searchStaffId 3중 마커 + reqNoExist=N + searchSYmd/EYmd 포함.
3. **Given** 대출 신청내역 조회, **Then** cmmSearchStaffId 마커 + searchBaseSYmd/EYmd 포함(누락 시 전사 노출 — 신판 §6.3 경고 회귀 방지).

---

### Edge Cases

- 신판 BODY의 `orgCd`·`wkareaCd`는 예시 계정 값(0303/1000) — 사용자별 상이. 서버가 세션으로 강제하지 않는 값을 어떻게 공급하나? → 결정 D4.
- searchItem 형식 이상(8자리+유형 아님) 시 searchYm 유도 실패 → 유도 불가면 searchYm 생략이 아니라 오류 안내(임의 축약 금지).
- Tab100(62필드)에는 주민번호 복호화(ctzNoDecrypt)·휴대폰 포함 — 교체 시 화이트리스트 없으면 노출 사고. L2 가드 필수.
- 신판 미수록이지만 현행 사용 중인 endpoint(TAADclzVcatnCldrMgr, SALDaylabMgr, getMBL 조직/일정/연락처류) — 신판이 금지하지 않음 → 유지(결정 D7).
- 클라이언트 위임(브리지) 경로: path 교체가 브리지 화이트리스트/프록시에 영향 주는지 확인 필요(§5240 embed 브리지가 path 제한을 둘 경우 신규 path 등록).

## 결정표 — 사용자 승인 대상 *(풀 게이트)*

| # | 결정 | 권고안 | 대안 | 근거 |
|---|---|---|---|---|
| D1 | timesheet endpoint | **TAA-1410 교체** (work_status와 동일 endpoint, 출퇴근 중심 컬럼셋 별도) | TAA-0340 출근현황(카드/확정시각) | 신판 §2.1 정본·§2.7 관리자형 강등. 카드원시시각 필요 시에만 0340 |
| D2 | annual_leave_balance / leave_requests | **TAA-1310(List1) / TAA-0490(List2) 교체** | 현행 모바일 유지 | 신판 §3.1/§3.2 정본, §8 모바일 미사용 판정, 운영 NULL 위험 |
| D3 | overtime/overtime_limit `searchType` | **2로 정정** | 3 유지 | 신판 §2.6 실측 성공 BODY=2. 3은 구판 잔재 — E2E로 회귀 확인 |
| D4 | `wkareaCd`(§3 필수)·`orgCd` 공급 | **wkareaCd: setup_arg `HR_WKAREA_CD`(기본 1000) 신설. orgCd: 미전송**(§2 BODY들에서 orgCd 없이 실측 성공 사례 있는 §2.2 패턴 준용, 실패 시 후속) | 브리지 마커 추가(계약 확장) | 세션 강제 안 되는 값. setup_arg는 계약 비침습. 브리지 마커는 3-Mode/embed 계약 변경이라 과대 |
| D5 | salary_statement (SAL-0220 폐기) | **enum 유지 + 백엔드 SAL-0050 교체**, 라벨 "월별 지급내역"으로 | query_type 제거(계약 축소) | enum 제거는 파라미터 계약 변경 → 범위 확대. 교체는 description 문구 유지 가능 |
| D6 | profile/profile_detail (getMBLPrtEmpCard 미사용 판정) | **보류(현행 유지)** — Tab100 교체는 주민번호·신체정보 등 고민감 62필드 화이트리스트 설계 필요 → 별도 스펙 | 즉시 Tab100 교체 | 신판 §4.1 민감 경고. 현행 모바일 profile은 동작 중(부분집합) — 기능 저하 없음. 민감정보 확대는 단독 심의 |
| D7 | 신판 미수록 현행 endpoint (vacation_calendar·daylabor·org/일정/연락처류) | **유지** | 제거 | 신판이 금지 아닌 미수록. 최소 범위 원칙 |
| D8 | hr-approval 기간 파라미터 | **searchSYmd/EYmd 추가, selectGubun·searchStaDate/EndDate 유지(병행)** — E2E+실동작으로 무해 확인 후 후속 정리 | 즉시 교체 | 현행은 kiwibox SQL 실측(selectGubun) 기반으로 동작 중. 신판 §5.1은 다른 파라미터명 실측 — 서버가 양쪽 수용할 가능성. 동작 중 기능의 즉시 교체는 회귀 위험 |
| D9 | hr-certificate·hr-welfare·hr-personnel(education) BODY 보강 | **신판 실측 BODY로 보강**(3중 사번 마커·기간·searchYm 형식) | 현행 유지 | 신판 "임의 축약 금지". 누락 시 빌드별 회귀 위험 |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: hr-attendance `annual_leave_balance`는 신판 §3.1(TAADclzVcatnList1) 을, `leave_requests`는 §3.2(TAADclzVcatnList2)를 호출하며, §3 공통 BODY 필수 파라미터(staffId·cmmSearchStaffId 마커, wkareaCd, gubun=A, activeTab=0, searchSymdLv/EymdLv, searchSymdFy/EymdFy, searchBaseYmd(YYYY-MM-DD), chkAppYn=Y)를 전량 포함해야 한다. 휴가/회계연도 범위는 조회 연월의 연도 1/1~12/31로 산출.
- **FR-002**: hr-attendance `timesheet`는 TAA-1410(§2.1)을 호출하고, 출퇴근 중심 컬럼 화이트리스트(일자·요일·출근·퇴근·기준시각·상태)로 렌더해야 한다. TAA-0360 호출 코드는 제거.
- **FR-003**: hr-attendance `work_status`·`timesheet`의 기간 BODY는 §2.1 실측대로 searchBaseSYmd/EYmd와 searchSYmd/EYmd를 동시 포함해야 한다.
- **FR-004**: hr-attendance `work_calendar`는 §2.2 실측대로 searchId 외에 cmmSearchStaffId 마커와 searchBaseYmd(YYYY-MM-DD)를 추가해야 한다.
- **FR-005**: hr-attendance `overtime`/`overtime_limit`의 searchType은 2로 한다(D3).
- **FR-006**: hr-salary payslip류(payslip·deductions·payslip_summary)는 searchItem에서 유도한 searchYm(YYYY-MM 하이픈)과 searchType=web을 BODY에 포함해야 한다. searchType=mobile 차단 로직 유지.
- **FR-007**: hr-salary `salary_statement`는 SAL-0050(§1.2 SALSalaryBassMgr Tab110)을 호출하며(D5), 응답은 지급일·지급구분·직위·소속·지급합·공제합·실수령 화이트리스트로 렌더한다(detail HTML 버튼 필드 제외). 기간은 year_month 월 범위 + searchBaseYmd(오늘).
- **FR-008**: hr-approval은 기존 BODY에 searchSYmd/searchEYmd(YYYYMMDD)를 추가한다(D8, 병행 전송).
- **FR-009**: hr-certificate는 §6.4 실측 BODY(cmmSearchStaffId·staffId·searchStaffId 3중 마커, reqNoExist=N, searchSYmd/EYmd)로 보강한다. 기본 기간은 최근 18개월(실측 예시 준용).
- **FR-010**: hr-welfare는 §6.3 실측 BODY(searchBaseSYmd/EYmd)를 추가한다. cmmSearchStaffId 마커 필수 유지(전사 노출 방지 L2 가드 — 마커 누락 시 호출 중단).
- **FR-011**: hr-personnel `education`(Tab220)은 §4 공통 BODY(cmmSearchStaffId·staffId·searchStaffId 마커, searchYmd)로 보강한다. `profile`/`profile_detail`은 현행 유지(D6 보류).
- **FR-012**: 모든 교체·보강은 `_shared/hrSession.js`의 self 마커 계약(SELF_STAFF_ID_MARKER)과 클라이언트 위임/서버 폴백 이중 경로를 그대로 사용한다. LLM 노출 파라미터(query_type·year_month·pay_item·org_cd) 계약 불변.
- **FR-013**: E2E-First — 각 FR별 시나리오를 `server/scripts/e2e-hr-skill/scenarios.json`에 append하고 mock-hr-api가 신판 실측 BODY 필수 파라미터를 검증(누락 시 FAIL)하도록 확장한 뒤, FAIL 확인 → 수정 → 전건 PASS.
- **FR-014**: 신규 setup_arg `HR_WKAREA_CD`(기본 1000)를 hr-attendance plugin.json에 추가한다(D4). description 문구·enum·examples는 D5 라벨 외 불변.
- **FR-015** *(2026-07-24 사용자 지시로 범위 편입)*: 기존 E2E 시나리오 스위트(E1~E130, 전건 backup 시대 `/api/v1/` REST 대상)를 전면 정비한다 — ① 현행 skill에 대응 기능이 없는 시나리오(폐기 스킬 hr-personnel-search 포함)는 스위트에서 제거(원본은 legacy 파일로 보존), ② 대응 query_type이 존재하는 시나리오(연차·출퇴근·연장·휴가·급여명세·공제·교육이력·연말정산 등)는 kiwibox `.do` + body 검증으로 재작성하되 행태 검증 의도(기간 되묻기 금지·결정론성 repeat 등)를 승계한다.

### Key Entities

- **엔드포인트 스펙(ENDPOINT_MAP 항목)**: path·cmd·기간 파라미터 형식·staff 파라미터명·고정 BODY — 신판 실측 성공 본문이 유일 근거.
- **self 마커**: `$SELF_STAFF_ID` — 브리지(ssnStaffId)/서버 폴백(HR_STAFF_ID) 치환. 신판 "self 강제" 규칙의 구현체.
- **컬럼 화이트리스트**: query_type별 응답 필드 → 한글 라벨 매핑. 민감정보(주민번호·계좌·주소) 차단 L2 가드.

## Success Criteria *(mandatory)*

- **SC-001**: E2E HR skill 시나리오 전건 PASS(기존 + 신규 append분). 신규 시나리오는 수정 전 FAIL이 재현된다.
- **SC-002**: "연차 잔여" 질문이 운영 환경(ntest.5240.kr 실계정)에서 실데이터(종류별 발생/사용/잔여)를 반환한다 — 현행 NULL/빈 응답 해소.
- **SC-003**: 6개 HR skill의 kiwibox 호출 BODY가 신판 카탈로그 실측 본문과 파라미터 단위로 일치한다(D4 orgCd 예외, D8 병행분 초과 허용).
- **SC-004**: 미사용·폐기 판정 endpoint(getMBLHomeLeaveDetail·getMBLLeavDetailStaff·TAA-0360·SAL-0220) 호출 코드 0건 (D6 보류분 제외).
- **SC-005**: 응답 렌더에 주민번호·계좌·주소 등 신판 ★민감 필드 미노출 유지.
- **SC-006**: scenarios.json에 backup 시대 `/api/v1/` 패턴 시나리오 0건 — 스위트 전건이 현행 skill 계약 기준으로 실행·판정 가능.

## Assumptions

- 신판 카탈로그의 실측 BODY가 운영 대상 빌드(ntest.5240.kr)와 일치한다 — 카탈로그 자체가 오늘 검증본.
- 클라이언트 위임 브리지는 path 화이트리스트를 두지 않거나, 두면 신규 path 등록이 같은 작업 범위에 포함된다(구현 중 확인).
- wkareaCd=1000은 현 고객사 단일 사업장 가정의 안전한 기본값 — 다사업장은 setup_arg로 조정.
- 신판 §9 미확정 endpoint(TAA-0810, PFM-0250 등)는 본 작업 범위 외 — 등록하지 않는다.
- hr-year-end-tax는 신판 §8 "연말정산 별도 취급" — 본 작업 범위 외.

## Out of Scope

- 신규 query_type 추가(인사카드 가족/경력/자격 등 §4 탭 확장, §7 메뉴 네비 도구화, §5.2 결재 본문) — 별도 스펙. (해당 기능 대상 legacy 시나리오는 FR-015 ①로 제거 — 기능 재도입 시 legacy 보존본에서 참조)
- D6 profile의 Tab100 교체 — 별도 스펙(민감정보 심의).
- 브리지/embed 계약 변경(신규 마커 등).
