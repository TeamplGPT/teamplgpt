# Contract: query_type별 kiwibox 요청 BODY (to-be)

신판 카탈로그 실측 성공 본문 기준. `$SELF` = `$SELF_STAFF_ID` 마커(브리지/폴백 치환). `{...}` = 파생 산출(research.md R-3). 굵게 = 이번 변경분.

## hr-attendance

| query_type | path?cmd | BODY (마커·파생 포함) |
|---|---|---|
| timesheet | **/TAAWrkTimeStatusMgr.do?cmd=getTAAWrkTimeStatusMgrList** | cmmSearchStaffId=$SELF & searchBaseSYmd={월초} & searchBaseEYmd={월말} & **searchSYmd={월초} & searchEYmd={월말}** |
| work_status | /TAAWrkTimeStatusMgr.do?cmd=getTAAWrkTimeStatusMgrList | 상동 (**searchSYmd/EYmd 추가**) |
| work_calendar | /TAADclzWorkSearchCldr.do?cmd=getTAADclzWorkSearchCldr | searchId=$SELF & **cmmSearchStaffId=$SELF** & searchYm={YYYYMM} & **searchBaseYmd={오늘 YYYY-MM-DD}** |
| overtime | /TAADclzWorkOtSchdul.do?cmd=getTAADclzWorkOtSchdulList2 | cmmSearchStaffId=$SELF & searchBaseSYmd/EYmd={월범위} & **searchType=2** |
| overtime_limit | /TAADclzWorkOtSchdul.do?cmd=getTAADclzWorkOtSchdulList | 상동 (**searchType=2**) |
| annual_leave_balance | **/TAADclzVcatnList.do?cmd=getTAADclzVcatnList1** | **staffId=$SELF & cmmSearchStaffId=$SELF & wkareaCd={HR_WKAREA_CD} & searchLeavCd= & gubun=A & activeTab=0 & searchSymdLv={Y0101} & searchEymdLv={Y1231} & searchSymdFy={Y0101} & searchEymdFy={Y1231} & searchBaseYmd={오늘 YYYY-MM-DD} & chkAppYn=Y** |
| leave_requests | **/TAADclzVcatnList.do?cmd=getTAADclzVcatnList2** | 상동 (§3 공통 BODY) |
| vacation_calendar | /TAADclzVcatnCldrMgr.do?cmd=getTAADclzVcatnCldrMgr | 현행 유지 (searchSYmd/EYmd 월범위) |

제거: `/TAAWrkTimeListMgrByDate.do`, `/getMBLLeavDetailStaff.do`, `/getMBLHomeLeaveDetail.do` 호출 코드 0건 (SC-004).

> [2026-09-04 후속] kiwibox SQL 실독으로 위 표 일부가 교정됨(본문은 2026-07 계약으로 보존). work_calendar는 `searchSYmd={월초}&searchEYmd={월말}` 추가(SQL이 A.YMD BETWEEN으로 읽어 누락 시 항상 0건). overtime/overtime_limit는 `searchBaseSYmd/EYmd` 대신 `searchYm={YYYYMM}`(SQL 정본, base 계열은 읽지 않음). 현행: `docs/hr-local-kiwibox-test-guide.md` §1.4·1.5.

## hr-salary

| query_type | path?cmd | BODY |
|---|---|---|
| pay_periods | /CommonCode.do?cmd=getCommonNSCodeList | queryId=getSalYmdTypeCdList2 & closeChk=Y & **searchYm={YYYY-MM 하이픈}** & staffId=$SELF (& applCd={HR_SAL_APPL_CD}) |
| payslip | /SALPayslipNewMgr.do?cmd=getSALPayslipNewMgrList | cmmSearchStaffId=$SELF & **searchYm={pay_item 유도 YYYY-MM}** & searchItem={pay_item} & **searchType=web** |
| deductions | …List2 | 상동 |
| payslip_summary | …Map (응답 `{"Map":{...}}` — R-5 언랩) | 상동 |
| salary_statement | **/SALSalaryBassMgr.do?cmd=getSALSalaryBassMgrTab110List** | **cmmSearchStaffId=$SELF & searchSYmd={월초} & searchEYmd={월말} & searchBaseYmd={오늘 YYYY-MM-DD}** |
| daylabor | /SALDaylabMgr.do (현행 유지) | 현행 유지 |

제거: `/SALSalaryDtstmnMgr.do` (SAL-0220 폐기).

