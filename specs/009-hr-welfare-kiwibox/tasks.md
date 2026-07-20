# Tasks: hr-welfare (복리후생) 신규 skill

승인: 대출만 반영 (경조금 유용성 없음·의료비/학자금 부적합 실측) / 이율·잔액 노출·계좌 제외 (2026-07-16).
상태: T1~T3 완료 + 스모크 PASS. T4·T5 잔여.

## 실측 결론 (복리후생 대부분 부적합)

- **kiwibox 자체 AI도 복리후생 self 도구 미구현** (결재·교육·근태·휴가·프로필만) — 부적합 방증.
- 대출(LONLoanReqstListMgr List1): self=cmmSearchStaffId, 목록형 → **채택**.
- 경조금(CAC): List형 조회 없음, 전부 신청 작성 보조(Cnt=중복체크·EccAmt=금액계산) → 유용성 없음.
- 의료비/학자금: famNm·famRelCd·acaCd 등 필수 → self 자동 조회 불가.
- 휴양(reqNo)·사회보험(주민번호 FAM_CTZ_NO) → 제외.

## 완료

- [x] **T1** 신규 skill 디렉토리 `hr-welfare/` (신규)
- [x] **T2** handler.js v1.0.0 — query_type 단일(loan), cmmSearchStaffId=$SELF 강제
  (미지정 시 전사 노출 방지 §4.10), 화이트리스트(계좌 BANK_CD/ACC_NO·PK 제외, 이율·잔액 노출)
- [x] **T3** plugin.json v1.0.0 — active:true, query_type=loan(required 없음), setup_args 4종,
  계좌 미제공·타 항목 경계 명시
- [x] 브리지 allowlist += `/LONLoanReqstListMgr.do`
- [x] 스모크 PASS: self 강제·계좌/PK 제외 실증·이율/잔액 노출·no-arg 기본·pending 누수 0

## 잔여

- [ ] **T4** okrservice 지시서 §1.5 allowlist에 `/LONLoanReqstListMgr.do` 추가 (22경로)
- [ ] **T5 실환경**: 응답 키 케이스, LON 컬럼 코드명(LOA_TYPE_CD_NM 등) 실제 변환 확인,
  대출 상환(List2/3, searchApplDate 체이닝) 필요 시 추가 회차
- [ ] 정책: 대출 금액/이율/잔액 노출 고객사 승인(급여·연말정산과 동일 민감도 게이트)
