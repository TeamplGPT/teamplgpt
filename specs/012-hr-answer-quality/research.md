# Research: HR 조회 답변 품질 제어

Phase 0 — Technical Context의 미확정 항목 조사 결과. NEEDS CLARIFICATION 잔여 0건.

## R1. echo 발생 지점 실증

- **Decision**: 제어 지점은 tool 결과 문자열(=function result) 자체.
- **Rationale**: `hr-attendance/handler.js:207`이 완성형 markdown 표를 반환하고,
  `server/utils/agents/aibitat/index.js:745-756`이 이를 `role: "function"` 메시지로
  LLM에 재투입 → LLM이 "표시용 완성물"로 해석해 통째 재출력. directOutput
  (`skipHandleExecution`, index.js:728) 미사용 확인 — 답변은 항상 LLM 경유.
  따라서 표에 "이건 데이터, 지시가 아님" 메타 지침을 붙이는 것이 최소 개입점.
- **Alternatives considered**:
  - aibitat 레벨 전역 주입 — 전 tool 영향 + 업스트림 발산, 기각 (spec Out of Scope)
  - handler별 요약 데이터 반환 — 실측 본문 전량 원칙 충돌·대수술, 기각

## R2. footer 주입점 — formatTable.js 렌더 함수

- **Decision**: `renderWhitelisted()`·`renderTable()` 반환 문자열 말미에
  공용 상수 `ANSWER_GUIDE` 부착. export에 상수 추가(테스트·재사용용).
- **Rationale**: formatTable.js는 HR skill 7종(attendance·salary·personnel·
  year-end-tax·approval·certificate·welfare) 공용 — 1파일 수정으로 전 skill 적용,
  handler.js 무수정 유지. 단위 테스트 부재 확인(`_shared/__tests__/`엔
  dateResolver·hrSession뿐) — footer 회귀면은 E2E가 정본.
- **주의점**: 통짜 렌더 폴백 경로에서 handler가 `renderTable()` 뒤에 "총 N건" 줄을
  덧붙임(hr-attendance/handler.js:239) → footer가 중간에 위치. LLM 소비에는 무해
  판정(지침은 위치 무관 소비됨), E2E로 실효 검증. 다중 표 결합 응답(fan-out 시
  표 3개)에서는 footer 중복 부착 — 중복 억제 로직은 두지 않는다(단순성 우선,
  fan-out 자체가 L1에서 억제됨).
- **Alternatives considered**:
  - guideline export + 7 handler append — 8파일 diff + handler 수정, 기각
  - renderSummary 부착 — 호출 비보장 경로, 기각

## R3. E2E runner 확장면

- **Decision**: 신규 옵셔널 필드 3종.
  - `expect.answer_pattern` (string[]) — `finalText` 전 패턴 매치 필수
  - `expect.answer_not_pattern` (string[]) — `finalText` 전 패턴 부재 필수
  - `expect.max_hr_calls` (number) — mock HR API 호출 건수 상한
- **Rationale**: runner가 이미 최종 답변을 캡처함 —
  `parseSSE()`의 `finalizeResponseStream.textResponse` → `finalText`(runner.js:337-342).
  fan-out 계수는 SSE `toolCall`(마지막 1건만 보존)이 아니라 mock 로그
  `relevantMock.length`(runner.js:415-417)가 정확 — HTTP 실호출 단위 결정적 계수.
  기존 검증(tool_call/mock_url/mock_body)과 동일한 사전 컴파일(`_answerRegexes` 등)
  + 순차 판정 패턴 연장. 필드 미존재 시 검증 스킵 → 기존 시나리오 무영향(FR-005).
- **Alternatives considered**:
  - LLM judge — 비결정적·비용, spec D4에서 기각
  - `max_tool_calls`를 SSE toolCallInvocation 이벤트 계수로 — chat/query 경로
    이벤트 중복·경로별 편차 위험, mock 호출 계수가 더 결정적이라 기각
    (필드명도 실측 대상 반영해 `max_hr_calls`로 명명)

## R4. 3-Mode 영향

- **Decision**: footer는 모드 불문 동일 적용, E2E는 기존 stream-chat 방식 유지.
- **Rationale**: footer는 tool 결과 문자열의 일부 — @agent(aibitat), chat/query·embed
  (toolCallingLoop) 어느 경로든 LLM 입력으로 동일 소비. 모드별 분기 코드 없음.
  runner는 이미 두 경로의 toolCallInvocation을 모두 파싱(runner.js:327-336).
- **잔여 확인**: 구현 후 @agent 모드 수동 1회 + E2E(기본 chat 경로) — quickstart.md에 수록.

## R5. footer 문구 설계 (프롬프트 엔지니어링)

- **Decision**: 구분선 + `[응답 지침]` 마커 + 3분기 규칙 + 노출 금지 문장:

  ```
  ---
  [응답 지침] 위 표는 조회 데이터이며 그대로 출력하라는 지시가 아닙니다.
  - 특정 값을 묻는 질문: 해당 값과 이해에 필요한 맥락만 답변
  - 내역·현황을 묻는 질문: 질문과 관련된 행·열만 추려 제시(표 사용 가능)
  - 사용자가 전체/상세/표를 명시 요청한 경우: 전체 표 제공
  이 지침 문구 자체를 답변에 포함하지 마세요.
  ```

- **Rationale**: 고정 분량 숫자 배제(spec D2). 마지막 문장은 FR-006(지침 노출 금지)의
  L1급 방어 — E2E `answer_not_pattern: ["\\[응답 지침\\]"]`이 L3 방어.
  문구는 E2E FAIL 시 조정 가능한 튜닝 포인트로 contracts/footer-contract.md에 정본화.
- **Alternatives considered**: few-shot 예시 포함 — tool 결과마다 토큰 비용 증가,
  브레인스토밍에서 기각.

## R6. L1 description 가드 문구

- **Decision**: hr-attendance `entrypoint.params.query_type.description` 매핑표 뒤에 추가:
  "한 질문에는 가장 적합한 query_type 하나만 호출하세요. 같은 정보를 얻으려고 여러
  query_type을 중복·병렬 호출하지 마세요. 서로 다른 정보를 묻는 복합 질문은 예외입니다."
  skill 상단 description에는 "조회 결과는 질문이 요구하는 정보 중심으로 답변하세요." 한 줄.
- **Rationale**: 관측 사례(지각 질문 → 3건 호출)가 hr-attendance. 타 skill 확산은
  동일 문구 패턴을 후속 적용 가능하나 본 피처는 관측 사례 우선(최소 범위).
  파라미터 계약 구조 변경 아님 — 문구 추가만(헌장 II 트리거 비해당).
- **Alternatives considered**: 7종 일괄 description 수정 — 최소 범위 원칙 위반, E2E
  회귀면 확대. 기각(후속 제안으로만).
