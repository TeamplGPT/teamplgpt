# Tasks: hr-attendance 5240 HR(kiwibox) 직접 통합

상태: T1~T3 완료(2026-07-16), T4~T7 잔여. 헌장 §III상 T4~T5 완료 전까지 "완료" 보고 금지.

## 완료

- [x] **T1** 기존 스킬 백업 — `server/storage/plugins/agent-skills-backup/20260716/` (커밋 27df9641)
- [x] **T2** handler.js 교체 — kiwibox 엔드포인트 8종, self 강제, 세션만료 감지, 게이트 스킵 차단
- [x] **T3** plugin.json v2.0.0 — query_type 8종, 파라미터 3개 축소, setup_args 4종, 목서버 스모크 PASS
  (form 조립·월말일 계산·쿠키 전달·HTML 감지 검증)

## 잔여

- [ ] **T4** E2E 러너 개편: `server/scripts/e2e-hr-skill/mock-hr-api.js`를 kiwibox 형태
  (`.do` + form POST + `{result:[...]}` jsonView + JSESSIONID 검사)로 확장하고
  scenarios.json에 hr-attendance 신규 query_type 8종 시나리오 작성 → 전건 PASS.
  구 query_type 6종 시나리오는 제거 또는 skip 마킹.
- [ ] **T5** ntest.5240.kr 실세션 실측 (카탈로그 §8 미확인 항목):
  - b 범위 게이트가 세션 `activeMenuCd` 기준 통과하는지 (`HR_ACTIVE_MENU_CD` 필요 여부·값 확정)
  - 세션 만료 응답이 302/HTML 중 무엇인지 (감지 로직 검증)
  - `getMBLHomeLeaveDetail` 응답 키 케이스(egovMap: creDd 추정) 확인 → formatTable 매핑 조정
- [ ] **T6** 응답 컬럼 한글 라벨 매핑: 실측 응답 키 기준 formatTable 컬럼명 정리 (실측 후)
- [ ] **T7** 완료 시 `docs/04-report/features/hr-attendance-kiwibox.report.md` 작성, 헌장 PDCA 매핑 준수
  - 2026-08-10 확인: 이 리포트는 작성 여부와 무관하게 현재 리포에 없다. `docs/`가 `.gitignore` 대상이라 커밋된 적이 없다. 기록 보존을 위해 원문은 남긴다.
