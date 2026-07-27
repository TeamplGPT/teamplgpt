# Data Model: HR 조회 답변 품질 제어

영속 데이터 없음 — 본 피처의 "데이터"는 문자열 계약 2종과 E2E 시나리오 스키마 확장이다.

## E1. 응답 지침 footer (`ANSWER_GUIDE`)

| 속성 | 값 |
|------|-----|
| 위치 | `server/storage/plugins/agent-skills/_shared/formatTable.js` 모듈 상수 + export |
| 타입 | string (불변 상수) |
| 부착 지점 | `renderWhitelisted()` 반환값 말미, `renderTable()` 반환값 말미 |
| 부착 조건 | 렌더 결과가 비어 있지 않을 때만 (0건 경로 미부착 — FR-007) |
| 정본 문구 | [contracts/footer-contract.md](./contracts/footer-contract.md) |

검증 규칙:

- 고정 분량 숫자(문장 수·행 수 상한) 포함 금지 (FR-001)
- `[응답 지침]` 마커 문자열은 E2E 노출 금지 패턴의 앵커로 사용 (FR-006)

## E2. E2E 시나리오 `expect` 확장 필드

기존: `tool_call`(boolean, 필수) · `mock_url_pattern` · `mock_body_pattern`.
신규 3종 — 전부 **옵셔널**, 미존재 시 해당 검증 스킵 (FR-005):

| 필드 | 타입 | 대상 | 판정 |
|------|------|------|------|
| `answer_pattern` | string[] (regex) | `finalText` (finalizeResponseStream) | 전 패턴 매치 필수 — 하나라도 미매치 시 FAIL |
| `answer_not_pattern` | string[] (regex) | `finalText` | 전 패턴 부재 필수 — 하나라도 매치 시 FAIL |
| `max_hr_calls` | number (≥1 정수) | mock HR API 호출 계수 (`relevantMock.length`) | 초과 시 FAIL |

상태 규칙:

- 로드 시 regex 사전 컴파일 (`_answerRegexes`, `_answerNotRegexes`) — 기존 `_mockUrlRegex` 패턴 동일
- 유효성: 잘못된 regex·음수/비정수 `max_hr_calls`는 로드 단계 `fatal()` (기존 검증 스타일)
- `finalText`가 null인데 `answer_pattern`/`answer_not_pattern` 존재 → FAIL ("no final answer captured")
- 판정 순서: 기존 체인(tool_call → mock_url → mock_body) 뒤에 answer → max_hr_calls

## E3. L1 description 가드 (hr-attendance)

| 위치 | 추가 내용 |
|------|----------|
| `plugin.json` 상단 `description` | "조회 결과는 질문이 요구하는 정보 중심으로 답변하세요." |
| `entrypoint.params.query_type.description` 말미 | fan-out 억제 가드 (정본: research.md R6) |

구조 변경 없음 — 파라미터 추가·삭제·의미 변경 아님 (헌장 II 트리거 비해당).

## 관계

```text
사용자 질문
  → LLM이 query_type 선택  ←── E3 (fan-out 억제)
  → handler → formatTable 렌더 + E1 footer
  → LLM 최종 답변           ←── E1 (질문 유형 적응 소비)
  → E2E runner 판정          ←── E2 (answer/max_hr_calls assertion)
```
