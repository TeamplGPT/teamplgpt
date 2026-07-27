# Quickstart: HR 조회 답변 품질 제어 — 검증 가이드

구현 완료 여부를 E2E로 증명하는 실행 절차. 계약 상세는
[contracts/footer-contract.md](./contracts/footer-contract.md) ·
[contracts/e2e-assertion-schema.md](./contracts/e2e-assertion-schema.md) 참조.

## 사전 조건

```bash
# 1) AnythingLLM 서버 기동 (리포 루트)
yarn dev:all          # :3001

# 2) mock HR API는 runner가 자동 기동 (:8000) — 별도 조치 불필요
```

## E2E-First 순서 (헌장 III)

```bash
# Step 1 — 시나리오 append 후, 구현 전 FAIL 확인 (신규 시나리오만 격리 실행)
npm run e2e:hr-skill -- --only=Q1,Q2,Q3,Q4
# 기대: 신규 전건 FAIL (echo/fan-out 미개선 상태 증명)

# Step 2 — 구현 (footer + description + runner) 후 재실행
npm run e2e:hr-skill -- --only=Q1,Q2,Q3,Q4
# 기대: 전건 PASS

# Step 3 — 회귀 확인 (tier 전건)
npm run e2e:hr-skill
# 기대: 기존 시나리오 포함 전건 PASS (FR-005 — 기존 판정 무영향)
```

시나리오 ID는 tasks 단계에서 확정 (Q*는 예시). 결과: `server/scripts/e2e-hr-skill/runs/{timestamp}/result.json`.

## 신규 시나리오 검증 포인트 (스토리 대응)

| 시나리오 | 질문 | 핵심 assertion | 스토리 |
|----------|------|----------------|--------|
| Q1 | "남은 연차 개수는?" | `answer_pattern: ["22"]`, `answer_not_pattern: ["배우자출산휴가", "총 \\d+건 조회됨", "\\[응답 지침\\]"]` | US1/AS1 |
| Q2 | "휴가 현황 전체 표로 보여줘" | `answer_pattern`: 표 행 다수(예: 유급휴가·배우자출산휴가 포함) | US1/AS2 (과억제 방지) |
| Q3 | "이번 달 지각 있어?" | `max_hr_calls: 1`, `mock_url_pattern: work_status 대상`, 답변에 지각 관련 표현 | US2/AS1 |
| Q4 | "이번 달 휴가 사용내역 알려줘" | `answer_pattern`: 사용내역 건 식별값 전건 포함 | US3/AS1 (과요약 방지) |

mock 데이터 값(잔여 22 등)은 `mock-hr-api.js` 픽스처 기준으로 tasks에서 확정.

## 수동 확인 (E2E 외 잔여면)

1. **@agent 모드 1회**: 워크스페이스 채팅에서 `@agent 남은 연차 개수는?` —
   값 중심 답변 + footer 문구 미노출 육안 확인 (research.md R4)
2. **0건 경로**: 데이터 없는 조회 — 기존 "조회 결과가 존재하지 않습니다" 문구 불변 (FR-007)

## 완료 판정 (verification-before-completion)

- [ ] 신규 시나리오: 구현 전 FAIL 로그 확보 → 구현 후 PASS
- [ ] tier 전건 PASS (기존 회귀 0건)
- [ ] @agent 모드 수동 1회 확인
- [ ] footer 문구가 답변에 노출된 사례 0건 (`answer_not_pattern` 상시 감시)
