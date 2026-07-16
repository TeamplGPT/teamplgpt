# Tasks: hr-personnel 5240 HR(kiwibox) 직접 통합 + 항목 보정

상태: T1~T3 완료(2026-07-16), T4~T7 잔여. 헌장 §III상 T4~T5 완료 전까지 "완료" 보고 금지.

## 완료

- [x] **T1** 기존 스킬 백업 — `agent-skills-backup/20260716/hr-personnel/` (커밋 27df9641, 001과 공용)
- [x] **T2** handler.js 교체 — kiwibox 엔드포인트 7종(profile/profile_detail/org_tree/org_members/
  todo_count/schedule_day/contact_directory), searchStaffId self 강제, org_cd 체이닝 검증,
  세션만료 감지
- [x] **T3** plugin.json v2.0.0 — 구 11종 → 신 7종 보정(family 제거 — 주민번호 §7 등록 금지),
  목서버 스모크 PASS (self 강제·menu priming 순서·월범위·체이닝 에러 안내 검증)

## 잔여

- [ ] **T4** E2E 시나리오: scenarios.json에 hr-personnel 신규 query_type 7종 + org_cd 체이닝
  (org_tree → org_members 2단) 시나리오 작성 → 전건 PASS. 구 11종 시나리오 제거/skip.
  (001 T4의 kiwibox mock 확장에 병행)
- [ ] **T5** ntest.5240.kr 실측 (§8 미확인):
  - `getMBLPrtEmpCardPop` 반환 컬럼 확인 → 학력/경력/자격증 개별 query_type 분화 여부 결정
  - 사원증 `cnfgVal01/cnfgVal03` 옵션 상태 확인 (d 분기 — 타인 검색 옵션이 켜져 있는지)
  - `getMBLPrtEmpCard` 복호화 연락처 필드의 실제 노출 범위 확인
  - 데스크탑 정본(PRCPrtEmpidCard) 컬럼 parity 확인 — parity 있으면 b 정본으로 교체 검토
- [ ] **T6** 응답 컬럼 한글 라벨 매핑 (실측 후)
- [ ] **T7** 완료 시 `docs/04-report/features/hr-personnel-kiwibox.report.md` 작성
