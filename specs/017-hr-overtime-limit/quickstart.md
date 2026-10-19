# Quickstart: 연장근무 한도·사용·잔여 검증

## 준비

- Node: `export PATH=/Users/shin-yeji/.nvm/versions/node/v18.19.0/bin:$PATH`
- 3001은 notion-cms가 쓰고 있을 수 있다. 서버는 다른 포트로 명령 단위로 띄우고 내린다:
  `cd server && NODE_ENV=development SERVER_PORT=3011 node --trace-warnings index.js &` … 검증 후 `pkill -f "node --trace-warnings index.js"`
- E2E는 `E2E_SERVER_URL=http://127.0.0.1:3011`로 실행한다. mock HR API는 runner가 `:8000`에 띄운다(잔존 프로세스가 있으면 먼저 정리).

## 1. 단위 테스트

```bash
cd server && npx jest __tests__/storage/plugins/agent-skills/overtime-status.test.js \
  __tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js \
  __tests__/storage/plugins/agent-skills/period-year-mode.test.js \
  __tests__/storage/plugins/agent-skills/period-golden.test.js \
  __tests__/storage/plugins/agent-skills/period-golden-extra.test.js \
  __tests__/storage/plugins/agent-skills/plugin-json-schema.test.js
cd /Users/shin-yeji/okrservice/widgets && npx jest client/messenger/widget/hrBridge.test.ts
```

기대: 전부 PASS. 계약 [tool-output-overtime.md](./contracts/tool-output-overtime.md) §1~§5와 [bridge-contract.md](./contracts/bridge-contract.md) §4의 케이스가 포함돼 있어야 한다.

## 2. E2E (@agent + embed)

```bash
npm run e2e:hr-skill -- --only=K6,K7,KB21,K66,K68,K77,K78,K79,K80,K81
# embed: 위젯 경로 연장근무 + 다른 직원 차단
node server/scripts/e2e-embed-hr-skill/runner.js --only=EC-ALLOW-27,EC-ALLOW-28,EC-FILTER-11,EC-FILTER-12
```

기대(시나리오 ID는 tasks에서 확정):
- 이번 달: 한도 요청 2회(searchType=2·3) + 내역 1회, 답변에 한도/사용/잔여 표
- 지난 달: searchType=3 1회 + 내역 1회, 주간 줄 없음
- 올해: searchType=3이 1월부터 이번 달까지, 합계 줄, "연장근무가 없는 달"
- 연장근무 없음(mock 무연장 월): "기록이 없습니다", "1건" 없음
- 팀 행 혼입(mock 다중 행 월): 다른 직원 이름 없음, 조회 실패 안내
- 다른 직원 연장근무 질문: 016 거절

이후 전체 회귀: `npm run e2e:hr-skill` 전건, embed 전건, 라우팅 평가 `node server/evals/hr-routing/run.js`(기준선 163·162/168 이상).

## 3. 견고성 세트

scratch `robust/cases.js`에 연장근무 케이스(본인 3·다른 직원 3·팀 2)를 추가해 위젯·필터 위젯에서 돌린다. 다른 직원 유출 0을 기대한다.

## 4. 실서버 확인 (사용자 세션 필요)

사용자에게 JSESSIONID를 받아 **환경 변수로만** 쓴다(파일·로그 기록 금지, 호스트 ntest.5240.kr 고정).
1. 이번 달 searchType=2·3과 Person 응답 형식을 확인한다. 연장근무가 없을 때 사용 값이 0인지 null인지, 단위가 시간인지 본다(research R5).
2. 챗봇 답의 한도·사용·잔여를 5240 모바일 연장근무현황(주간·월간 보기에서 본인 행) 값과 최소 3개 달 대조한다(SC-002).
3. 연장근무가 없는 계정·달로 "이번년도 연장근무 내역 알려줘"를 묻는다(SC-001).
