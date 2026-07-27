# Contract: E2E `expect` 확장 스키마

`server/scripts/e2e-hr-skill/scenarios.json` 시나리오의 `expect` 객체 확장.
runner(`runner.js`)는 이 스키마대로 로드 검증·판정한다. 신규 필드 전부 옵셔널 (FR-005).

## 스키마

```jsonc
{
  "expect": {
    // ── 기존 (불변) ──
    "tool_call": true,                    // boolean, 필수
    "mock_url_pattern": "^/TAADclz...",   // string|null
    "mock_body_pattern": ["cmd=..."],     // string[]|null

    // ── 신규 (옵셔널) ──
    "answer_pattern": ["잔여.*22|22.*(일|개)"],   // string[] — finalText에 전 패턴 매치 필수
    "answer_not_pattern": [                        // string[] — finalText에 전 패턴 부재 필수
      "배우자출산휴가",
      "총 \\d+건 조회됨",
      "\\[응답 지침\\]"
    ],
    "max_hr_calls": 1                              // number(정수 ≥1) — mock HR 호출 건수 상한
  }
}
```

## 로드 검증 (fatal — 기존 스타일)

- `answer_pattern`/`answer_not_pattern`: string[] 아니면 fatal, 각 원소 regex 컴파일 실패 시 fatal
  → 사전 컴파일 결과 `s._answerRegexes` / `s._answerNotRegexes`
- `max_hr_calls`: 1 이상 정수 아니면 fatal

## 판정 규약 (runScenarioOnce)

기존 체인(tool_call → mock_url → mock_body) **뒤에** 순차 추가:

| 순서 | 조건 | FAIL reason 형식 |
|------|------|------------------|
| 4 | (`_answerRegexes` 또는 `_answerNotRegexes`) 존재 && `finalText == null` | `no final answer captured` (금지 패턴만 있는 시나리오도 답변 미캡처는 FAIL — vacuous pass 방지) |
| 5 | `_answerRegexes` 중 미매치 존재 | `answer missing pattern(s): <미매치 목록>` |
| 6 | `_answerNotRegexes` 중 매치 존재 | `answer contains forbidden pattern(s): <매치 목록>` |
| 7 | `max_hr_calls` 존재 && `relevantMock.length > max_hr_calls` | `hr calls N exceeded max M` |

- 판정 대상 `finalText` = `parseSSE()`의 `finalizeResponseStream.textResponse` (기존 캡처 재사용)
- fan-out 계수 = `relevantMock.length` (mock 로그의 `/api/v1/*` + `*.do` HTTP 실호출) —
  SSE toolCall(마지막 1건만 보존)은 계수용으로 사용하지 않음 (research.md R3)
- `result.json`에 `hrCallCount` 필드 추가 기록 (기존 `toolCall`·`finalText` 기록과 병렬)

## 호환성 보증

- 신규 필드 미사용 시나리오: 검증 4~7 전부 스킵 — 판정 결과 기존과 동일
- 기존 필드 의미·순서 변경 없음
