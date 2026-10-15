# Quickstart: 연도 단위 기간 질의 검증 가이드

구현 후 아래 순서로 검증한다. 1~3은 이 리포만으로 실행된다. 4~5는 서버·DB 또는 실서버 세션이 필요하다.

공통 준비:

```bash
export PATH="$HOME/.nvm/versions/node/v18.19.0/bin:$PATH"   # .nvmrc v18 계열
cd server
```

## 1. 단위·골든 테스트 (SC-001, SC-002, SC-005)

```bash
npx jest --ci __tests__/storage/plugins/agent-skills/period-resolver.test.js \
              __tests__/storage/plugins/agent-skills/period-year-mode.test.js \
              __tests__/storage/plugins/agent-skills/period-golden.test.js
node --test storage/plugins/agent-skills/_shared/__tests__/
```

기대 결과:

- period-resolver: contracts/period-resolver.md 테스트 벡터 전부 통과
- period-year-mode: 그룹별 연도 요청·머리 줄·축약·월별 병합·첫 달 실패 중단·60초 예산 통과
- period-golden: `--ci`에서 스냅샷 **불일치 0건**. 새 스냅샷이 생기면 안 된다. 스냅샷은 변경 전(HEAD)에 캡처한 것이다
- node --test: dateResolver 15건, hrSession 15건 통과(무수정 모듈)

기존 테스트 전체 — 기준선과 비교:

```bash
npx jest 2>&1 | tail -5
```

기대 결과: 기준선 대비 통과 수 감소 0, 실패 항목 증가 0. 레거시 4개 파일의 기존 실패는 그대로다.

## 2. 라우팅 평가 (SC-003, SC-004)

```bash
node evals/hr-routing/run.js                  # 1회차
node evals/hr-routing/run.js                  # 2회차 (조건 변경 없이)
node evals/hr-routing/run.js --grep year      # 연도 케이스만
```

- OpenAI만 호출한다. HR 시스템은 호출하지 않는다.
- 기대 결과: 두 회차 모두 기준선 리포트 대비 **신규 실패 0건**. 연도 케이스(`*-year-*`)는 전부 통과한다. 즉 `year_month`/`cal_yy`에 연도 표현을 그대로 넘기고 1회만 호출한다.
- 리포트: `evals/hr-routing/reports/<timestamp>.md`

## 3. 실제 handler 출력 육안 확인 (mock 전송)

period-year-mode 테스트의 출력 스냅샷 대신 사람이 읽을 형식을 확인한다. 아래가 보이면 된다.

- 머리 줄 `> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)`
- 근무현황: 집계 줄 + 특이사항 있는 날 표 + "그 외 N일은 특이사항 없음"
- 연장근무: 월별 표 + "연간 합계 **HH:MM** (조회된 10개월)"

(실행 예는 tasks의 해당 작업에 둔다.)

## 4. E2E 두 스위트 (SC-006) — 사용자 환경

사전 조건: Postgres 기동, teamplgpt 서버 `:3001` 기동, workspace `eshelsoft`, HR skill 활성. `_shared`·`utils` 변경이 있으므로 **서버 재기동 필수**(HR-SKILL-GUIDE §6.2).

```bash
docker start anythingllm-postgres
yarn dev:server
npm run e2e:hr-skill                 # 전건
npm run e2e:embed-hr-skill           # 전건
npm run e2e:hr-skill -- --only=<연도 시나리오 ID들>
```

기대 결과: 두 스위트 전건 PASS. 연도 시나리오는 다음을 검증한다.

- 범위 요청 `searchBaseSYmd=20260101`
- 월별 요청 수 하한(`min_hr_calls`)
- 월별 요청 중 1월 포함(`mock_body_pattern_any`)

한계: E2E는 서버 폴백 경로만 탄다. 위젯(R1) 경유는 5번에서 확인한다.

## 5. 실서버 확인 (SC-007, SC-008) — ntest.5240.kr

위젯에서 새 대화로 직접 묻거나, 사용자가 허용한 경우 세션 쿠키로 handler를 서버 폴백 모드로 실행한다. 세션 쿠키는 파일에 남기지 않는다.

| # | 질문 | 확인할 것 |
|---|---|---|
| 1 | "올해 근무현황 알려줘" | 머리 줄 기간 = 1/1~오늘, 응답 행 전부 본인 |
| 2 | "올해 연장근무 내역 알려줘" (위젯) | 월별 표가 나오고 위젯 경유 순차 호출이 끝까지 성공하는지. `otWeekSum` 값이 `HH:MM` 형식인지(research R9) |
| 3 | "올해 근무 캘린더" | 1년 범위 1회 조회가 12개월 데이터를 돌려주는지(spec D7). 안 되면 work_calendar를 monthly로 전환 |
| 4 | "작년 결재한 문서" | 기간 2025-01-01~2025-12-31 |
| 5 | "3월 출퇴근 기록" | 변경 전과 같은 답(머리 줄 없음, 그 달 전체 표) |
| 6 | 연장근무 기록이 있는 계정으로 2번 | 답변의 기간 표기가 실제 조회 범위와 같고, 1월만 조회한 결과를 연간이라 말하지 않음(SC-008) |
