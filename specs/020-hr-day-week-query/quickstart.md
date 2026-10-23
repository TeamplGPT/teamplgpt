# Quickstart: 020 검증

1. 단위: `cd server && npx jest __tests__/storage/plugins/agent-skills/date-range.test.js __tests__/storage/plugins/agent-skills/day-week-query.test.js` + 전체(기준선 74 외 새 실패 0, 골든 `date` 없는 경우 변화 0).
2. 라우팅 평가: `node evals/hr-routing/run.js --grep 오늘`·`--grep 이번 주`·`--tags boundary,ambiguous`, 전체 2회.
3. E2E: 위젯·@agent "오늘 출근시각", "어제 지각", "지난주 출퇴근", "내일 근무", "어제 연장근무", "오늘 회사 일정" — 표 날짜가 범위 안만. 장시간 모델 멈춤 대비 묶음별 감시(scratchpad `run-chunks.sh`).
4. 실서버(세션 필요): "오늘 출근시각" handler 직접 연결 결과가 5240 출퇴근기록 화면의 오늘 값과 같은지.
