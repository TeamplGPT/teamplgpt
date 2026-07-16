# Tasks: hr-salary 5240 HR(kiwibox) 직접 통합 (2단계 재설계 r2)

승인 이력: spec 결정표(S1~S7)·브리지 확장 승인 → 실측 후 2단계 재설계 승인 (2026-07-16).
상태: T1~T4 완료 + 스모크 PASS. T4b·T5·T6 잔여.

## 실측 완료 (kiwibox 소스 — 추정 3건 중 2건 오류 → 2단계 재설계)

- [A] `searchItem` = **급여일자(SAL_YMD 8) + 급여유형코드(SAL_TYPE_CD) 복합키** (YYYYMM 아님).
  콤보 `getSalYmdTypeCdList2`의 `CODE` 값 = searchItem. → 2단계 체이닝 확정.
- [B] `SALSalaryDtstmnMgr`도 동일 `searchItem` (searchBaseSYmd/EYmd 아님).
- [C] `searchType` 미전송 = 게이트 적용 = 안전 (현행 유지 확인).
- daylabor = `searchDateSYmd/EYmd` (searchBaseYm 아님).

## 완료

- [x] **T1** 백업 — `agent-skills-backup/20260716/hr-salary/` (커밋 27df9641)
- [x] **T2** handler.js v2.2.0 — 2단계 체이닝: pay_periods(CommonCode getSalYmdTypeCdList2)
  → payslip/deductions/payslip_summary/salary_statement(pay_item=searchItem) + daylabor(기간).
  self 강제, gate, searchType=mobile 차단
- [x] **T3** plugin.json v2.2.0 — query_type 6종(pay_periods 추가), pay_item 체이닝 파라미터,
  HR_SAL_APPL_CD setup_arg, emp_no 제거, hr-year-end-tax 경계 유지
- [x] **T4** 브리지 allowlist 14 → 18 (SAL* 3 + CommonCode.do) + **queryId 화이트리스트**
  (getSalYmdTypeCdList/List2만 — 범용 endpoint 임의 쿼리 차단)
- [x] 스모크 PASS: pay_periods 목록·pay_item 누락 안내·2단계 명세·daylabor 기간·
  queryId 화이트리스트(정상/악성/누락) 단위 검증·pending 누수 0

## 잔여

- [ ] **T4b** okrservice 작업지시서 §1.5에 `/CommonCode.do` + queryId 화이트리스트 규칙
  반영 (SAL* 3경로는 반영됨 — CommonCode만 추가)
- [ ] **T5 실환경 확정**:
  - `HR_SAL_APPL_CD`(applCd) 필요 여부·값 — 빈 값 시 전체 급여유형 반환되는지
  - 콤보 CODE 형식(SAL_TYPE_CD 길이 — xSUBSTR(searchItem,9,10) 기준)
  - 급여 응답 키 케이스 → 컬럼 한글 라벨 매핑
- [ ] **T6** E2E 시나리오(2단계 체이닝 포함) + report. 고객사 급여 노출 정책 승인 후
  embed allowed skills에 hr-salary 추가.
