# Implementation Plan: HR 챗봇 표 직접 출력

**Branch**: `feature/skill-modify-hrchat-merge` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-hr-table-passthrough/spec.md`

## Summary

HR tool 결과의 표를 모델이 다시 쓰지 않게 한다. 시스템이 만든 표를 그대로 답변 끝에 붙인다. 채팅·위젯·API가 함께 쓰는 tool 루프(`loop.js`) 한 곳에서 처리한다(research R1).

1. **표 블록 추출** (신규 `server/utils/hrTableBlocks.js`, R2): HR tool 결과에서 표, 소제목, 정보 줄만 남긴다. 모델용 지시·내부 참조·공통 응답 지침은 뺀다. 표가 없으면 블록도 없다(거절·오류·기록 없음).
2. **모델 지시 교체** (R3): 블록이 있는 결과는 `[응답 형식]` 줄을 지우고 `[표 표시]` 줄을 붙인다. 표 블록은 시스템이 붙이니, 모델은 1~2문장 요점만 쓰라는 내용이다.
3. **최종 답변 조립** (R4·R5): 블록이 모인 뒤의 텍스트 라운드는 캡처 응답으로 받는다. 끝나면 모델 문장에서 표·제목·숫자 목록을 걸러낸다. 거른 문장과 블록들을 한 번에 보낸다. `completeText`(기록)도 같다.
4. **위젯 표시** (okrservice, R6)
   - 한도·사용·잔여 표는 "잔여 중심 게이지"로 그린다.
   - 월별 표는 사용 칸에 한도 기준 막대를 그린다. 막대 시작점은 모든 줄에서 같고, 표를 접지 않는다.
5. **017 연 단위 표 정리** (R7): 조회 못 한 달은 "—", 합계 첫 칸은 "합계 (조회된 N개월)", 정보 줄을 하나 추가한다.
6. **L3**: 루프·추출·위젯 단위 테스트, embed E2E 기대값(표 줄 글자 일치·빈 칸 "—"·목록 없음), 견고성 20종 × 3회.

@agent 경로(aibitat)는 바꾸지 않는다(D9). 그 경로에서는 handler의 기존 `[응답 형식]` 지시가 그대로 쓰인다.

## Technical Context

**Language/Version**: Node.js 18(teamplgpt server, CommonJS), TypeScript/React(okrservice widgets, jest)

**Primary Dependencies**: 신규 없음. 재사용하는 것: `hrSelfDataNotice.skillIdOf`·`withSelfDataNotice`, `helpers/chat/responses.writeResponseChunk`·`isResponseWritable`, `framer-motion`(위젯 기존 의존)

**Storage**: 없음(최종 답변 문자열을 기존 대화 기록에 저장)

**Testing**:
- jest: `server/utils/chats/toolCalling/__tests__`, `server/__tests__/utils`, agent-skills
- okrservice widgets jest
- embed E2E, 견고성 세트

**Target Platform**: teamplgpt 서버의 tool 루프(채팅·위젯·API), okrservice 위젯

**Project Type**: 웹 서비스(fork 전용 채팅 계층) + 위젯 프론트엔드

**Performance Goals**: 블록이 있는 답변은 모델 문장(1~2문장)을 다 받은 뒤 한 번에 표시한다. 체감 대기는 기존 스트리밍 완료 시점과 비슷하거나 짧아야 한다(문장이 짧아지므로).

**Constraints**:
- 표 블록은 글자 단위로 보존한다.
- 016·017 보호 규칙(거절, 내부값, 본인 사번 관문, 한국 시간)을 유지한다.
- 업스트림 파일은 수정하지 않는다(`loop.js`·`hrSelfDataNotice.js`·신규 util은 fork 전용).

**Scale/Scope**: teamplgpt 수정 약 5개(loop.js, 신규 util 1, overtimeStatus, 테스트), okrservice 2개 + 테스트, E2E 시나리오 갱신

## Constitution Check

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위 + 업스트림 발산 최소화 | PASS | 수정 대상(`toolCalling/loop.js`, `hrSelfDataNotice.js`, 신규 `hrTableBlocks.js`)은 모두 fork 전용이다(`git log --diff-filter=A` 확인: loop.js는 embed tool calling 기능으로 추가됨). aibitat(업스트림)은 수정하지 않는다(D9). |
| II. 스펙은 규모에 비례 | PASS | 3-Mode 횡단 + tool↔채팅 인터페이스 변경이라 트랙 5다. spec은 사용자 승인 완료. |
| III. E2E-First | PASS(계획) | tasks에서 표 글자 일치 기대값을 먼저 넣고 FAIL을 확인한 뒤 구현한다. |
| IV. Description-Driven + Multi-Layer | PASS | handler.js·plugin.json은 무수정이다(017 모듈 출력 정리만). L1 모델 지시(`[표 표시]`), L2 루프 조립·거르기, L3 E2E·견고성. |
| V. 3-Mode 일관성 | PASS(범위 명시) | chat/query·embed·API는 같은 루프로 적용된다. react는 HR tool이 없어 해당 없다. @agent는 D9로 제외하고 기존 동작 회귀만 확인한다. |
| VI. Conventional Commits | 해당 | `feat(hr-table-passthrough): …` |
| VII. i18n | 해당 없음 | 위젯 게이지 문구("시간 남음", "한도 … 중 … 사용")는 HR 한국어 데이터 표시라 기존 표와 같이 한국어 고정이다. okrservice i18n 사용 여부는 tasks에서 확인한다. |

Convention doc: plugin.json 무변경이라 T-A/T-B 해당이 없다.

**Phase 1 후 재확인**: 계약(final-answer, widget-limit-gauge)이 위 판정을 바꾸지 않는다. PASS.

## Project Structure

### Documentation

```text
specs/018-hr-table-passthrough/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/final-answer.md
├── contracts/widget-limit-gauge.md
└── tasks.md   # /speckit-tasks
```

### Source Code

```text
server/utils/
├── hrTableBlocks.js                          # 신규 — extractTableBlock, toModelResult, sanitizeModelText, joinFinalAnswer
├── hrSelfDataNotice.js                       # (필요 시) [표 표시] 줄 위치 조정만
└── chats/toolCalling/loop.js                 # 블록 수집 + 캡처 응답 + 최종 조립
server/__tests__/utils/hrTableBlocks.test.js  # 신규
server/utils/chats/toolCalling/__tests__/loop.test.js   # 시나리오 추가
server/storage/plugins/agent-skills/_shared/overtimeStatus.js   # D12 연 단위 표
server/scripts/e2e-embed-hr-skill/scenarios.json        # 표 글자 일치 기대값

