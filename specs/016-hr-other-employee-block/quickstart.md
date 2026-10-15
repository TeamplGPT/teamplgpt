# Quickstart: 다른 직원 정보 차단 검증 가이드

공통 준비:

```bash
export PATH="$HOME/.nvm/versions/node/v18.19.0/bin:$PATH"
cd server
```

## 1. 단위·골든

```bash
npx jest --ci __tests__/storage/plugins/agent-skills/other-employee-block.test.js \
              __tests__/utils/hrSelfDataNotice.test.js \
              __tests__/storage/plugins/agent-skills/period-golden.test.js \
              __tests__/storage/plugins/agent-skills/period-golden-extra.test.js \
              __tests__/storage/plugins/agent-skills/period-year-mode.test.js
npx jest 2>&1 | tail -5     # 전체 — 015 최종 통과 목록 대비 감소 0
```

기대 결과:
- 제공 중단 조회 6종은 HR 호출 0건이고 거절 문구를 반환한다.
- org_members에는 이름·소속·직위·직책만 나온다.
- 안내는 조직도를 뺀 hr 결과 끝에만 붙는다.
- 골든 155건이 일치한다.
- 기존 통과 감소 0건(정리한 33건 제외 — contracts/test-expectations.md §5).

## 2. 라우팅 평가 (OpenAI만 호출)

```bash
node evals/hr-routing/run.js --tags other-employee   # 다른 직원 지칭 — 2회 연속 100%
node evals/hr-routing/run.js --grep year             # 연도 14/14
node evals/hr-routing/run.js                         # 전체 ×2 — 변경 목록 외 신규 실패 0
for i in $(seq 1 10); do node evals/hr-routing/run.js --grep att-ot-year-02; done   # 10/10 목표
```

## 3. E2E (서버·Postgres)

```bash
docker start anythingllm-postgres
SERVER_PORT=3011 yarn dev          # 3001이 비어 있으면 그대로 yarn dev
E2E_SERVER_URL=http://localhost:3011 npm run e2e:hr-skill
E2E_SERVER_URL=http://localhost:3011 npm run e2e:embed-hr-skill
```

- macOS에서 mock 준비 확인이 실패하면(localhost→::1) 015 방식대로 runner 복사본에서 `127.0.0.1`로 실행한다. 리포 파일은 바꾸지 않는다.
- EC-FILTER-03은 같은 조건을 16회 반복해 HEAD 수준(≥ 10/16)인지 확인한다. 가드를 바꿨기 때문이다.

기대 결과:
- K8·K58·K69·K70·K71·EC-ALLOW-17·18·EC-FILTER-08은 PASS다. 전체 허용 위젯 시나리오(EC-ALLOW-17·18)는 tool 호출이 강제되므로 답변으로 판정한다(research R10).
- K62는 PASS이고 사번·근무정보가 나오지 않는다.
- 그 외 기존 PASS는 유지한다(015에서 기존 불안정으로 확인한 K64·KB48·K58(구)·EC-FILTER-03 변동 제외).

## 4. 위젯·실서버 (사용자 확인)

새 대화에서 아래를 묻는다.

| 질문 | 기대 |
|---|---|
| 김기현 연차 알려줘 | "다른 직원의 정보는 조회할 수 없어요…" — 숫자 없음 |
| 우리 팀 휴가자 현황 보여줘 | 거절 |
| 결재 대기 문서 몇 건이야? | 건수만 |
| 우리 팀 조직도 보여줘 | 조직도 그래프, 팀원 이름·직위만 |
| 내 연차 알려줘 / 올해 연장근무 내역 | 지금과 같은 본인 답변 |
