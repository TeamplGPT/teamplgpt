# Tasks: embed E2E 스위트 kiwibox 재정렬

**Input**: Design documents from `/specs/013-embed-e2e-kiwibox-realign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scenario-mapping.md, quickstart.md

**Tests**: 이 피처는 테스트 자체가 산출물 — E2E-First는 "시나리오 재작성 → 구 인프라에서
FAIL 실측(공백 증명) → runner/mock 이식 → PASS" 순서로 구현 (헌장 III, plan Constitution Check).

**Organization**: US1(ALLOW 재작성, P1) / US2(DENY·FILTER 현행화, P2) / US3(실행 가능성 복원, P1 —
US1·US2 산출물을 소비하므로 실행 순서상 마지막).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- embed 스위트: `server/scripts/e2e-embed-hr-skill/`
- 공유 mock: `server/scripts/e2e-hr-skill/mock-hr-api.js`

## Phase 1: Setup

해당 없음 — 기존 파일 수정·삭제만 (plan Structure Decision).

## Phase 2: Foundational

해당 없음 — E2E-First 순서상 시나리오 재작성(US1/US2)이 최선행이고, runner 이식(US3)은
FAIL 실측 이후여야 함. 차단성 선행 작업 없음.

## Phase 3: US1 — ALLOW 축 kiwibox 재작성 (P1) 🎯 MVP

**Goal**: allow-all embed에서 현행 kiwibox 호출(`.do`+`cmd=`) 검증 — 기대 전면 재작성 축.

**Independent Test**: `npm run e2e:embed-hr-skill` 실행 결과에서 EC-ALLOW-* 판정 확인

- [X] T001 [US1] EC-ALLOW-01~10 재작성 in `server/scripts/e2e-embed-hr-skill/scenarios.json` — `contracts/scenario-mapping.md` ALLOW 표 그대로: message 본인 기준(사번 문구 금지), `mock_url_pattern` `.do` 계열, `mock_body_pattern` `cmd=`/`queryId=`, 교체 2건(06 보너스→월별지급내역, 08 자격증→교육이력) 반영, EC-ALLOW-03에 `answer_pattern:["22"]` + `answer_not_pattern:["\\[응답 지침\\]"]` 스모크(R4). axis·embed_config·id 불변
- [X] T002 [US1] 구 인프라 FAIL 실측 — **결과: 허용측 14건 전건 FAIL** (runs/2026-07-27T14-06-51-843). 실측 원인은 예상(구 필터 미계수)에 더해 **override 불완전**: T020(012)에서 embed runner에 HR_BASE_URL 키만 교체하고 쿠키·스태프 override를 보류했던 탓에 hrSession이 "연동 미구성" 즉시 반환(0ms) → HTTP 미발생 → mock-hit 판정 불가. T005에서 헤더 3종 완성으로 봉합. 원계획 — `npm run e2e:embed-hr-skill` 실행(서버 `:3001` 필요), EC-ALLOW-* 전건 FAIL(구 `/api/v1` 필터가 `.do` 호출 미계수 → "no mock URL" 계열) 로그를 runs 경로와 함께 기록. 주: 신규 expect 필드(answer_pattern)는 구 runner가 무시하므로 로드 오류 없음 확인 포함

**Checkpoint**: 공백 증명 확보 — 재작성 기대가 구 인프라에서 판정 불가함이 실측됨

## Phase 4: US2 — DENY/FILTER 축 현행화 (P2)

**Goal**: 차단 축 message 현행화 + FILTER 허용측 기대 교체. 차단 판정 로직 무변경.

**Independent Test**: 전건 실행 결과에서 EC-DENY-*·EC-FILTER-* 판정 확인

- [X] T003 [US2] EC-DENY-01~05 message 현행화 in `server/scripts/e2e-embed-hr-skill/scenarios.json` — mapping 표 DENY 절: ALLOW 대비쌍 유지, DENY-05(무관 질의) 유지, expect `tool_call:false` 불변
- [X] T004 [US2] EC-FILTER-01~07 재작성 in `server/scripts/e2e-embed-hr-skill/scenarios.json` — mapping 표 FILTER 절: 허용측 4건(01·02·06·07) `.do`+`cmd=` 기대, 차단측 3건(03·04·05) `tool_call:false` 유지, 07 자격증→교육이력 교체, 02 "2024년" 조건 제거(annual_leave_balance 기간 불요 계약)

**Checkpoint**: 22건 전건 신판 기대 — `/api/v1`·"사번" 잔존 0건 (grep은 Polish에서 공식 검증)

## Phase 5: US3 — runner/mock 이식 + 실행 가능성 복원 (P1, US1·US2 이후)

**Goal**: 판정 인프라 동급화 → 전건 PASS = embed 면 최초 라이브 실측.

**Independent Test**: `npm run e2e:embed-hr-skill` exit 0 + `npm run e2e:hr-skill` 50/50

- [X] T005 [US3] embed runner 이식 — 추가 구현 2건: ① override 헤더 3종 완성(T002 실측 근거) ② parseSSE에 textResponseChunk 누적 폴백(embed finalize의 textResponse가 빈 값 — answer assertion 전제). 원계획 in `server/scripts/e2e-embed-hr-skill/runner.js` — R5 정본: ① mock spawn 경로 `../e2e-hr-skill/mock-hr-api.js`로 교체 ② relevantMock 필터 `/^\/api\/v1\//` → `/\.do$/` ③ specs/012 `contracts/e2e-assertion-schema.md` 계약대로 `answer_pattern`/`answer_not_pattern`/`max_hr_calls` 로드 검증·판정 4~7·`hrCallCount` 기록 이식(복사 허용). `effectiveToolCall`·차단 판정·embed_config 생성 로직 무변경(FR-006)
- [X] T006 [US3] 중복 mock 삭제 — `server/scripts/e2e-embed-hr-skill/mock-hr-api.js` 파일 삭제 (`git rm`), runner 참조 잔존 없는지 확인
- [X] T007 [US3] 전건 PASS — `npm run e2e:embed-hr-skill` 22/22, runs 경로 기록. EC-ALLOW-03 답변에 `22` 포함(footer 소비 스모크) 확인. FAIL 시: URL 패턴 실측 조정(특히 YTA 계열 `\d{0,4}` — mapping 표 비고)은 `contracts/scenario-mapping.md` 갱신 동반, 축 로직 수정은 금지(스펙 개정 사항)
- [X] T008 [US3] hr-skill 스위트 회귀 — `npm run e2e:hr-skill` 50/50 유지 (FR-007, 공유 mock 무변경이므로 판정 변화 없어야 함)