> [2026-09-04 후속] 위 "제거" 판정과 payslip 행의 `/SALPayslipNewMgr.do`는 2026-07 시점 기록으로 보존하되 현행 handler와 상충한다. kiwibox 소스 실독 결과 `/SALPayslipNewMgr.do`는 컨트롤러 매핑이 없는 유령 경로(뷰 cmd만 존재)이고 급여명세 JSP도 `SALSalaryDtstmnMgr`를 호출함 → handler는 payslip/deductions/payslip_summary를 `/SALSalaryDtstmnMgr.do?cmd=getSALSalaryDtstmnMgrList / List2 / Map`으로 재정렬(BODY는 위 행과 동일: cmmSearchStaffId=$SELF & searchYm={pay_item 유도 YYYY-MM} & searchItem={pay_item} & searchType=web). 당시 "빈 응답"은 파라미터(searchItem/cmmSearchStaffId/AUTF 게이트) 문제였을 **가능성**이 있으나 확정 아님 — 스테이징 재실측 필요. salary_statement 행도 SQL 정본 파라미터 `findText={YYYY}&staffId=$SELF`로 교정됨(cmmSearchStaffId/searchSYmd/searchBaseYmd는 SQL이 읽지 않아 staffId 누락 시 항상 0건). 현행: `docs/hr-local-kiwibox-test-guide.md` §1.2·1.3, 정본 코드 `hr-salary/handler.js`.

## hr-approval

| query_type | BODY |
|---|---|
| pending/drafted/completed/rejected/referenced | cmd=getEAPRequestMgrList & selectGubun={2~6 유지} & searchStaDate/EndDate={월범위 유지} & **searchSYmd={월초} & searchEYmd={월말}** (D8 병행) |

> [2026-09-04 후속] 기간 파라미터 정본은 `sdt/edt`(EAPRequestMgr_SQL·eapRequestMgr.jsp 실독). searchStaDate/EndDate·searchSYmd/EYmd는 SQL이 읽지 않아 D8 병행 전송으로도 기안함(2)·참조(5)는 '오늘 하루', 미결/기결/반려(3·4·6)는 전체기간이 되었음. 현행 BODY: `cmd=getEAPRequestMgrList & selectGubun={2~6} & sdt={월초 또는 최근 3개월 초일} & edt={월말 또는 오늘}`. 현행: `docs/hr-local-kiwibox-test-guide.md` §1.1.

## hr-certificate

| query_type | BODY |
|---|---|
| requests | cmd=getCTIMcrtfReqstRefromMgrList & **cmmSearchStaffId=$SELF &** staffId=$SELF & **searchStaffId=$SELF** & reqNoExist=N & **searchSYmd={18개월 전 초일} & searchEYmd={오늘 YYYYMMDD}** |

> [2026-09-04 후속] `getCTIMcrtfReqstRefromMgrList`는 신청화면 초기조회용으로 `B.REQ_NO(+)=#{reqNo}` 단건 외부조인이라 reqNo 없이 호출하면 목록이 구조적으로 1건만 반환됨(운영 증상 "4건 발급했는데 1건만 조회"). handler는 발급내역 화면의 `/CTIMcrtfIssuMgr.do?cmd=getCTIMcrtfIssuMgrList`로 재정렬 — BODY: `staffIdNm=$SELF & searchSymd={18개월 전 초일} & searchEymd={오늘 YYYYMMDD}`(파라미터명 소문자 ymd). AUTF_SRCH_STAFF_YN(activeMenuCd) 게이트가 일반 사용자 self 조회를 허용하는지는 스테이징 실측 필요. 현행: `docs/hr-local-kiwibox-test-guide.md` §1.8.

## hr-welfare

| query_type | BODY |
|---|---|
| loan | cmd=getLONLoanReqstListMgrList1 & cmmSearchStaffId=$SELF & **searchBaseSYmd={18개월 전 초일} & searchBaseEYmd={오늘 YYYYMMDD}** — cmmSearchStaffId 마커 미치환/공란 시 호출 중단(L2, 전사 노출 방지) |

## hr-personnel

| query_type | BODY |
|---|---|
| education | cmd=getPRCHrBassiemMgrTab220List & staffId=$SELF & **cmmSearchStaffId=$SELF & searchStaffId=$SELF & searchYmd={오늘 YYYY-MM-DD}** & checkHst=N(유지) |
| profile / profile_detail / org_* / todo_count / schedule_day / contact_directory | 현행 유지 (D6 보류·D7 유지) |

> [2026-09-04 후속] org_members(`/getMBLHrBassiemMemberList.do`)는 SQL의 sub_org_yn(`searchTypeVal`)이 'Y'/'N' 양자 분기라 미전송 시 항상 0건 → handler는 `searchTypeVal=N` 고정 추가. 현행: `docs/hr-local-kiwibox-test-guide.md` §1.6.

## LLM 노출 계약 (불변)

`entrypoint.params`: query_type(enum 불변)·year_month·pay_item·org_cd — 추가/삭제/의미 변경 없음. plugin.json 변경은 hr-attendance `setup_args.HR_WKAREA_CD` 신설 + hr-salary salary_statement 매핑표 라벨(월별 지급내역) 문구뿐.
