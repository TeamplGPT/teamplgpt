# Research: HR 챗봇 연도 단위 기간 질의

조사일 2026-10-15. 근거는 파일:줄로 적는다. teamplgpt 경로는 리포 기준 상대경로, kiwibox는 `$KIWIBOX`, okrservice는 `$OKRSERVICE`로 적는다.

## R1. 현재 연도 표현이 어떻게 해석되는가

- **Decision**: 기존 `resolveDateParam`은 그대로 두고, 연도 판정은 새 함수 `resolveYearPeriod`가 직접 표로 한다.
- **Rationale**: `year_month` 포맷은 "한 달"만 표현할 수 있다. 연도만 들어오면 어떤 경로로든 한 달로 수렴한다(node 실측).
  - `"2026"`, `"2026년"` → `202601` (sugar-date가 빠진 월·일을 연초로 채움)
  - `"올해"` → `202610`, `"작년"` → `202510` (현재 월 유지)
  - `"이번년도"`, `"금년"`, `"재작년"` → `undefined` → handler가 "이번달"로 대체
  - `year` 포맷에서도 `"이번년도"`, `"재작년"`은 `undefined`. 그래서 연말정산은 조용히 기본 연도(2025)로 조회한다(`hr-year-end-tax/handler.js` cal_yy 해석부).
- **Alternatives considered**: `resolveDateParam` 수정. 기존 계약("YYYYMM 문자열 하나")을 쓰는 곳이 많아 회귀 위험이 크다(spec D3).

## R2. 조회별 기간 파라미터 수용 범위

- **Decision**: data-model §3의 `range`·`monthly`·`yearOnly` 분류를 따른다.
- **Rationale**: 각 handler의 ENDPOINT_MAP과 kiwibox `sqlmap/**/*_SQL.xml`의 WHERE절을 대조했다.
  - **범위 BETWEEN을 읽는 SQL** → `range`
    - TAAWrkTimeStatusMgr: searchBaseSYmd/EYmd
    - TAADclzVcatnCldrMgr, TAADclzWorkSearchCldr: searchSYmd/EYmd
    - SALDaylabMgr: searchDateSYmd/EYmd
    - EAPRequestMgr: sdt/edt
    - Main_SQL(getScheduleDay·getBirthDetailList·getHRDetailList): staYmd/endYmd
  - **`searchYm` 한 달 고정** → `monthly`
    - TAADclzWorkOtSchdul List/List2
    - NsCode `getSalYmdTypeCdList2`
  - **이미 연 단위** → `yearOnly`
    - TAADclzVcatnList List2 (Lv/Fy)
    - SALSalaryBassMgr (`SAL_YMD LIKE YYYY%`)
    - YTA (CAL_YY)
- **실서버 확인**: 근무현황 1/1~12/31 1회 조회 → 365행, 전 행 본인 데이터(2026-10-15, 테스트 계정).
- **미확인**: work_calendar는 WHERE에서 searchSYmd/EYmd만 읽고 BASE_YM은 안 쓴다(정적 분석). 실서버 확인 전까지 spec D7 조건부다.

## R3. 월별 순차 호출의 실행 가능성과 시간 상한

- **Decision**:
  - monthly 모드는 `hrFetch`를 월마다 **순차** 호출한다.
  - 첫 달이 실패하면 즉시 중단한다.
  - 누적 **60초** 시간 예산을 넘기면 남은 달을 호출하지 않고 "조회되지 않은 달 (시간 초과)"로 표시한다.
- **Rationale**:
  - `ClientToolBroker.request()`는 호출마다 독립 callId·타이머를 만든다(`server/utils/chats/toolCalling/clientToolBroker.js:55-105`). 순차 다중 호출에 제약이 없다.
  - 선례가 있다: 급여 지급 회차 3개월 순차 소급(`hr-salary/handler.js:154-175`), 증명서 동시 2건(`hr-certificate/handler.js:105-111`).
  - 상한은 건당으로만 있다: 브리지 fetch 20초(`$OKRSERVICE/widgets/client/messenger/widget/hrBridge.ts:25`), 위젯 대기 25초, broker 45초. tool 실행 전체 상한은 없다(`executor.js:49`).
  - 대기 중에는 10초마다 SSE keepalive를 보낸다(`clientToolBroker.js:67-75`). 그래서 정상 시 10회 × 1~2초는 문제없다. 하지만 최악의 경우 약 240초까지 갈 수 있어 handler에 예산이 필요하다.
  - 클라이언트가 끊기면 다음 request는 즉시 reject되고, hrFetch가 errorMessage로 바꿔 돌려준다(`clientToolBroker.js:56-59`, `hrSession.js:100-102`). 첫 실패 즉시 중단 규칙이 이 경우를 처리한다.