**Checkpoint**: SC-001/SC-003 충족 — embed 회귀망 복원 완료

## Phase 6: Polish & Cross-Cutting

- [X] T009 [P] 잔재 0건 공식 검증 — `grep -c "api/v1\|사번" server/scripts/e2e-embed-hr-skill/scenarios.json` = 0, `mock-hr-api.js` 부재 확인 (quickstart §잔재, SC-002/SC-004). 결과를 tasks 노트에 기록
- [X] T010 [P] embed README 갱신 in `server/scripts/e2e-embed-hr-skill/README.md` — mock 공유(포트 8001 유지) 안내, 신규 `expect` 필드 3종(specs/012 contract 링크), 시나리오 예시 kiwibox 패턴 확인, 전제조건 최신화

## Dependencies

```text
US1: T001 → T002 (FAIL 실측은 재작성 후)
US2: T003·T004 — T001과 같은 파일이라 순차 권장, T002 이전/이후 무관
US3: T005·T006 (T002 FAIL 실측 후) → T007 → T008
Polish: T009 (T004 이후 언제든) · T010 (T005 이후)
```

## Parallel Examples

- T003과 T004는 같은 파일 — 순차. T009·T010은 병렬 가능
- T005(runner)와 T003/T004(scenarios) 파일 분리 — 단 E2E-First 순서상 T002 FAIL 실측 전 T005 착수 금지

## Implementation Strategy

1. **MVP** = US1 + US3 (T001~T002 + T005~T008): ALLOW 축 복원만으로 embed 회귀망 핵심 가동
2. US2는 message·기대 치환 위주 — US1과 같은 커밋 흐름에 병합 가능
3. FAIL-first 증적: T002 로그는 완료 보고에 runs 경로 포함 (헌장 III)
4. 시나리오·URL 패턴 조정은 `contracts/scenario-mapping.md` 갱신 동반 — 계약·구현 불일치 금지
