# Tasks: HR 스킬 엔드포인트 신판 카탈로그 재정렬

**Input**: [plan.md](./plan.md) · [contracts/kiwibox-request-bodies.md](./contracts/kiwibox-request-bodies.md)(구현 정본) · [research.md](./research.md) R-2~R-5 · [data-model.md](./data-model.md)

**원칙**: E2E-First — 각 스토리는 "시나리오 append → FAIL 확인 → 수정 → PASS" 순서 고정. FAIL 로그(`runs/{ts}/result.json`) 보존.

**신규 시나리오 ID 체계**: `K##` (kiwibox BODY 검증), `KB##` (legacy 행태 승계). 전제: `:3001` 서버 기동 + skill setup_args mock 전환(quickstart.md).

## Phase 1: Setup

- [X] T001 기존 `server/scripts/e2e-hr-skill/scenarios.json`을 `server/scripts/e2e-hr-skill/scenarios-legacy-20260716.json`으로 복사 보존하고, scenarios.json은 `$comment`(재편 사유·legacy 참조 경로 명시) + 빈 scenarios 배열로 초기화 (FR-015)

## Phase 2: Foundational (모든 스토리의 FAIL-first 전제)

- [X] T002 runner 확장 — `server/scripts/e2e-hr-skill/runner.js`: ① relevantMock 필터를 `/^\/api\/v1\//.test(p) || /\.do$/.test(p)`로, ② 시나리오 `expect.mock_body_pattern: string[]` 지원 — 해당 mock 엔트리 body(`_raw` URL 디코드 문자열 또는 파싱 객체의 `k=v` 직렬화)에 전 패턴 정규식 매칭 시 PASS, 검증 로드 시 정규식 유효성 검사(기존 `_mockUrlRegex` 방식 준용)
- [X] T003 [P] mock 확장 — `server/scripts/e2e-hr-skill/mock-hr-api.js`: ① `application/x-www-form-urlencoded` body를 객체 파싱해 로그(`_raw` 병기), ② `/CommonCode.do` 요청 시 `{"codeList":[{"codeNm":"2026-06-19 급여","code":"20260619P","colorCode":null}]}` 고정 응답(급여 2단 체인 시나리오용), 그 외 `.do`는 기존 고정 응답 유지
- [X] T004 [P] `_shared/hrSession.js` — `parseKiwiboxBody` 언랩 순위에 `Map`·`codeList` 추가(result→DATA→Map→codeList→data), 헬퍼 `todayDashed()`·`monthsAgoFirstYmd(n)` 추가 (R-5, R-3)
- [X] T005 [P] 단위 테스트 신설 — `server/storage/plugins/agent-skills/_shared/__tests__/hrSession.test.js`: 언랩 5종(result/DATA/Map/codeList/data)+passthrough+HTML 세션만료, todayDashed 형식, monthsAgoFirstYmd(18) 경계(연도 넘김) — `node --test`로 PASS 확인

**Checkpoint**: runner가 `.do` + body 검증 가능, hrSession 헬퍼 준비. 이후 스토리 착수 가능.

## Phase 3: User Story 1 — 연차/휴가 정본 교체 (P1)

**Goal**: annual_leave_balance/leave_requests를 §3 정본(TAADclzVcatnList1/List2)으로. **Independent Test**: `E2E_ONLY=K1,K2`.

- [ ] T006 [US1] 시나리오 append — `scenarios.json`에 K1(연차 잔여: `mock_url_pattern "^/TAADclzVcatnList\\.do"` + `mock_body_pattern` [cmd=getTAADclzVcatnList1, chkAppYn=Y, wkareaCd=, gubun=A, activeTab=0, searchSymdLv=\d{4}0101, searchEymdFy=\d{4}1231, searchBaseYmd=\d{4}-\d{2}-\d{2}, staffId=, cmmSearchStaffId=]) · K2(휴가 신청 상세: List2 동일 BODY) 추가 → `E2E_ONLY=K1,K2 npm run e2e:hr-skill` **FAIL 확인**(현행 getMBL* 호출 증빙 로그 보존)
  - ⏸ 시나리오 작성 완료·하네스 FAIL 증빙 확보(evidence/harness-before.json). 라이브 E2E 실행 잔여
