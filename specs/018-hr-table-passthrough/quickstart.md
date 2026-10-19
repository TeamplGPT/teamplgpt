# Quickstart: HR 표 직접 출력 검증

## 준비

017과 같다.

- Node: v18.19.0
- 서버: 3011에서 명령 단위로 띄우고 내린다.
- E2E: scratch 사본(`localhost` → `127.0.0.1`)
- mock HR: `:8000`

## 1. 단위 테스트

```bash
cd server && npx jest utils/chats/toolCalling/__tests__ __tests__/utils/hrTableBlocks.test.js \
  __tests__/storage/plugins/agent-skills/overtime-status.test.js
cd /Users/shin-yeji/okrservice/widgets && npx jest client/messenger/components/chatbot
```

## 2. E2E (위젯·채팅 경로)

018은 tool 루프(채팅·위젯)에만 적용된다. @agent 시나리오(`@agent …`)는 기존 동작을 유지하는지 회귀만 본다. 표 직접 출력 판정은 embed 시나리오와 신규 chat 경로 시나리오에서 한다.

```bash
node server/scripts/e2e-embed-hr-skill/runner.js   # 전건
```

기대:
- 표를 돌려주는 시나리오의 답변에 조회 결과 표 줄이 글자 그대로 있다.
- 사유 빈 칸은 `| — |`다.
- 답변의 모델 문장 부분에 숫자 목록·별도 표가 없다.
- 거절 시나리오에는 표가 없다.

## 3. 견고성 (SC-001~003)

scratch `robust/` 위젯 러너로 대표 20종 × 3회를 돌린다.
- 표 글자 일치율 = 100%
- 빈 칸 대체 = 0
- 목록 잔존 = 0

## 4. 위젯 화면 확인

미리보기(https://claude.ai/artifact/Ccpr53H8pgD2HjBEds4T5j)와 실제 위젯을 나란히 놓고 확인한다(사용자).
- 한도 게이지
- 월별 사용률 막대
- 월별 표 접지 않음
- 출퇴근 표 7줄 접기