/Users/shin-yeji/okrservice/widgets/client/messenger/components/chatbot/
├── markdownTableUtils.ts   # limitTableKind
├── MarkdownTable.tsx       # gauge·monthly 모드
└── __tests__/              # 게이지·월별 테스트
```

**Structure Decision**: 루프 안 로직은 최소화한다. 규칙(추출·거르기·조립)은 순수 함수 모듈 `hrTableBlocks.js`로 빼서 네트워크 없이 테스트한다. loop.js(439줄)는 "모으기·캡처·한 번에 쓰기"만 더한다.

## 위험

| 위험 | 대응 |
|---|---|
| 추출 규칙이 handler 출력 변화에 깨짐 | 골든 스냅샷 출력 전부(155개)를 추출기에 통과시키는 테스트를 둔다. 표가 있는 결과는 블록이 생기고, 지시 줄은 남지 않아야 한다. |
| 캡처 응답이 공급자 handleStream과 맞지 않음 | 공급자별 handleStream이 쓰는 멤버(write·on·removeListener·writable·writableEnded)만 위임한다. OpenAI·Anthropic 경로를 단위 테스트로 확인한다. 운영 공급자는 OpenAI. |
| 모델이 지시를 어겨 숫자 목록을 씀 | 거르기로 화면·기록에서 제거한다. 숫자 없는 목록은 남는다(R4 한계). 견고성 세트로 측정한다. |
| 블록이 길어 다음 질문의 대화 기록이 커짐 | 기존에도 모델이 표를 다시 써서 비슷한 길이였다. 모니터링만 한다. |
| 위젯이 오래된 버전이면 게이지 대신 일반 표 | 서버 출력은 표준 마크다운 표라 오래된 위젯에서도 정상 표로 보인다(하위 호환). |
