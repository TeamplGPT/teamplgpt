# Data Model: HR 표 직접 출력

모두 한 번의 사용자 질문 동안만 있는 값이다. 저장되는 것은 최종 답변 문자열뿐이며, 기존 대화 기록에 저장된다.

## TableBlock

```text
{
  toolName: "hr-attendance",   // skillIdOf 결과가 HR
  order: 0,                    // tool 호출 순서
  text: "| 구분 | 한도 | … |\n…\n> 사용 시간에는 …",  // 추출 규칙(contracts/final-answer §1) 결과, 글자 그대로
}
```

- `text`는 추출 뒤 바꾸지 않는다.
- 같은 `text`(앞뒤 공백 제거 기준)는 하나만 남긴다.

## LoopState (toolCallingLoop 안)

| 필드 | 뜻 |
|---|---|
| `tableBlocks: TableBlock[]` | 지금까지 실행한 HR tool에서 모은 블록 |
| `buffering: boolean` | `tableBlocks.length > 0`인 라운드에서 참. 텍스트를 실시간으로 내보내지 않음 |

상태 흐름:

```text
round 0 (블록 없음) ── 실시간 스트리밍 ──▶ tool 호출?
   │ yes: tool 실행 → 블록 추출 → tableBlocks += 블록
   ▼
round n (블록 있음) ── 캡처 응답으로 스트리밍 ──▶ tool 호출?
   │ yes: 캡처한 비텍스트 이벤트만 흘림 → tool 실행 → 반복
   │ no : sanitize(문장) + 블록들 → 한 번에 전송(close) → completeText
```

## 최종 답변 (FinalAnswer)

`sanitizeModelText(모델 문장)`, `\n\n`, 블록들을 `\n\n`으로 이은 것이다. 사용자 화면과 `completeText`(기록)가 같다.
