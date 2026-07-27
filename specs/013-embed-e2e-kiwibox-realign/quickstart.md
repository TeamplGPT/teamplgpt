# Quickstart: embed E2E 재정렬 — 검증 가이드

## 사전 조건

```bash
yarn dev:all            # 또는 yarn dev:server (:3001)
# postgres 컨테이너 (anythingllm-postgres) 실행 중
# 포트 8001 비점유 (embed mock)
```

## E2E-First 순서 (헌장 III)

```bash
# Step 1 — 시나리오 재작성 직후, runner/mock 이식 전: FAIL 확인
npm run e2e:embed-hr-skill
# 기대: ALLOW/FILTER 허용측 전건 FAIL (구 /api/v1 필터가 .do 호출을 계수 못 함)
#       → 구 인프라 공백의 실측 증명

# Step 2 — runner 이식(.do 필터·mock 공유·assertion) 후: 전건 PASS
npm run e2e:embed-hr-skill

# Step 3 — hr-skill 스위트 회귀 (공유 mock 무변경 확인)
npm run e2e:hr-skill    # 기대: 50/50 유지 (FR-007)
```

## 잔재 0건 검증 (SC-002)

```bash
grep -c "api/v1\|사번" server/scripts/e2e-embed-hr-skill/scenarios.json   # 기대: 0
ls server/scripts/e2e-embed-hr-skill/mock-hr-api.js 2>&1                  # 기대: 없음
```

## 완료 판정

- [ ] Step 1 FAIL 로그 확보 (runs 경로 기록)
- [ ] embed 22건 전건 PASS — embed 면 최초 라이브 실측 (SC-001)
- [ ] hr-skill 50/50 유지 (SC-003)
- [ ] 잔재 grep 0건 + 중복 mock 삭제 (SC-002/SC-004)
- [ ] EC-ALLOW-03 답변에 fixture 값(22) 포함 — embed 경로 footer 소비 스모크 (R4)
