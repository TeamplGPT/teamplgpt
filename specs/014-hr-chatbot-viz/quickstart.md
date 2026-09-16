# Quickstart: HR 챗봇 시각화 검증

## 사전 준비

- teamplgpt: `yarn dev:all`(서버 :3001 + mock 없이 실 kiwibox 세션 사용 시) 또는 `npm run e2e:hr-skill` / `npm run e2e:embed-hr-skill`(mock 기반, Docker postgres 기동 필요: `docker start anythingllm-postgres`).
- okrservice: `yarn dev`(widgets) 로 로컬 위젯 서버 기동, 실제 HR 챗봇이 붙은 워크스페이스로 접속.
- 두 저장소 모두 `feature/skill-modify-hrchat-merge` 브랜치.

## 시나리오 1 — E2E(자동, teamplgpt만)

`server/scripts/e2e-hr-skill/scenarios.json`에 추가된 시각화 요청 시나리오(예: `K6x`)를 실행:

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" npm run e2e:hr-skill -- --only=K6x,K6y,K6z
```

**기대 결과**: tool_call은 기존과 동일(`work_status`/`salary_statement`/`org_members`)하게 발생하고, 최종 응답 텍스트 안에 ` ```viz ` 코드블록이 정확히 1개 포함되며 `contracts/viz-block.schema.md`의 스키마를 만족한다. 시각화를 요청하지 않은 기존 시나리오들은 `viz` 블록이 없어야 한다(회귀 없음, SC-002).

embed 경로도 동일하게 `npm run e2e:embed-hr-skill -- --only=EC-VIZ-*`로 확인한다.

## 시나리오 2 — 실제 위젯 데모(수동, 2-repo)

1. okrservice 위젯에서 HR 챗봇을 연다.
2. "이번 달 근무현황 그래프로 보여줘" 입력 → 막대 그래프가 렌더링되는지 육안 확인.
3. "최근 급여 추세 그래프로 보여줘" 입력 → 선 그래프 렌더링 확인.
4. "우리 팀 팀원 목록을 조직도로 보여줘" 입력 → 팀 루트 + 구성원 1단계 트리 다이어그램 렌더링 확인. ("조직도"만 단독으로 말하면 기존 라우팅상 `org_tree`(부서 코드 트리)로 갈 수 있음 — spec.md User Story 3 참고)
5. (회귀) "이번 달 근무현황 알려줘"(그래프 미언급) 입력 → 기존과 동일하게 텍스트/표만 나오고 그래프가 뜨지 않는지 확인.

**기대 결과**: SC-001(추가 안내 없이 한 번의 응답 안에 시각화 표시), SC-002(회귀 없음), SC-003(오류 화면 없음)을 육안으로 확인. 데이터가 없는 달을 대상으로도 1회 시도해 "표시할 데이터가 없습니다" 안내가 뜨는지 확인(엣지 케이스).

## 시나리오 3 — 렌더러 유닛 테스트(자동, okrservice만)

```bash
cd widgets && yarn jest chatbot/__tests__/vizRenderers.test.ts
```

**기대 결과**: `contracts/viz-block.schema.md`의 3개 예시 JSON을 입력으로 각 렌더 함수가 예상되는 Mermaid 문자열/Chart.js config 형태를 반환하고, 스키마를 벗어난 입력(필드 누락·타입 불일치)에 대해서는 폴백 신호(예: `null` 반환 또는 `ok:false`)를 반환하는지 검증한다.
