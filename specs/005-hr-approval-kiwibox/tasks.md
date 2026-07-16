# Tasks: hr-approval (전자결재) 신규 skill

승인 이력: spec 승인 + 목록 컬럼 화이트리스트 반영 + **detail 제외 결정**(목록만) (2026-07-16).
상태: T1~T3 완료 + 스모크 PASS. T4·T5 잔여.

## 실측 완료 (kiwibox 소스 + 실제 UI 스크린샷 대조)

- 목록 = 순수 self(a): `EAPRequestMgr.do?cmd=getEAPRequestMgrList`, `work_staff_id=ssnStaffId`
  세션 강제. selectGubun 2/3/4/5/6. searchStaDate/EndDate 기간.
- 화면 "요약 텍스트"(장보고 29/05...) = `MEMO`(신청사유) 목록 컬럼 — **본문 아님**.
  → detail(CONTENTS CLOB) 없이 목록만으로 실용성 충분.
- 목록 SELECT의 내부 PK·코드 컬럼은 화이트리스트로 제외.

## 완료

- [x] **T1** 신규 skill 디렉토리 `hr-approval/` (백업 불요 — 신규)
- [x] **T2** handler.js v1.0.0 — 목록 5종(pending/drafted/completed/rejected/referenced),
  순수 self(사번 파라미터 없음), 컬럼 화이트리스트(13컬럼) + union 정규화, gate:true, hrSession 공용
- [x] **T3** plugin.json v1.0.0 — query_type 5종, year_month, setup_args 4종(context 빈 기본값),
  본문 미제공 명시. detail·req_no 파라미터 없음
- [x] 브리지 allowlist += `/EAPRequestMgr.do`
- [x] 스모크 PASS: selectGubun 매핑·월범위·컬럼 화이트리스트(내부 PK 제외 확인)·
  컬럼 편차 정규화·본문 미노출·empty/bad type 안내·pending 누수 0

## 잔여

- [ ] **T4** okrservice 작업지시서 §1.5 allowlist에 `/EAPRequestMgr.do` 추가 (19경로)
- [ ] **T5 실환경 확정**:
  - `searchStaDate/EndDate` 형식(YYYYMMDD 추정) 및 미전송 시 서버 기본 기간
  - 응답 키 케이스(egovMap 소문자 여부) — 화이트리스트 대소문자 대응은 handler에 반영됨
  - `SIGN_LINE`/결재대기자 실제 표현(화면은 "결재대기자: 오사공,김영지" 별도 표기 — 목록
    응답에 대기자 필드가 SIGN_LINE 외 별도인지 확인, 있으면 화이트리스트 추가)
  - `APPL_STAFF_NO` 사번 여부 최종 확인(현재 제외 처리)
- [ ] **T6** E2E 시나리오 + report. embed allowed skills에 hr-approval 추가.
