# Feature: hr-education — hr-personnel에 `education` query_type 추가

**Status**: 구현 완료 (2026-07-16). 최초 "보류"였다가 self 정본 발견 후 전환.
**Input**: kiwibox §4.7 + §8 + kiwibox 소스 실측 (AI self SQL → 동일 테이블 정본 endpoint 역추적)

## 반전 경위

1차 결론은 **보류** — EDU 도메인 파일(`DEV/EDU/*`)엔 self 목록 정본 부재
(`getEDUNmHistMgrList`는 STAFF_ID 필터 없음, self인 것은 단건 Map/팝업뿐).

이후 kiwibox 자체 AI(`cmmAiAssistant`)의 self SQL `getCMMAiAssistantMyEduHistoryList`
(테이블 `EDUT_HST2`, `A.STAFF_ID=#{ssnStaffId}` 순수 self)를 발견. AI 전용 컨트롤러라 직접
호출 불가지만, **동일 테이블 EDUT_HST2를 쓰는 기존 정식 `.do`**를 역추적해 정본 확보.

## 정본 (실측 확정)

- 엔드포인트: `POST /PRCHrBassiemMgrTab220.do?cmd=getPRCHrBassiemMgrTab220List`
  (인사카드 교육이력 탭 — hr-personnel profile_detail과 동일 인사카드 계열)
- self 강제: `staffId` 파라미터 → `$SELF_STAFF_ID` 마커 치환 (다른 hr-personnel query_type과 동일)
- 고정: `checkHst="N"` (현재 사번만, 과거 사번 이력 제외)
- 소스 테이블: `EDUT_HST2` (kiwibox AI self SQL과 동일)

## 결정: 신규 skill 아닌 hr-personnel 확장 (승인 A)

인사카드 데이터라 hr-personnel에 query_type 1개 추가. v2.2.0.

## 반환 컬럼 화이트리스트 (실측 — 코드값·내부 식별자 제외)

- **노출**: EDU_NM(교육명), STA_YMD/END_YMD(기간), OFC_NM(교육기관),
  CONTENTS_NM(교육내용), EDU_TIME(교육시간), EDU_POINT(교육포인트), EDU_MEMO(비고)
- **제외**: REQ_NO·STAFF_ID·PRE_STAFF_ID(내부 PK), INOUT_CD·EDU_LCATEG_CD·EDU_MCATEG_CD·
  FIN_CD·REQ_STATUS_CD(코드값 — 이 SQL은 코드명 미변환 raw CD), REQ_DATE/REQ_DATE2(내부), NOTE
- handler에 `columns` 화이트리스트 렌더 경로 신설(코드값 노출 방지). 기존 query_type은 통짜 유지.

## 구현

- handler: ENDPOINT_MAP.education(cmd/fixed/columns 지원 추가), formatWhitelisted() 신설
- plugin.json v2.2.0: enum +education, 매핑·example 추가
- 브리지 allowlist += `/PRCHrBassiemMgrTab220.do`
- 스모크 PASS: self 강제·코드값/내부 제외·컬럼 편차 정규화·profile 회귀

## 잔여

- okrservice 지시서 §1.5 allowlist에 `/PRCHrBassiemMgrTab220.do` 추가 (21경로)
- 실환경: 응답 키 케이스, REQ_STATUS 코드→상태명 필요 시 CMMF_CODE_ML 경유 여부 재검토,
  checkHst="Y"(과거 사번 이력 포함) 필요 여부
