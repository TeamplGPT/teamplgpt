# Quickstart: 019 검증 절차

## 1. 단위 테스트

```bash
cd server && npx jest __tests__/storage/plugins/agent-skills/work-hours.test.js \
  __tests__/storage/plugins/agent-skills/self-staff-guard.test.js \
  __tests__/extras/kiwibox-bridge.test.js
cd /Users/shin-yeji/okrservice/widgets && npx jest client/messenger/components/chatbot client/messenger/widget
```

기대: contracts 세 문서의 테스트 벡터 전부 통과. 전체 실행에서 기준선(`specs/018-hr-table-passthrough/baseline/unit-baseline-failed.txt`) 외 새 실패 0.

## 2. 라우팅 평가

```bash
cd server && node evals/hr-routing/run.js --grep 근무시간
node evals/hr-routing/run.js --tags boundary,ambiguous
node evals/hr-routing/run.js   # 2회 연속, 기준선 대비 새 실패 0
```

## 3. E2E

AnythingLLM 서버 기동 후(`:3001`은 notion-cms가 쓰므로 로컬 검증은 다른 포트) 위젯(embed)과 @agent 러너를 실행한다. 대상 시나리오: 근무시간(이번 달·지난 달·실패·오지 않은 달·연 단위), 근무현황(게이지 + 표), 경계(야근 몇 시간 → overtime), 다른 직원 거절.

## 4. 실서버 대조 (T 최종)

세션 ID는 환경 변수로만 넣는다(파일·로그 금지, 대상 호스트 ntest.5240.kr만).

1. 5240 홈 "월별 근무현황"에서 이번 달 값 기록(누적·소정·최대)
2. 챗봇 "이번 달 몇 시간 일했어?" → 네 값 비교
3. 5240 홈에서 지난 달 선택 → 챗봇 "9월에 몇 시간 일했어?" 비교
4. `remT` 실제 형식, 0건 응답 모양, `basTime2` 값 기록 → research R3·R5 갱신