- [X] T007 [US1] `server/storage/plugins/agent-skills/hr-attendance/plugin.json` — setup_args에 `HR_WKAREA_CD`(type string, required false, default "1000", hint: 사업장코드 — §3 휴가 BODY wkareaCd) 신설. description·enum·examples 불변
- [X] T008 [US1] `server/storage/plugins/agent-skills/hr-attendance/handler.js` — annual_leave_balance/leave_requests를 contracts §hr-attendance대로 교체: path `/TAADclzVcatnList.do`, cmd List1/List2, `leaveBody` 주입(staffId+cmmSearchStaffId 마커 배열, wkareaCd=`HR_WKAREA_CD`, searchLeavCd 공란, gubun=A, activeTab=0, 연도범위 4종, searchBaseYmd=todayDashed(), chkAppYn=Y). getMBLLeavDetailStaff/getMBLHomeLeaveDetail 제거
- [X] T009 [US1] 동일 파일 COLUMNS_BY_QT — annual_leave_balance를 R-4 신필드(workNm/creDd/useDd/remDd/staYmd/endYmd)로 교체(구 wktypeNm 제거), leave_requests(ymd/week/leavNm/useDd/reason) 신설
- [ ] T010 [US1] `E2E_ONLY=K1,K2` 재실행 → **전건 PASS** (FAIL→PASS 로그 쌍 확보)
  - ⏸ 하네스 PASS(K1,K2 — evidence/harness-after.json). 라이브 E2E 잔여

## Phase 4: User Story 2 — 근태 정본 교체·BODY 정렬 (P1)

**Goal**: timesheet TAA-1410 교체, work_status/work_calendar/overtime BODY 정렬. **Independent Test**: `E2E_ONLY=K3,K4,K5,K6,K7,K8,KB20,KB21`.

- [ ] T011 [US2] 시나리오 append — K3(출퇴근: `^/TAAWrkTimeStatusMgr\\.do` + body [cmd=getTAAWrkTimeStatusMgrList, searchBaseSYmd=\d{8}, searchSYmd=\d{8}]) · K4(근무현황: 동일+searchEYmd) · K5(근무캘린더: `^/TAADclzWorkSearchCldr\\.do` + [searchId=, cmmSearchStaffId=, searchYm=\d{6}, searchBaseYmd=\d{4}-]) · K6/K7(연장/한도: `^/TAADclzWorkOtSchdul\\.do` + [searchType=2, cmd=...List2|...List]) · K8(조직 휴가캘린더: 현행 계약 회귀 고정 `^/TAADclzVcatnCldrMgr\\.do`) · KB20(E3 승계: "3월 출퇴근" repeat=10, year_month 결정론성 — body `searchBaseSYmd=\d{4}0301`) · KB21(E3b 승계: "지난달 연장" repeat=10) → 격리 실행 **FAIL 확인**(K8 제외 가능)
  - ⏸ 시나리오 작성 완료·하네스 FAIL 증빙 확보. 라이브 E2E 실행 잔여
- [X] T012 [US2] `hr-attendance/handler.js` — ENDPOINT_MAP 수정: timesheet→TAA-1410(`period:"range-both"`), work_status `range-both` 전환, work_calendar에 cmmSearchStaffId 마커+searchBaseYmd 추가, overtime/overtime_limit `searchType:"2"`. `range-both` 기간 주입 로직 구현. TAAWrkTimeListMgrByDate 제거
- [X] T013 [US2] 동일 파일 — timesheet 컬럼 화이트리스트 신설(R-4: workYmd/week/staTime/endTime/baseStaTime/baseEndTime/mark/workComment/lateYn/earlyYn/absentYn)
- [ ] T014 [US2] `E2E_ONLY=K3..K8,KB20,KB21` 재실행 → **전건 PASS**
  - ⏸ 하네스 PASS(K3~K8). KB20/21(LLM 행태)은 라이브 E2E 잔여

