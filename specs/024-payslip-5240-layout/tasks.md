# Tasks: 위젯 챗봇 급여명세서를 5240 급여명세서 화면 구성으로 (024)

**Input**: [spec.md](spec.md) · [plan.md](plan.md) · [contracts/](contracts/)
**승인**: 계획·구현 착수 사용자 승인(2026-11-18 "구현 들어가줘")

## Phase 1: 테스트·시나리오 먼저 (RED)

- [X] T001 [US1] handler 단위 테스트 작성 — 영역 순서·숨김 칸·소급 0 숨김·기재 0건 생략·영역 오류 처리·지침 1회 `server/__tests__/storage/plugins/agent-skills/payslip-5240-layout.test.js`
- [X] T002 [P] [US1] E2E mock에 List·List2·List3·Map fixture 추가(지급 4·공제 6·기재 2, 합계 맞춤) `server/scripts/e2e-hr-skill/mock-hr-api.js`
- [X] T003 [US1] embed E2E 명세서 답 구성 시나리오 추가(네 영역 줄 존재, `| 지급구분 |`·`| 급여연월 |` 없음, List3 호출) `server/scripts/e2e-embed-hr-skill/scenarios.json`
- [X] T004 [US2] embed E2E 공제만·실수령만 시나리오에 "명세서 전체가 나오지 않음" 기대 추가 `server/scripts/e2e-embed-hr-skill/scenarios.json`
- [X] T005 T001 실행 → FAIL 확인, embed E2E 신규 시나리오 FAIL 확인

## Phase 2: 구현 (GREEN)

- [X] T006 [US1] payslip: 네 조회 동시 호출 + 영역별 표(contracts/payslip-answer.md) `server/storage/plugins/agent-skills/hr-salary/handler.js`
- [X] T007 [US1] payslip 설명을 "명세서 전체(합계·지급·공제·기재)"로 — Location B만, §4.3 유지 `server/storage/plugins/agent-skills/hr-salary/plugin.json`
- [X] T008 [P] [US1] 위젯 브리지 List3 허용 + 테스트(본인 강제·List4 거부) `okrservice/widgets/client/messenger/widget/hrBridge.ts`

## Phase 3: 검증

- [X] T009 T001 통과, 기존 테스트 새 실패 0(기준선 비교), 골든 스냅샷 영향 확인
- [X] T010 라우팅 평가 경계·전체(급여 케이스 회귀 없음)
- [X] T011 embed E2E 전체 + agent E2E(K10·K11·K12·KB43)
- [X] T012 [US3] 가짜 데이터로 "10월 급여명세서"·"이번 달 급여명세서(11월 미지급)" 확인, 위젯 표 렌더 미리보기 갱신

## Dependencies

T001~T004 → T005 → T006·T007·T008(병렬 가능) → T009~T012

## 구현 중 추가 (2026-11-18)

- [X] T013 [US1] 가짜 데이터 확인에서 모델이 영역 제목(**합계**·**지급내역** 4건 …)을 빈 줄로 되풀이(6회 중 3회) → L1 `[답변 지침]` 줄(handler) + L2 제목 되풀이 제거(`server/utils/hrTableBlocks.js` `joinFinalAnswer`, 테스트 `server/__tests__/utils/hrTableBlocks.test.js`). 재확인 6/6 깔끔
- [X] T014 코드 리뷰 반영 — 영역 제목·표 사이 빈 줄(HIGH), 표 없을 때 지침 분기, 일부 실패 시 원인 한 줄, 항목 금액 원래 글자 유지, kiwibox 브리지 목록 List3 추가
