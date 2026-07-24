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

## hr-approval

| query_type | BODY |
|---|---|
| pending/drafted/completed/rejected/referenced | cmd=getEAPRequestMgrList & selectGubun={2~6 유지} & searchStaDate/EndDate={월범위 유지} & **searchSYmd={월초} & searchEYmd={월말}** (D8 병행) |

## hr-certificate

| query_type | BODY |
|---|---|
| requests | cmd=getCTIMcrtfReqstRefromMgrList & **cmmSearchStaffId=$SELF &** staffId=$SELF & **searchStaffId=$SELF** & reqNoExist=N & **searchSYmd={18개월 전 초일} & searchEYmd={오늘 YYYYMMDD}** |

## hr-welfare

| query_type | BODY |
|---|---|
| loan | cmd=getLONLoanReqstListMgrList1 & cmmSearchStaffId=$SELF & **searchBaseSYmd={18개월 전 초일} & searchBaseEYmd={오늘 YYYYMMDD}** — cmmSearchStaffId 마커 미치환/공란 시 호출 중단(L2, 전사 노출 방지) |

## hr-personnel

| query_type | BODY |
|---|---|
| education | cmd=getPRCHrBassiemMgrTab220List & staffId=$SELF & **cmmSearchStaffId=$SELF & searchStaffId=$SELF & searchYmd={오늘 YYYY-MM-DD}** & checkHst=N(유지) |
| profile / profile_detail / org_* / todo_count / schedule_day / contact_directory | 현행 유지 (D6 보류·D7 유지) |

## LLM 노출 계약 (불변)

`entrypoint.params`: query_type(enum 불변)·year_month·pay_item·org_cd — 추가/삭제/의미 변경 없음. plugin.json 변경은 hr-attendance `setup_args.HR_WKAREA_CD` 신설 + hr-salary salary_statement 매핑표 라벨(월별 지급내역) 문구뿐.
