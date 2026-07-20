# Feature Specification: hr-year-end-tax 5240 HR(kiwibox) 직접 통합 전환

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: 구현 완료 (2026-07-16). 승인: 최신연도 기본+지원연도 지정 / 6종→실측상 5종 / 주민번호·계좌·PK·코드값 제외.
**Input**: kiwibox §7(원칙 제외 해제 지시) + kiwibox 소스 실측 (카탈로그 §4에 표 없음 — YTA 전수 실측)

## 무엇을 (What)

hr-year-end-tax를 폐기 예정 중간 REST API(`/api/v1/year-end-tax/*`)에서 5240 HR(kiwibox)
YTA(연말정산) 엔드포인트 직접 호출로 전환. R1 클라이언트 위임(003)·hrSession 공용.
v1.1.0 → v2.0.0.

## 정책 반전 (사용자 지시)

- 카탈로그 §7 "원칙 제외(연말정산 등록 금지)" **해제**.
- 단 **주민번호 등 고위험 정보는 노출하지 않음** — 화이트리스트 컬럼 렌더로 강제.

## 실측 (kiwibox 소스)

- 연말정산 = **YTA**, 소스는 `REW/YTA{연도}/` (YTA2022~2025 연도별 폴더).
- **컨트롤러가 연도별 분리**: `@RequestMapping("/YTASummaryMgr2024.do")` — 경로에 연도 박힘.
  cal_yy는 파라미터가 아니라 **경로 연도**(`/YTA{Name}Mgr{YYYY}.do`).
- **self 강제 지점 일관**: 거의 전 endpoint가 `cmmSearchStaffId` 파라미터 → `$SELF_STAFF_ID` 강제.
- **주민번호(CTZ_NO 계열) 반환 파일 14개** (summary·family·medical·dedct 등 대부분) —
  화이트리스트에서 **전면 제외** 필수.

## query_type ↔ 엔드포인트 계약 (현행 10종 매핑)

경로 = `/YTA{Name}Mgr{YYYY}.do?cmd=get...`. YYYY=cal_yy(기본 최신연도).

| query_type | 엔드포인트(Name) | self | 주민번호 | 상태 |
|---|---|---|---|---|
| summary(공제요약) | YTASummaryMgr getYTASummaryMgrList | cmmSearchStaffId | 있음→제외 | 확정 |
| result(연말정산결과) | YTAYndListMgr getYTAYndListMgrList | cmmSearchStaffId | 있음→제외 | 확정 |
| medical(의료비) | YTAYndMedDtlMgr getYTAYndMedDtlMgrList | cmmSearchStaffId | 있음→제외 | 확정 |
| family(부양가족공제) | YTAYtaFamilySttusMgr getYTAYtaFamilySttusMgrList | cmmSearchStaffId | **핵심→제외** | 확정 |
| previous_employer(종전근무지) | YTAYndBefWrkDtlMgr getYTAYndBefWrkDtlMgrList | cmmSearchStaffId | 있음→제외 | 확정 |
| donation(기부금) | YTAYndGivPayDtlMgr getYTAYndGivPayDtlMgrList | cmmSearchStaffId | 있음→제외 | 확정 |
| credit_card(신용카드) | YTAInDctMgr getYTAInDctMgrTab*List (추정) | cmmSearchStaffId | 있음→제외 | **잔여 실측** |
| insurance(보장성보험) | YTAYndDedctDtlMgr(공제상세 항목) 추정 | cmmSearchStaffId | 있음→제외 | **잔여 실측** |
| education(교육비) | 同 공제상세 항목 추정 | — | — | **잔여 실측** |
| savings(연금저축) | 同 공제상세 항목 추정 | — | — | **잔여 실측** |

- insurance/education/savings/credit_card는 별도 endpoint인지 공제상세(DedctDtl) 항목 분기인지
  미확정 — 구현 전 실측(T5).

## 파라미터 계약

- LLM 노출: `query_type` + `cal_yy`(귀속연도, 선택 — 미지정 시 최신).
  cal_yy는 **경로 연도**로 변환(`/YTA{Name}Mgr{cal_yy}.do`). emp_no 제거.
- 대상: `cmmSearchStaffId`=`$SELF_STAFF_ID` 마커(self 강제).
- 전송: hrSession 공용.

## 주민번호·고위험 화이트리스트 (핵심 요구)

- 각 query_type handler는 **화이트리스트 컬럼만 렌더**(hr-approval/hr-certificate/education 패턴).
- **전면 제외**: CTZ_NO(주민번호) 및 파생, 계좌(ACC_NO/BANK), 내부 PK(STAFF_ID), 코드값(*_CD raw).
- 노출: 항목명·금액·공제액·한도·연도 등 사람이 읽는 값만. 항목별 컬럼은 T5에서 확정.

## 승인 필요 결정점

1. **연도별 경로 처리** — 브리지 allowlist가 정확 매칭인데 YTA는 `/YTA*Mgr{YYYY}.do` 다수.
   (a) 최신연도 1개만 고정 지원(cal_yy 무시) / (b) 브리지에 YTA 패턴 매칭 추가
   (`^/YTA[A-Za-z]+Mgr20\d{2}\.do$`) — 제한적 정규식 / (c) 지원 연도 목록(2022~2025) 명시 allowlist
2. **query_type 범위** — 현행 10종 유지 vs 확정된 6종(summary/result/medical/family/previous_employer/donation) 먼저 + 나머지 4종 T5 후 추가
3. **주민번호 외 추가 제외 필드** — 계좌·소득금액 등 어디까지 노출/제외

## 범위 밖

- `getStaffIdByCtzno`(주민번호 역조회) — 카탈로그 §7 등록 금지 유지(이건 해제 안 함)
- 원천징수영수증 출력·NTS 파일 생성 등 발급 액션 — 조회 전용

## 잔여 실측 (T5)

- credit_card/insurance/education/savings endpoint 확정 (별도 vs 공제상세 항목)
- 각 endpoint 반환 컬럼 → 화이트리스트 확정 (주민번호·계좌 제외 후 노출 컬럼)
- cal_yy 미지정 시 최신연도 판정 방법 (하드코딩 vs 현재일 기준)
- 지원 연도 범위(2022~2025) 및 브리지 경로 정책(결정점 1)
