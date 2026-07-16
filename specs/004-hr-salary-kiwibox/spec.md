# Feature Specification: hr-salary 5240 HR(kiwibox) 직접 통합 + 항목 보정

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: **specify 단계 — 사용자 승인 대기 (풀 게이트)**
**Input**: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` §4.5(급여), §7(민감도)

## 무엇을 (What)

hr-salary agent skill을 001·002·003과 동일한 R1 클라이언트 위임 구조로 전환하고,
query_type을 카탈로그 §4.5 실존 엔드포인트 기준으로 보정한다. v1.5.0 → v2.1.0.

## 민감도 전제 (§7 — 승인 필수 항목)

카탈로그는 급여명세·일용직을 **"보류(고위험)"**로 분류: "조직 승인 + self 강제 필수,
계좌 노출 비권장". 본 스펙은 다음 전제로 제공한다:

- R1 구조상 **본인 세션으로만** 조회(self 강제 + 서버 게이트 b) — 타인 급여 조회 경로 없음
- 계좌 관련 항목은 **전면 제거** (아래 결정표 S1)
- `searchType=mobile` 게이트 스킵 차단 유지 (§4.5 위험 명시 사항)
- **조직(고객사) 정책 승인은 별도 필요** — 배포 전 확인 사항으로 명시

## 항목 보정 결정표 (구 10종 → 신 5종) — 승인 대상

| # | 기존 query_type | 처분 | 근거 |
|---|---|---|---|
| S1 | account(급여 이체 계좌) | **제거** | §4.5/§7 — 계좌(CMMF_DECR 복호화 ACC_NO) 노출 비권장. 대응 정본 endpoint도 무게이트 모바일 팝업뿐(채택 금지) |
| S2 | payslip | 유지 — `getSALPayslipNewMgrList`(지급항목 명세) | §4.5 정본(b) |
| S3 | deductions | 유지 — `getSALPayslipNewMgrList2`(공제내역) | §4.5 정본(b) |
| S4 | (신규) payslip_summary | 추가 — `getSALPayslipNewMgrMap`(헤더+지급/공제/차감 합계) | 합계 요약 질의("이번 달 실수령액") 대응. List3(합계)는 Map과 중복이라 미채택 |
| S5 | (신규) salary_statement | 추가 — `getSALSalaryDtstmnMgrList`(기간형 급여명세) | §4.5 정본(b) |
| S6 | (신규) daylabor | 추가 — `getSALDaylabMgrList`(일용직 일자별 지급/공제/실지급) | §4.5 데스크탑 정본(b). 모바일 동등(무게이트+복호화 계좌)은 채택 금지 |
| S7 | compare(월별 비교), annual_total(연간 총액), bonus(성과급), base_amount(기본급), leave_pay_rate(휴직 지급률), pay_step(호봉), retroactive(소급) | **제거** | 카탈로그에 대응 endpoint 없음. 소급분은 payslip 응답에 포함(§4.5 "항목·금액·소급"). 비교·연총액은 LLM이 월별 조회 조합으로 대체 가능 |

## 파라미터 계약 (r2 — 실측 반영, 2단계 체이닝)

**실측 결과 추정 3건 중 2건 오류 확정** → 급여 명세는 2단계 구조로 재설계.

- `searchItem`은 YYYYMM이 아니라 **급여일자(SAL_YMD 8자리) + 급여유형코드(SAL_TYPE_CD) 복합키**
  ([SALPayslipNewMgr_SQL.xml:50-51](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/REW/SAL/SALPayslipNewMgr_SQL.xml#L50)).
  salary_statement도 동일 searchItem 사용(searchBaseSYmd/EYmd 아님).
- searchItem 값은 콤보 선행 조회로 획득:
  `CommonCode.do?cmd=getCommonNSCodeList` + `queryId=getSalYmdTypeCdList2&searchYm=YYYYMM&staffId=<STAFF_ID>&applCd=<프로그램코드>`
  → 반환 각 항목 `CODE`(=searchItem) + `CODE_NM`(예 "2026-06-25 정기급여"), SAL_YMD DESC 정렬
  ([NsCode_SQL.xml getSalYmdTypeCdList2](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/SYS/CMM/NsCode_SQL.xml)).
- daylabor는 2단계 불요: `searchDateSYmd`/`searchDateEYmd`(기간, xREPLACE로 '-' 제거) + cmmSearchStaffId
  ([SALDaylabMgr_SQL.xml:86-90](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/REW/SAL/SALDaylabMgr_SQL.xml#L86)).
- searchType: 미전송 = 게이트 적용 = 안전 (현행 유지, 실측 C 확인).

### query_type (2단계 체이닝 — hr-personnel org_tree→org_members 패턴)

| query_type | 역할 | 엔드포인트 | 파라미터 |
|---|---|---|---|
| **pay_periods** (신규) | 월의 지급 건 목록(급여일자+유형) | CommonCode.do getCommonNSCodeList | year_month→searchYm, staffId=$SELF, applCd(setup) |
| payslip | 지급항목 명세 | SALPayslipNewMgr getSALPayslipNewMgrList | pay_item(=searchItem, 체이닝) |
| deductions | 공제내역 | 同 List2 | 동일 |
| payslip_summary | 실수령 요약 | 同 Map | 동일 |
| salary_statement | 기간 급여명세 | SALSalaryDtstmnMgr List | 동일 pay_item |
| daylabor | 일용직 | SALDaylabMgr List | year_month→searchDateSYmd/EYmd |

- LLM 노출: `query_type` + `year_month` + `pay_item`(체이닝 — pay_periods 결과 CODE만,
  org_cd와 동일하게 handler가 누락 시 "pay_periods 먼저" 안내).
- 전 명세 항목: `cmmSearchStaffId`=`$SELF_STAFF_ID`, gate:true. 전송은 `_shared/hrSession.js` 공용.
- `applCd`: setup_arg `HR_SAL_APPL_CD`(옵션) — 급여유형 필터 프로그램코드. 빈 값이면
  전체 유형 반환(실환경 확정 T5). 클라이언트 위임 모드에서는 브리지가 페이지 applCd 주입 가능.

### 브리지 allowlist 확장 (승인 대상)

- `/SALPayslipNewMgr.do`, `/SALSalaryDtstmnMgr.do`, `/SALDaylabMgr.do` + **`/CommonCode.do`**
- ⚠️ `/CommonCode.do`는 범용 endpoint — 브리지에서 **form 값 화이트리스트** 병행:
  `queryId` ∈ {getSalYmdTypeCdList, getSalYmdTypeCdList2}만 허용(임의 queryId 실행 차단).

## 파급 (승인 대상)

- **브리지 allowlist 3경로 추가**: `/SALPayslipNewMgr.do`, `/SALDaylabMgr.do`,
  `/SALSalaryDtstmnMgr.do` — `extras/kiwibox-bridge/teamplgpt-hr-bridge.js` +
  okrservice 작업지시서(`docs/teamplgpt-hr-client-tools-workorder.md`) §1.5 동기 수정
- hr-year-end-tax와의 경계: 연말정산 질의는 기존대로 hr-year-end-tax — description
  경계 문구 유지

## 실측 항목 (T5)

- [A] `searchItem` 의미·형식 (지급 연월 YYYYMM 추정 — 오판 시 빈 결과)
- [B] `SALSalaryDtstmnMgr` 기간 파라미터명 (searchBaseSYmd/EYmd 추정)
- [C] payslip 계열 `searchType` 웹 기본값 (mobile 외 값 필요 여부)

## 범위 밖

- 계좌·연말정산·주민번호 파생(§7 원칙 제외/등록 금지)
- 급여 데이터 마스킹 정책(고객사별) — 배포 정책 단계