## Phase 5: User Story 3 — 급여 BODY 보강·SAL-0050 교체 (P2)

**Goal**: SAL-0527 필수 BODY, pay_periods 하이픈 searchYm, salary_statement→SAL-0050. **Independent Test**: `E2E_ONLY=K9..K13`.

- [ ] T015 [US3] 시나리오 append — K9(지급 건 목록: `^/CommonCode\\.do` + [queryId=getSalYmdTypeCdList2, closeChk=Y, searchYm=\d{4}-\d{2}]) · K10(급여명세 2단 체인: mock CommonCode fixture로 pay_item 획득 후 `^/SALPayslipNewMgr\\.do` + [searchItem=20260619P, searchYm=2026-06, searchType=web], repeat=2, tier secondary) · K11(공제: List2 동일 BODY) · K12(요약: Map cmd 동일 BODY) · K13(월별 지급 이력: `^/SALSalaryBassMgr\\.do` + [cmd=getSALSalaryBassMgrTab110List, searchSYmd=\d{8}, searchBaseYmd=\d{4}-]) → 격리 실행 **FAIL 확인**
  - ⏸ 시나리오 작성 완료·하네스 FAIL 증빙 확보. 라이브 E2E 실행 잔여
- [X] T016 [US3] `server/storage/plugins/agent-skills/hr-salary/handler.js` — ① pay_periods searchYm을 `YYYY-MM` 하이픈으로, ② payslip/deductions/payslip_summary에 searchYm(pay_item 선두 6자리 유도, `/^(\d{4})(\d{2})\d{2}/` 불일치 시 오류 반환·호출 중단)+`searchType:"web"` 고정 주입, ③ salary_statement를 SAL-0050(`/SALSalaryBassMgr.do`·Tab110List·월범위 searchSYmd/EYmd·searchBaseYmd=todayDashed())로 교체, SALSalaryDtstmnMgr 제거, ④ salary_statement 화이트리스트(R-4: salYmd/orgNm/posNm/jtotAmt/gtotAmt/ctotAmt) 적용
- [X] T017 [US3] `server/storage/plugins/agent-skills/hr-salary/plugin.json` — salary_statement 매핑 라벨을 "월별 지급내역"으로(enum 값·계약 불변, QUERY_LABELS 동기화 포함)
- [ ] T018 [US3] `E2E_ONLY=K9..K13` 재실행 → **전건 PASS** (K10 tier secondary 허용 기준 명시: 1/2 이상)
  - ⏸ 하네스 PASS(K9~K13). 라이브 E2E 잔여

## Phase 6: User Story 4 — 결재·증명서·대출·교육 BODY 정렬 (P3)

**Goal**: D8 병행·D9 보강. **Independent Test**: `E2E_ONLY=K14..K17`.

- [ ] T019 [US4] 시나리오 append — K14(기안함: `^/EAPRequestMgr\\.do` + [selectGubun=2, searchStaDate=\d{8}, searchSYmd=\d{8}]) · K15(증명서: `^/CTIMcrtfReqstRefromMgr\\.do` + [reqNoExist=N, cmmSearchStaffId=, staffId=, searchStaffId=, searchSYmd=\d{8}]) · K16(대출: `^/LONLoanReqstListMgr\\.do` + [cmmSearchStaffId=, searchBaseSYmd=\d{8}]) · K17(교육이력: `^/PRCHrBassiemMgrTab220\\.do` + [checkHst=N, cmmSearchStaffId=, searchStaffId=, searchYmd=\d{4}-]) → 격리 실행 **FAIL 확인**
  - ⏸ 시나리오 작성 완료·하네스 FAIL 증빙 확보. 라이브 E2E 실행 잔여
