# Feature Specification: hr-welfare (복리후생) 신규 skill

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: 구현 완료 (2026-07-16). 승인: 대출만 반영(경조금·의료비·학자금 유용성 없음/부적합). 이율·잔액 노출, 계좌 제외.
**Input**: kiwibox §4.10 + §7 + kiwibox 소스 실측

## 무엇을 (What)

본인 복리후생(대출 신청내역, 동호회 가입여부 등)을 5240 HR(kiwibox)에서 조회하는 신규
agent-skill. R1 클라이언트 위임(003)·hrSession 공용. hubId `hr-welfare`. 계좌·주민번호 제외.

## 실측 판정표 (§4.10 6대 항목 — 대부분 부적합)

| 항목 | endpoint | self | 판정 | 사유 |
|---|---|---|---|---|
| **대출 신청내역** | LONLoanReqstListMgr getLONLoanReqstListMgrList1 | cmmSearchStaffId | **채택** | self 강제 가능, 목록형, 계좌(BANK/ACC_NO) 제외 후 안전 |
| 동호회 가입여부 | CLBClbReqstMgr getCLBClbReqstMgrYn | cmmSearchStaffId | **채택(간단)** | Y/N 단순, 비민감 |
| 경조 대상 가족 | CACCtsmnReqstDetMgr getCACCtsmnReqstDetMgrFamSelfCd | cmmSearchStaffId | **조건부** | 가족구분(코드값)·생년 — 코드명 없음, 빈약 |
| 대출 상환 | …List2/3 | cmmSearchStaffId+searchApplDate | 보류 | searchApplDate=List1 체이닝 필요(2단계) |
| **의료비** | MDEMedReqstDetMgr getMDEMedReqstDetMgrYlA | searchApplStaffId | **부적합** | famNm·famRelCd·reqYmd **필수** — 특정 가족·연월 지정, self만으로 조회 불가 |
| **학자금** | SCESchxpnReqstDetMgr getBasisInfo | searchApplStaffId | **부적합** | acaCd·famNm·sceYm 필수 — 학교코드·가족명 지정 |
| 휴양시설 신청 | RCFRefReqstMgr getRCFRefReqstMgrDetMap | reqNo | **제외** | reqNo 단건, self 검증 없음(§4.4식 위험) |
| 시설 마스터 | RCFRefMgr getRCFRefMgrList | 공용 | 보류 | 비민감 공용이나 복지 조회와 무관(시설 안내) |
| 사회보험 부양가족 | SCIRegDependent | cmmSearchStaffId | **제외** | FAM_CTZ_NO(주민번호) 반환 — §7 등록 금지 |
| 주민번호 역조회 | getStaffIdByCtzno | ctzno | **제외** | §7 등록 금지 |

## query_type ↔ 엔드포인트 계약 (채택 후보)

| query_type | 역할 | 엔드포인트 | 파라미터 | self |
|---|---|---|---|---|
| loan | 대출 신청내역 | LONLoanReqstListMgr getLONLoanReqstListMgrList1 | cmmSearchStaffId | c→self강제 |
| club_membership | 동호회 가입 신청여부 | CLBClbReqstMgr getCLBClbReqstMgrYn | cmmSearchStaffId | c→self강제 |
| (선택) gyeongjo_family | 경조 대상 가족 | CACCtsmnReqstDetMgr getCACCtsmnReqstDetMgrFamSelfCd | cmmSearchStaffId | c→self강제 |

- LLM 노출: `query_type`만. cmmSearchStaffId=`$SELF_STAFF_ID`(self 강제).
- **대출 List1 주의(§4.10)**: cmmSearchStaffId 미지정 시 전사 대출내역 노출 — self 강제 **필수**
  (마커 항상 주입).

## 화이트리스트 (계좌·PK·코드값 제외)

- **loan**: LOA_TYPE_CD_NM(대출유형), LOA_REPAY_CD_NM(상환방식), REQ_DATE(신청일),
  AMT(신청금액), APPL_FORM(신청서). **제외**: BANK/ACC_NO(계좌), APPL_STAFF_ID(PK),
  이율·잔액(있으면 민감 — 실측 후 판단)
- **club_membership**: 가입여부(Y/N) — 단순 렌더
- **gyeongjo_family**: FAM_SELF_CD(가족구분 — 코드명 없으면 제외 검토), BIR_YMD(생년)

## 승인 필요 결정점

1. **범위** — (a) loan + club_membership만(권장, 명확히 안전·유용) /
   (b) + gyeongjo_family(경조 가족, 코드값 빈약) / (c) 더 넓게(대출 상환 2단계 등 추가 개발)
2. **의료비·학자금 부적합 확인** — 파라미터 복잡(가족명·학교코드)으로 self 자동 조회 불가.
   범위 밖 확정 동의 여부 (필요 시 별도 2단계 스펙 회차)
3. **대출 이율·잔액 노출 여부** — 금액 계열, 계좌는 확정 제외. 이율/잔액은 실측 후 결정

## 범위 밖

- 의료비·학자금(파라미터 복잡), 휴양 reqNo 상세, 사회보험 주민번호, 신청 단건 Map(reqNo 무검증)
- 복지 신청·발급 액션 — 조회 전용

## 잔여 실측 (T5)

- loan List1 이율/잔액 컬럼 유무 → 화이트리스트 확정
- club Yn 반환 형식(Y/N vs 가입 동호회 목록)
- gyeongjo FAM_SELF_CD 코드명 변환 여부
- LON 컨트롤러 경로(`/LONLoanReqstListMgr.do` 확인됨), CLB/CAC 경로
