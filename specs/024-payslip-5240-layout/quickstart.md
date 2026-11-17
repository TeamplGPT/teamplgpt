# Quickstart: 급여명세서 5240 구성 검증 (024)

## 준비
- TeamplGPT 로컬 서버 `:3001`(`yarn dev:server`), 위젯 E2E는 `npm run e2e:embed-hr-skill`, agent E2E는 `npm run e2e:hr-skill`.
- 테스트 계정은 급여 데이터가 없다 → 가짜 응답으로 확인한다(E2E mock fixture 또는 로컬 가짜 데이터 하네스).

## Q1. handler 단위 (jest)
```bash
cd server && npx jest __tests__/storage/plugins/agent-skills/payslip-5240-layout.test.js
```
기대: 합계·지급내역·공제내역·기재사항 순서, 지급구분·급여연월 없음, 소급 0이면 칸 없음, 기재 0건이면 영역 생략, 영역 오류 시 그 영역만 "조회하지 못했어요", 지침은 맨 끝 한 번.

## Q2. 라우팅 평가
```bash
cd server && node evals/hr-routing/run.js --tags boundary,ambiguous && node evals/hr-routing/run.js && node evals/hr-routing/run.js
```
기대: 명세서 질문 → pay_periods → payslip, "얼마 떼갔어" → deductions, "실수령" → payslip_summary. 새 실패 없음(알려진 실패 제외), 2회 연속.

## Q3. embed E2E (위젯 경로)
- 명세서 시나리오가 네 cmd(List·List2·List3·Map)를 호출하고, 답에 `> **합계**`·`> **지급내역**`·`> **공제내역**`·`> **기재사항**` 줄과 표가 있고 `| 지급구분 |`·`| 급여연월 |`가 없는지.
- 공제·실수령 시나리오는 명세서 전체가 나오지 않는지.

## Q4. agent E2E (@agent 경로)
- K10·KB43(명세서)·K11(공제)·K12(실수령) 통과.

## Q5. 위젯 브리지 (okrservice)
```bash
cd widgets && npx jest client/messenger/widget
```
기대: List3 허용, 다른 사번 거부, List4 거부.

## Q6. 화면 확인
가짜 데이터 하네스로 "10월 급여명세서 보여줘"·"이번 달 급여명세서 보여줘"(11월 미지급)를 물어 위젯 표 컴포넌트로 렌더해 확인(SC-001·US3).