- **Alternatives considered**:
  - 동시 호출(`Promise.all`): 브리지·kiwibox 쪽 동시 세션 제한이 미확인이라 채택하지 않았다(spec D2).
  - 시간 예산 없음: 최악 4분 대기라 기각했다.

## R4. okrservice hrBridge 영향

- **Decision**: okrservice 수정과 작업지시서 발주는 없다.
- **Rationale**:
  - 사용하는 cmd가 모두 이미 허용돼 있다. `TAADclzWorkOtSchdul.do`의 `getTAADclzWorkOtSchdulList`·`getTAADclzWorkOtSchdulList2`(`hrBridge.ts:73-76`), `CommonCode.do`의 `getCommonNSCodeList` + queryId `getSalYmdTypeCdList2`(`hrBridge.ts:92,131-133`).
  - 브리지는 날짜 값의 형식·범위 길이를 검증하지 않는다(`hrBridge.ts:125-127,228-254`). 범위가 1년으로 넓어져도 차단되지 않는다.
  - 신규 엔드포인트가 없으므로 HR-SKILL-GUIDE §2의 동기화 규칙 대상이 아니다.

## R5. 하루 단위 결과의 분량

- **Decision**: 연도 모드에서 timesheet·work_status·schedule_day는 특이사항 있는 날만 표로 넘긴다(contracts/tool-output-year.md §2).
- **Rationale**:
  - 실서버 1년 조회가 365행을 반환했다. 이 경로는 근무지·근태 달력 기준으로 날짜마다 행을 만드는 구조라, 1/1~12/31이면 미래 날짜 행도 생긴다(`$KIWIBOX/.../TAAWrkTimeStatusMgr_SQL.xml`). 그래서 실적 조회는 1/1~오늘(spec D1)로 미래 행을 원천 배제한다.
  - schedule_day는 0건인 날도 반환한다(`Main_SQL.xml:561-563`).
- **Alternatives considered**: 전체 표를 그대로 넘기기. 수백 줄이 LLM에 들어가 비용·지연이 크고, 모델이 행을 직접 세다 틀릴 위험이 있다.

## R6. 3/4-Mode 영향

- **Decision**: 모드별 분기 코드는 없다. 검증은 chat/query·@agent(서버 폴백)·embed(R1) 세 경로로 한다.
- **Rationale**:
  - **chat/query**: `chatPrompt` → `hrSkillChatGuard` → `hrSkillCommonLines`(`server/utils/chats/index.js:102-111`), 실행은 `toolCallingLoop` → `ToolExecutor` → 같은 handler(`stream.js:381`)
  - **@agent**: `hrSkillPeriodGuard`가 같은 `hrSkillCommonLines`를 쓰고(`ai-provider.js:374-385`), handler도 같은 파일이다(`imported.js:189-215`)
  - **embed**: broker와 함께 실행되는 유일한 R1 경로(`embed.js:198,216-260`)
  - **react**: 가드는 들어가지만 액션이 `search_documents`뿐이라 HR handler를 실행하지 않는다(`react/index.js:42,277-282`). 영향 없음

## R7. 회귀 검증 수단

- **Decision**:
  1. **골든 스냅샷**: 월 단위 요청·결과를 HEAD에서 캡처한다.
     - `clientToolTransport`를 mock해 `{path, form}`을 가로챈다.
     - jest fake timers로 2026-10-15 서울 정오에 고정한다.
  2. **라우팅 평가**: 137건 × 2회 기준선 → 변경 후 2회. 기준은 "신규 실패 0"이다. 기존 실패(att-wc-03 근무표 모호성 등)는 기준선으로 인정한다.
  3. **기존 단위 테스트 기준선**: jest + `node --test`(dateResolver·hrSession은 node:test 형식이라 jest로 돌리면 0건 오류).
  4. **E2E 두 스위트**: 연도 시나리오를 추가한다.
