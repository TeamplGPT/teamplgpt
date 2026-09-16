# Contract: `viz` 코드블록 (LLM 출력 ↔ okrservice 렌더러)

이 문서는 teamplgpt(생산자: LLM, `hrSkillGuard.js`의 `[HR_VIZ_OUTPUT]` 가드가 지시)와
okrservice(소비자: `ChatbotView.tsx` → `vizRenderers.ts`) 사이의 유일한 인터페이스 계약이다.
서버-서버 API가 아니라 **채팅 응답 텍스트 안에 실리는 코드펜스 포맷** 계약이다.

## 포맷

응답 텍스트 안에 아래와 정확히 일치하는 코드펜스가 **최대 1개** 존재할 수 있다:

    ```viz
    { "type": "...", "data": { ... } }
    ```

- 언어 태그는 반드시 소문자 `viz`.
- 내용은 유효한 JSON 1개 객체(주석/트레일링 콤마 불가).
- 시각화 요청이 아닌 응답에는 이 블록이 없어야 한다(FR-001).

## JSON Schema (문서화 목적, 런타임에 ajv 등으로 강제하지 않음 — 렌더러가 필드 존재 여부로 관대하게 검증 후 실패 시 폴백)

```json
{
  "$id": "viz-block.schema.json",
  "type": "object",
  "required": ["type", "data"],
  "properties": {
    "type": { "enum": ["orgchart", "workstatus", "salarytrend"] },
    "data": {
      "oneOf": [
        {
          "title": "orgchart",
          "type": "object",
          "required": ["root", "members"],
          "properties": {
            "root": { "type": "string", "minLength": 1 },
            "members": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["name"],
                "properties": {
                  "name": { "type": "string", "minLength": 1 },
                  "title": { "type": "string" }
                }
              }
            }
          }
        },
        {
          "title": "workstatus",
          "type": "object",
          "required": ["labels", "values"],
          "properties": {
            "labels": { "type": "array", "minItems": 1, "items": { "type": "string" } },
            "values": { "type": "array", "minItems": 1, "items": { "type": "number" } }
          }
        },
        {
          "title": "salarytrend",
          "type": "object",
          "required": ["labels", "series"],
          "properties": {
            "labels": { "type": "array", "minItems": 1, "items": { "type": "string" } },
            "series": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["name", "values"],
                "properties": {
                  "name": { "type": "string", "minLength": 1 },
                  "values": { "type": "array", "items": { "type": "number" } }
                }
              }
            }
          }
        }
      ]
    }
  }
}
```

## 예시

```viz
{"type": "workstatus", "data": {"labels": ["정상", "지각", "결근"], "values": [28, 2, 1]}}
```

```viz
{"type": "orgchart", "data": {"root": "개발1팀", "members": [{"name": "홍길동", "title": "팀장"}, {"name": "김철수", "title": "사원"}]}}
```

```viz
{"type": "salarytrend", "data": {"labels": ["2025-01", "2025-02"], "series": [{"name": "실지급액", "values": [3200000, 3200000]}]}}
```

## 실패 처리 계약

소비자(okrservice)는 다음 중 하나라도 해당하면 **크래시 없이** 원본 코드블록을 평문 코드로 폴백 렌더링해야 한다:
- JSON 파싱 실패
- `type`이 3종 외의 값이거나 누락
- 해당 `type`의 필수 필드 누락 또는 타입 불일치

배열형 필드가 모두 존재하지만 길이 0인 경우(정상 파싱, 값 없음)는 폴백이 아니라 "표시할 데이터가 없습니다" 안내로 처리한다(spec.md 엣지 케이스와 동일 기준).