- [X] T020 [P] [US4] `server/storage/plugins/agent-skills/hr-approval/handler.js` — form에 searchSYmd/searchEYmd(월범위) 병행 추가 (기존 selectGubun·searchStaDate/EndDate 유지)
- [X] T021 [P] [US4] `server/storage/plugins/agent-skills/hr-certificate/handler.js` — cmmSearchStaffId·searchStaffId 마커 추가(3중), searchSYmd=`monthsAgoFirstYmd(18)`·searchEYmd=todayYmd() 추가
- [X] T022 [P] [US4] `server/storage/plugins/agent-skills/hr-welfare/handler.js` — searchBaseSYmd=`monthsAgoFirstYmd(18)`·searchBaseEYmd=todayYmd() 추가 + 마커 미치환 방어(치환 결과 공란/마커 잔존 시 오류 반환 — 서버 폴백 hrFetch가 이미 차단하므로 handler 주석으로 L2 근거 명시)
- [X] T023 [P] [US4] `server/storage/plugins/agent-skills/hr-personnel/handler.js` — education에 cmmSearchStaffId·searchStaffId 마커(staffParam 배열)+searchYmd=todayDashed() 추가 (profile류 무접촉 — D6/D7)
- [ ] T024 [US4] `E2E_ONLY=K14..K17` 재실행 → **전건 PASS**
  - ⏸ 하네스 PASS(K14~K17). 라이브 E2E 잔여

## Phase 7: Polish & Cross-Cutting

- [X] T025 [P] legacy 행태 승계 시나리오 잔여분 append — `scenarios.json`: KB22(연차 되묻기 금지 — E14~16 의도, year_month 없이 즉시 tool-call) · KB23~KB31(YTA 9 query_type × 1건: summary/medical/family/previous_employer/donation/credit_card/insurance/education/savings — `^/YTA.*Mgr\d{4}\\.do` + cal_yy 경로 검증, legacy `result`는 summary로 통합 승계) · 기타 개편 대상 잔여(legacy work-plan→work_calendar 추가 표현 변형 등) — tier 배분(primary: 되묻기·결정론성 / secondary: 표현 변형)
- [ ] T026 전체 스위트 실행 `npm run e2e:hr-skill` → **전건 PASS** (신규 K/KB 전체)
  - ⏸ 라이브 환경 잔여 (verification-notes.md 참조)
- [X] T027 [P] SC-004/SC-006 검증 — `grep -rn "MBLLeavDetail\|MBLHomeLeave\|WrkTimeListMgrByDate\|SalaryDtstmn" server/storage/plugins/agent-skills/` 0건 + `grep -c "api/v1" server/scripts/e2e-hr-skill/scenarios.json` 0건, plugin.json diff가 HR_WKAREA_CD·salary_statement 라벨에 한정됨 확인
- [ ] T028 실동작 스모크(quickstart.md §실동작) — setup_args 실환경 복원 후 연차/출퇴근/급여 2단/월별이력 4종 + 민감정보 미노출 + 3-Mode(@agent·chat/query·embed 위임) 확인, 결과를 spec 폴더 `verification-notes.md`로 기록 (orgCd/wkareaCd 리스크 D4 실측 판정 포함)
  - ⏸ 라이브 환경 잔여 (verification-notes.md 참조)

## Dependencies

- Phase 1 → Phase 2 → (Phase 3 → Phase 4) → Phase 5 → Phase 6 → Phase 7
- Phase 3·4는 동일 파일(hr-attendance/handler.js) 순차. Phase 5부터 파일 독립이나 E2E 서버 공유로 실행은 순차 권장.
- T020~T023 병렬 가능(서로 다른 handler). T003/T004/T005 병렬 가능.

## Implementation Strategy

- **MVP = Phase 1~3** (연차/휴가 정본 교체 — 최다 빈도·최고 위험 해소). 이후 스토리별 독립 증분.
- 각 Phase 완료 시점이 커밋 후보(사용자 승인 후 커밋).
- K10(2단 체인)·KB 시나리오는 LLM 비결정성 감안 tier/repeat로 완충 — 판정 기준을 시나리오 note에 명기.
