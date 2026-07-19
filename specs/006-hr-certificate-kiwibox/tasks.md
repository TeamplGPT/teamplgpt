# Tasks: hr-certificate (증명서) 신규 skill

승인 이력: spec 승인 + 결정(주소 제외 / active 켬 / query_type 단일 requests) (2026-07-16).
상태: T1~T3 완료 + 스모크 PASS. T4·T5 잔여.

## 실측 완료 (kiwibox 소스)

- 정본 `getCTIMcrtfReqstRefromMgrList`: `reqNoExist='N'` 분기에 `AND A.STAFF_ID=#{staffId}`
  → staffId=$SELF 강제로 순수 self. 기간 파라미터 없음(전체 신청내역).
- 반환 컬럼: TYPE_NM/USE_NM/SUBMIT_PLACE/COPY_NUM/ISSUE_NO/ISSUE_YMD/REQ_DATE/PRT_YN/
  NAME/YEAR/MONTH/REQ_NO + ADDR(주소, 제외)·STAFF_ID(PK, 제외)·코드값(제외).

## 완료

- [x] **T1** 신규 skill 디렉토리 `hr-certificate/` (신규, 백업 불요)
- [x] **T2** handler.js v1.0.0 — query_type 단일(requests), reqNoExist=N + staffId=$SELF 강제,
  컬럼 화이트리스트(주소·내부 PK 제외), union 정규화, hrSession 공용, reqNo 상세 미채택
- [x] **T3** plugin.json v1.0.0 — active:true, query_type=requests(required 없음), setup_args 4종
  (context 빈 기본값), 주소 미제공 명시
- [x] 브리지 allowlist += `/CTIMcrtfReqstRefromMgr.do`
- [x] 스모크 PASS: self 강제·주소/PK/코드 제외 실증·컬럼 편차 정규화·no-arg 기본·bad type·
  pending 누수 0

## 잔여

- [ ] **T4** okrservice 작업지시서 §1.5 allowlist에 `/CTIMcrtfReqstRefromMgr.do` 추가 (20경로)
- [ ] **T5 실환경 확정**:
  - `applCd` 미전송 시 전체 종류(재직/경력/퇴직) 혼재 반환 확인 (근속계산 기준일만 영향 예상)
  - `reqNoExist='N'` 목록 서버 게이트 유무(§8) — self 강제라 방어되나 이중 여부 확인
  - 응답 키 케이스(egovMap 소문자) → 화이트리스트 대소문자 대응은 handler 반영됨
  - REQ_STATUS_NM(상태명) 필드 존재 시 화이트리스트 추가 (현재 PRT_YN=출력가능만 노출)
- [ ] **T6** E2E 시나리오 + report. 고객사 정책 확인 후 embed allowed skills에 hr-certificate 추가.