- **Rationale**:
  - 라우팅 평가 데이터셋에 연도만 담긴 `year_month` 케이스는 0건이다. 값까지 검사하는 `params_regex` 케이스는 4건뿐이다.
  - 평가는 호출 개수까지 정확히 일치해야 통과한다(`server/evals/hr-routing/run.js:185`). 모델이 월별로 여러 번 호출하는 잘못된 행태도 FAIL로 잡는다.
  - 기존 레거시 테스트 4개 파일은 이미 실패 중이다. hr-attendance-handler 16건, hr-salary-handler 14건, hr-year-end-tax-handler 19건, hr-api-mock.integration 6건이다. "실패 증가 없음"만 확인한다.

## R8. E2E 인프라 확장 필요

- **Decision**: E2E 러너와 mock을 최소한으로 확장한다(테스트 인프라, 제품 코드 아님).
  - **runner** — `server/scripts/e2e-hr-skill/runner.js`:
    - `expect.min_hr_calls`(하한)를 추가한다.
    - `expect.mock_body_pattern_any[]`를 추가한다. 시나리오 중 기록된 **모든** mock 요청 중 하나라도 패턴과 맞으면 통과한다. 연도 범위 요청(`searchBaseSYmd=20260101`)과 월별 요청(`searchYm=2026-01`, `searchYm=202603`) 검증용이다.
  - **mock** — `mock-hr-api.js`:
    - `getTAADclzWorkOtSchdulList2`·`getTAADclzWorkOtSchdulList` fixture를 추가한다(`otWeekSum`·`sumOt`를 `HH:MM`으로).
    - `CommonCode.do`는 요청 `searchYm`에서 코드를 만들어 월마다 다른 지급 건을 준다. 현재는 고정 `20260619P`라 연도 병합에서 중복이 쌓인다.
- **Rationale**: 현재 runner는 마지막 mock 1건만 URL·body를 검증하고(`runner.js:521-526`), `max_hr_calls`는 상한만 본다(`:596-603`). mock은 날짜와 무관한 고정 응답이고, OT cmd fixture가 없어 빈 결과다(`mock-hr-api.js:208-227`).
- **한계**: 두 E2E 모두 `client_tool_execution`을 켜지 않아 서버 폴백 경로만 탄다(`runner.js:332-337`). **R1 위젯 경유 다중 호출은 E2E로 검증되지 않는다.** quickstart의 실서버(위젯) 확인 항목으로 보완한다.

## R9. 연장근무 합계 값의 형식

- **Decision**: 연간 합계는 모든 월 값이 `H:MM`/`HH:MM`일 때만 계산한다. 아니면 합계를 생략하고 그 사실을 표시한다.
- **Rationale**: `OT_01~OT_31`·주차 합계는 DB 함수 `CMMF_FORM_HHMM(…,'R','11',…)`이 만든다(`$KIWIBOX/.../TAADclzWorkOtSchdul_SQL.xml:16-46`). 함수 본문이 리포에 없어 출력 형식을 확정할 수 없다. 틀린 합계를 내는 것보다 생략하는 편이 FR-007·FR-013 취지에 맞다.
- **미확인 → quickstart 실서버 확인 항목**: 실제 `otWeekSum`·`sumOt` 값 형식.

## R10. 미커밋 근태 변경 처리

- **Decision**: 구현 시작 시 되돌리고(HEAD 복원), 골든을 HEAD에서 캡처한다. `hr-attendance-year-range.test.js`는 삭제하고 `period-year-mode.test.js`로 대체한다(spec D8).
- **Rationale**: 기존 변경은 `/^\d{4}$/`와 단어 표만 봐서 `"2026년"`, `"이번 년도"`를 놓친다. 공용 함수와도 중복된다. 골든은 수정 전 동작이어야 의미가 있다.
