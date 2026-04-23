# AGENTS.md — anything-llm 프로젝트 가이드

## HR Agent Skills — 필수 참조 Convention

HR agent-skill(`hr-attendance`, `hr-salary`, `hr-personnel`, `hr-year-end-tax`) 관련 피처를 **시작·수정·확장**할 때는 아래 Convention을 **반드시 먼저 참조**하세요:

- **`docs/conventions/hr-skill-description-pattern.md`** — `plugin.json` description 작성 표준

### 적용 대상 작업

| 작업 종류 | 참조 필요 섹션 |
|----------|---------------|
| 신규 HR skill 생성 | §3 T-B / §4 T-A Template + §7 3-Location 패턴 |
| 기존 HR skill에 **신규 주기 파라미터** 추가 (`*_date`, `*_month`, `*_year`, `from_*`, `to_*` 등) | §6.1 신규 파라미터 체크리스트 |
| 기존 HR skill의 **주기 파라미터 description 수정** | §6.2 회귀 검증 절차 |
| 신규 `query_type` 추가 + 자연어 매핑 | §7 Location A/B/C 3-Location 패턴 |
| 경계 키워드(2+ skill에 동일 단어) 추가 | §5 적용 현황 매트릭스 + 선행 Report `hr-all-skills-query-type-hint` §4 R-1/R-2/R-3 규칙 |

### 핵심 원칙 (요약)

1. **Period Parameter (주기 파라미터)는 `[CRITICAL]` 3단 + `[재강조]` 필수** — Template T-A(연·월 가변형) 또는 T-B(연도 단일형) 중 하나 적용
2. **handler.js는 무수정 원칙** — 모든 LLM 행태 제어는 `plugin.json` description으로
3. **E2E 회귀 검증 필수** — `npm run e2e:hr-skill` (scenarios.json `E1~E15`) 전건 PASS
4. **Convention doc 승격 조건**: 4 skill × 전 파라미터 검증 완료 상태 유지 (§5 매트릭스 Full 100%)

### PDCA 피처 시작 시 Plan 작성 체크리스트

- [ ] `docs/conventions/hr-skill-description-pattern.md` 읽기 완료
- [ ] Plan §1.3 Related Documents에 Convention doc 경로 명시
- [ ] Plan §7.2 Conventions to Define/Verify에서 T-A/T-B 적용 여부 확정
- [ ] 신규 주기 파라미터가 있다면 §6.1 체크리스트를 Plan FR에 포함

---

## PDCA Document Paths

| Phase | Path |
|-------|------|
| Plan | `docs/01-plan/features/{feature}.plan.md` |
| Design | `docs/02-design/features/{feature}.design.md` |
| Analysis | `docs/03-analysis/{feature}.analysis.md` |
| Report | `docs/04-report/features/{feature}.report.md` |
| Archive | `docs/archive/YYYY-MM/{feature}/` (4 문서 이관) |
| Convention (영구) | `docs/conventions/{name}.md` (archive 대상 아님) |

---

## E2E Test Infrastructure

- **Runner**: `server/scripts/e2e-hr-skill/runner.js`
- **Scenarios**: `server/scripts/e2e-hr-skill/scenarios.json`
- **Mock HR API**: `server/scripts/e2e-hr-skill/mock-hr-api.js` (runner가 자동 기동, `:8000`)
- **Execution**: `npm run e2e:hr-skill` (리포 루트에서, AnythingLLM 서버 `:3001` 사전 기동 필요: `yarn dev:all`)
- **Results**: `server/scripts/e2e-hr-skill/runs/{timestamp}/result.json`

---

## 3-Mode Chat Architecture (주의)

수정 시 3개 모드 모두 확인:

- **chat/query** 모드
- **react** 모드
- **@agent** 모드

자세한 내용은 `docs/rag-search-flow-chat-vs-react.md` 참조.
