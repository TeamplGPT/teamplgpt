# Tasks: HR 조회 답변 품질 제어 (echo·fan-out 억제)

**Input**: Design documents from `/specs/012-hr-answer-quality/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: E2E-First (헌장 III) — 시나리오 append + FAIL 확인 태스크가 구현 태스크보다 선행.
단, runner assertion 확장과 mock fixture는 시나리오 실행의 전제라 Foundational로 최선행.

**Organization**: 유저 스토리별 페이즈. US1(P1)만으로 MVP.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Skills: `server/storage/plugins/agent-skills/`
- E2E: `server/scripts/e2e-hr-skill/`

## Phase 1: Setup

해당 없음 — 신규 프로젝트 구조·의존성 없음 (기존 파일 최소 diff만).

## Phase 2: Foundational (BLOCKING — 모든 스토리 검증의 전제)

- [X] T001 [P] runner에 신규 `expect` 필드 로드 검증·사전 컴파일 추가 in `server/scripts/e2e-hr-skill/runner.js` — `answer_pattern`/`answer_not_pattern`(string[], regex 컴파일 → `_answerRegexes`/`_answerNotRegexes`), `max_hr_calls`(정수 ≥1). 위반 시 `fatal()`. 스키마: `contracts/e2e-assertion-schema.md`
- [X] T002 runner `runScenarioOnce()`에 판정 4~7 추가 in `server/scripts/e2e-hr-skill/runner.js` — 기존 체인(tool_call→mock_url→mock_body) 뒤: finalText null 가드 → answer_pattern 전건 매치 → answer_not_pattern 전건 부재 → `relevantMock.length ≤ max_hr_calls`. FAIL reason 문자열은 contract 표 형식. `result.json` 레코드에 `hrCallCount` 추가 (T001 뒤, 동일 파일)
- [X] T003 [P] mock에 cmd 기반 fixture 응답 추가 in `server/scripts/e2e-hr-skill/mock-hr-api.js` — POST `.do` 요청은 body 수신 완료 후 `parsedBody.cmd`로 분기 응답 (현행 즉시 respond를 body-후 respond로 변경, GET fast-path·/health·/CommonCode.do 불변):
  - `getTAADclzVcatnList1` → `{result:[{workNm:"연차",creDd:"23",useDd:"1",remDd:"22",staYmd:"20260101",endYmd:"20261231"},{workNm:"배우자출산휴가(유급)",creDd:"20",useDd:"0",remDd:"20",staYmd:"20260101",endYmd:"20261231"}]}`
  - `getTAADclzVcatnList2` → 사용내역 2건 `{result:[{ymd:"20260710",week:"금",leavNm:"연차",useDd:"1",reason:"개인사유"},{ymd:"20260721",week:"화",leavNm:"반차",useDd:"0.5",reason:"병원"}]}`
  - `getTAAWrkTimeStatusMgrList` → 근무현황 3행(그중 1행 `lateTime:"10"` 지각 10분, `workYmd`·`week`·`mark` 포함)
  - 그 외 cmd → 기존 `{success:true,data:[],message:"mock"}` 유지 (기존 K/KB 시나리오 무영향)

**Checkpoint**: `npm run e2e:hr-skill` 기존 38건 판정 결과 변화 없음 (신규 필드 미사용 + fixture는 URL/body 검증에 무영향 — FR-005)

## Phase 3: US1 — 단일값 질문은 값 중심 답변 (P1) 🎯 MVP

**Goal**: "남은 연차 개수는?" → 값 중심 답변, 표 echo·무관 행 제거. 전체 표 명시 요청은 표 유지.

**Independent Test**: `npm run e2e:hr-skill -- --only=Q1,Q2`

- [X] T004 [US1] 시나리오 Q1·Q2 append in `server/scripts/e2e-hr-skill/scenarios.json` — Q1: message `"@agent 남은 연차 개수는?"`, expect `tool_call:true`, `mock_url_pattern:"^/TAADclzVcatnList\\.do"`, `answer_pattern:["22"]`, `answer_not_pattern:["배우자출산휴가","총 \\*?\\*?\\d+\\*?\\*?건 조회됨","\\[응답 지침\\]"]`, `pre_reset:true`, `tier:"primary"` / Q2: message `"@agent 휴가 현황 전체 표로 보여줘"`, `answer_pattern:["연차","배우자출산휴가"]`, `answer_not_pattern:["\\[응답 지침\\]"]` (과억제 방지 — US1/AS2)
- [X] T005 [US1] 구현 전 FAIL 확인 — `npm run e2e:hr-skill -- --only=Q1,Q2` 실행, Q1 FAIL(echo로 `배우자출산휴가` 매치) 로그를 run 결과 경로와 함께 기록 (Q2는 PASS 가능 — 현상태가 전체 표이므로; Q1 FAIL만 필수)
- [X] T006 [US1] `ANSWER_GUIDE` footer 구현 in `server/storage/plugins/agent-skills/_shared/formatTable.js` — `contracts/footer-contract.md` 정본 문구 상수 추가, `renderWhitelisted()`·`renderTable()` 비어 있지 않은 반환값 말미 부착, `module.exports`에 `ANSWER_GUIDE` 추가. 0건 경로 미부착(FR-007). handler.js 7종 무수정
- [X] T007 [US1] PASS 확인 — `npm run e2e:hr-skill -- --only=Q1,Q2` 전건 PASS. FAIL 시 footer 문구 튜닝(문구 변경은 `contracts/footer-contract.md` 갱신 동반) 후 재실행

**Checkpoint**: US1 단독 배포 가능 — echo 체감 개선 완성

## Phase 4: US2 — 질문 하나에 조회 하나 (P2)

**Goal**: "이번 달 지각 있어?" → HR 호출 1건(work_status)으로 수렴.

**Independent Test**: `npm run e2e:hr-skill -- --only=Q3` (US1 미구현이어도 판정 가능 — footer와 무관)

- [X] T008 [US2] 시나리오 Q3 append in `server/scripts/e2e-hr-skill/scenarios.json` — message `"@agent 이번 달 지각 있어?"`, expect `tool_call:true`, `mock_url_pattern:"^/TAAWrkTimeStatusMgr\\.do"`, `max_hr_calls:1`, `answer_pattern:["지각"]`, `answer_not_pattern:["\\[응답 지침\\]"]`, `pre_reset:true`, `tier:"primary"`
- [X] T009 [US2] 구현 전 FAIL 확인 — **결과: fan-out 미재현** (3회 시도 전부 HR 호출 1건, runs/2026-07-27T06-21-46-531 외. 관측 사례는 프로덕션 @agent/모델 편차로 판단, L1 가드는 방어적 유지·Q3는 회귀 가드로 상시 감시). 원계획 — `npm run e2e:hr-skill -- --only=Q3`, fan-out(3건 호출)로 `hr calls N exceeded max 1` FAIL 로그 기록. 현 세션에서 fan-out 미재현 시 반복 옵션(`repeat`)으로 재현 시도 후, 그래도 미재현이면 FAIL 불가 사유를 tasks 노트에 기록하고 진행
- [X] T010 [US2] L1 description 가드 추가 in `server/storage/plugins/agent-skills/hr-attendance/plugin.json` — research.md R6 정본: 상단 description에 "조회 결과는 질문이 요구하는 정보 중심으로 답변하세요." / `query_type.description` 매핑표 뒤 "한 질문에는 가장 적합한 query_type 하나만 호출하세요. 같은 정보를 얻으려고 여러 query_type을 중복·병렬 호출하지 마세요. 서로 다른 정보를 묻는 복합 질문은 예외입니다." 파라미터 구조 변경 금지
- [X] T011 [US2] PASS 확인 — `npm run e2e:hr-skill -- --only=Q3` PASS

**Checkpoint**: US1+US2 — 두 원인 모두 봉합

## Phase 5: US3 — 내역성 질문 과요약 방지 (P3)

**Goal**: "휴가 사용내역 알려줘" → 2건 전건 포함 (고정 길이 부작용 없음 증명).

**Independent Test**: `npm run e2e:hr-skill -- --only=Q4`

- [X] T012 [US3] 시나리오 Q4 append in `server/scripts/e2e-hr-skill/scenarios.json` — message `"@agent 이번 달 휴가 사용내역 알려줘"`, expect `tool_call:true`, `mock_url_pattern:"^/TAADclzVcatnList\\.do"`, `answer_pattern:["0710|07-10|7월 10일","0721|07-21|7월 21일"]`(fixture 2건 식별), `answer_not_pattern:["\\[응답 지침\\]"]`, `tier:"primary"`. 주: footer(T006)가 이미 구현된 상태라 FAIL-first 불가 — 과요약 **회귀 가드** 성격, spec US3 근거
- [X] T013 [US3] PASS 확인 — `npm run e2e:hr-skill -- --only=Q4`. FAIL(항목 소실) 시 footer 2번 분기 문구 튜닝 + `contracts/footer-contract.md` 갱신 + Q1~Q4 재실행

**Checkpoint**: 3분기 규칙 전면 검증 완료

## Phase 6: Polish & Cross-Cutting

- [X] T014 [P] CLAUDE.md 헌장 IV 예외(D6) 명문화 — "필수 규칙 > Multi-Layer Defense" 항목에 한 줄: L2 코드 가드에 tool 결과 footer(조회 결과 소비 방식 제어) 포함, 정본은 `specs/012-hr-answer-quality/contracts/footer-contract.md`
- [X] T015 tier 전건 회귀 — `npm run e2e:hr-skill` (기존 38 + 신규 Q1~Q4) 전건 PASS, `runs/{timestamp}/result.json` 경로 기록
- [X] T016 수동 확인 (quickstart §수동 확인) — @agent 모드 `남은 연차 개수는?` 1회(값 중심 답변 + footer 미노출 육안), 0건 경로 안내 문구 불변 확인
- [X] T017 [P] E2E README 갱신 in `server/scripts/e2e-hr-skill/README.md` — 신규 `expect` 필드 3종·판정 순서·`hrCallCount` 문서화 (contract 링크)

### 구현 중 추가된 인프라 안정화 (T015 파생)

- [X] T018 runner pre_reset 격리 강화 in `server/scripts/e2e-hr-skill/runner.js` — API 경로 `/reset`이 `workspace_chats`를 지우지 않아(스레드 스코프) fixture 답변이 히스토리로 유입, LLM이 tool-call을 생략하는 오염 관측(KB40·KB41·KB45·Q1·Q2 flake). `wipeWorkspaceChats()`(docker psql, apikey 헬퍼 패턴) + `waitForEmptyHistory()` 폴링 추가. fixture 도입 전에는 빈 데이터라 무해했던 기존 설계 공백.
- [X] T019 KB43 기대 갱신 in `server/scripts/e2e-hr-skill/scenarios.json` — 011 CommonCode fixture가 pay 체인을 완주시키는데(pay_periods→payslip, 의도된 동작) 구기대는 1단계 URL만 대조해 구조적 FAIL. live 전수 실행 최초 수행에서 판명된 pre-existing 정합 문제 — 기대를 체인 완주 기준으로 상향.

- [X] T020 E2E mock 라우팅 근본 차단 — 구 REST 잔재 제거 + @agent 경로 override 배선. ① runner override 헤더가 구 키(`HR_API_BASE_URL`)라 무효 → 현행 키 3종(`HR_BASE_URL`/`HR_SESSION_COOKIE`/`HR_STAFF_ID`)으로 교체 (`e2e-hr-skill/runner.js`, `e2e-embed-hr-skill/runner.js`). ② `@agent`(EphemeralAgentHandler/aibitat) 경로에 override 병합 부재 → `apiChatHandler.js` streamChat 분기에서 전달 + `ephemeral.js` imported plugin 로드 시 병합 (executor.js 계약 동일, chatSync 분기는 response 스코프 부재로 null 고정). ③ mock 대조 필터 `/api/v1` 제거(`.do`만), README 예시 kiwibox 패턴 교체. 결과: **plugin.json setup_args 무변경으로 E2E mock 라우팅 완결** — 추적 파일 오염(로컬 mock 값 수동 전환·원복) 절차 폐기. plugin.json 7종 value 원복 완료.
- [ ] (별도 제안) e2e-embed-hr-skill 스위트는 시나리오 전건이 구 REST(`/api/v1/*`) 기대 — kiwibox 재편(specs/011)이 미적용된 잔재. 필터·시나리오 동시 재편 필요, 본 피처 범위 외.

## Dependencies

```text
Phase 2 (T001→T002, T003 병렬)
  ├─→ US1: T004 → T005 → T006 → T007
  ├─→ US2: T008 → T009 → T010 → T011   (US1과 독립 — 다른 파일)
  └─→ US3: T012 → T013                  (T006 완료 후 — footer 공유)
Polish: T014·T017 병렬 언제든 / T015 → T016은 전 스토리 후
```

## Parallel Examples

- T001+T003 동시 (runner vs mock — 다른 파일)
- US1(T004~T007)과 US2(T008~T011) 교차 진행 가능 — 단 scenarios.json append는 순차 권장(같은 파일)
- T014, T017 문서 태스크는 언제든 병렬

## Implementation Strategy

1. **MVP** = Phase 2 + US1 (T001~T007): echo 제거만으로 사용자 체감 최대
2. US2 → US3 순차 증분
3. FAIL-first 증적: T005·T009의 구현 전 FAIL 로그는 완료 보고에 run 경로 포함 (헌장 III)
4. footer 문구 튜닝 루프: FAIL 시 문구만 조정 — 구조 변경(주입점·분기 수 변경)이 필요해지면 중단 후 스펙 개정
