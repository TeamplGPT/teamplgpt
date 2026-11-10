# 기준선 — Node 20 전환 직후, 회사 문서 기능 구현 전 (T001)

측정일: 2026-11-10. 서버·collector 모두 Node 20.20.2. 서버 포트 3101(3001은 다른 프로젝트 점유).

## Jest (server·collector)

```
npx jest server/__tests__ collector/__tests__ --testPathIgnorePatterns '/.worktrees/'
```

| 런타임 | passed | failed | 실패 스위트 |
|--------|--------|--------|-------------|
| Node 18.20.4 | 1757 | 100 | 17 |
| Node 20.20.2 | 1757 | 100 | 17 |

결과 동일 → Node 20 전환에 따른 회귀 없음. 실패 17개 스위트는 기존부터 있던 것
(hrHandlerHarness, hr-*-handler, vectorDb adjacentChunks, stream.react, hybrid-search e2e, whisper ffmpeg 등).

## embed E2E (`npm run e2e:embed-hr-skill`)

결과: `server/scripts/e2e-embed-hr-skill/runs/2026-11-10T01-47-22-496/result.json`

- 전체 88/93 (ALLOW 72/76, DENY 5/5, FILTER 11/12)
- 기존 실패 (회사 문서 기능과 무관, 회귀 판정에서 제외):
  - EC-FILTER-06 (1/1) — mock body에 `cmd=getSALSalaryDtstmnMgrList` 없음
  - EC-ALLOW-39 (1/1) — 표 행 패턴 불일치
  - EC-ALLOW-47 (3/3) — 날짜 "15일" 해석 실패 / 도구 미호출

회귀 판정: 구현 후 위 5건 외 실패가 생기면 회귀로 본다.

## 회사 문서 E2E (`e2e-embed-company-docs`) — 구현 전 FAIL 확인 (T007)

결과: `server/scripts/e2e-embed-company-docs/runs/2026-11-10T01-55-07-940Z/result.json`

- 0/9 PASS. 공통 문서 시드는 성공, embed 생성에서 `allow_company_documents` 컬럼 없음으로 준비 단계 실패 → 전건 FAIL (의도대로)

## 구현 후 회귀 (T048·T049, 2026-11-10, 로컬 임베더 multilingual-e5-small)

| 항목 | 기준선 | 구현 후 | 결과 파일 |
|------|--------|---------|-----------|
| `e2e:embed-company-docs` (CR-01~09) | 0/9 (FAIL 확인) | **9/9** (CR-01 10/10) | `server/scripts/e2e-embed-company-docs/runs/2026-11-10T03-00-24-514Z/result.json` |
| `e2e:embed-hr-skill` | 88/93 | 88/93 — 실패 동일(EC-FILTER-06, EC-ALLOW-39, EC-ALLOW-47) | `server/scripts/e2e-embed-hr-skill/runs/2026-11-10T02-53-38-020/result.json` |
| `e2e:hr-skill` | (미측정) | **122/122** | `server/scripts/e2e-hr-skill/runs/2026-11-10T03-03-54-913/result.json` |
| jest server·collector | 1757 pass / 100 fail / 17 suites | 1831 pass / 109 fail / 17 suites | — |

jest 실패 증가분(+9)은 기존 실패 스위트 안에서만 발생했다. 해당 스위트(hr-*-handler, hr-api-mock.integration, workspaceLlmMessageLogs, hybrid-search e2e, adjacentChunks, stream.react, work-hours, plugin-json-schema)는
이번 변경 파일을 하나도 import하지 않는다. `hr-api-mock.integration`은 단독 실행 시 12건, 전체 실행 시 6건 실패하는 등 실행 순서·날짜·로컬 DB 상태에 따라 수치가 흔들린다. 신규 테스트 63건(+collector HWP)은 전부 PASS.
okrservice 위젯 jest(chatbot): 38 PASS.
