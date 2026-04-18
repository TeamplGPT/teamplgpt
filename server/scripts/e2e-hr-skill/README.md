# HR Skill E2E 자동화 스크립트

HR agent skill의 description/파라미터 변경 시 LLM 호출 결과를 빠르게 검증하기 위한 로컬 E2E 테스트 도구.

## 개요

- `scenarios.json`에 정의된 5종 질의를 AnythingLLM 서버(`http://localhost:3001`)에 차례로 보낸다
- 각 질의 전에 `/reset`으로 chat history를 격리한다
- LLM이 호출하는 HR API는 **Mock 서버**(`localhost:8000`)가 받아서 `data:[]`만 반환한다
- Mock 서버의 요청 로그(JSON Lines)와 SSE의 `toolCallInvocation`을 대조해 각 시나리오의 PASS/FAIL을 판정한다
- 결과는 사람용 table + 기계용 `result.json`으로 남긴다

## 전제조건

| 항목 | 확인 방법 |
|------|----------|
| AnythingLLM 서버 가동 | `curl http://localhost:3001/api/ping` → 200 |
| `yarn dev:all` 또는 `yarn dev:server` 실행 중 | 프로세스 모니터 |
| Postgres 컨테이너 healthy | `docker ps --filter name=anythingllm-postgres` |
| 테스트 워크스페이스 존재 (`eshelsoft` 또는 env override) | UI로 생성 완료 |
| 포트 8000 점유 없음 (또는 `MOCK_PORT` override) | `lsof -i :8000` |

## 실행

```bash
# 기본 (리포 루트에서)
npm run e2e:hr-skill

# 환경 변수 override
MOCK_PORT=8001 E2E_TIMEOUT_MS=180000 npm run e2e:hr-skill
```

## 환경 변수

| 이름 | 기본값 | 용도 |
|------|--------|------|
| `MOCK_PORT` | `8000` | Mock HR API 포트 |
| `E2E_TIMEOUT_MS` | `240000` | SSE 1회 요청 timeout |
| `E2E_WORKSPACE_SLUG` | `eshelsoft` | 테스트 워크스페이스 slug |
| `E2E_SERVER_URL` | `http://localhost:3001` | AnythingLLM 서버 base URL |
| `E2E_SCENARIOS_PATH` | `./scenarios.json` | 시나리오 파일 경로 |
| `E2E_PG_CONTAINER` | `anythingllm-postgres` | Postgres 컨테이너 이름 |

## 출력

실행 시 `runs/{timestamp}/` 디렉토리에 아래 파일이 생성된다:

```
runs/2026-04-18T08-30-00/
├── mock.jsonl    ← Mock HR API의 모든 요청 (JSON Lines)
└── result.json   ← 시나리오별 결과 + 요약 (meta, runs[], summary)
```

사람용 출력 예시:

```
========================================
  hr-e2e-automation-script — 2026-04-18T08:30:00.000Z
========================================
E1     | elapsed  42100ms | tool=YES | ask=NO  | PASS | hr-salary({"year_month":"202503"})
E2     | elapsed  38500ms | tool=YES | ask=NO  | PASS | hr-attendance({"year_month":"202603"})
E3-1   | elapsed  12300ms | tool=NO  | ask=YES | FAIL | (되묻기: 조회할 연도를 알려주십시오...)
E3-2   | elapsed  41200ms | tool=YES | ask=NO  | PASS | hr-attendance({"year_month":"3"})
...

========================================
SUMMARY
========================================
E1: tool-call 1/1 | 되묻기 0/1 | pass 1/1
E3: tool-call 4/5 | 되묻기 1/5 | pass 4/5
Overall: 7/9 (77.8%)
```

## 판정 기준

| 조건 | PASS/FAIL |
|------|:---------:|
| `expect.tool_call=true` 이고 tool-call 발생 | PASS (mock_url 조건 추가 검증) |
| `expect.tool_call=true` 이나 tool-call 없음 (되묻기 등) | FAIL |
| `expect.mock_url_pattern` 정규식이 Mock 로그의 최근 URL과 매칭 | PASS |
| `expect.mock_url_pattern`이 `null` | URL 검증 skip, tool_call만 확인 |
| 요청 timeout | FAIL (해당 run만, 다음 시나리오는 계속 진행) |

Exit code: 전원 PASS면 `0`, 하나라도 FAIL이면 `1`.

## 새 시나리오 추가

`scenarios.json`의 `scenarios` 배열에 객체 하나 append:

```json
{
  "id": "E6",
  "label": "연말정산 과거 연도",
  "message": "@agent 사번 20070133 직원의 2023년 연말정산 결과 조회해줘",
  "expect": {
    "tool_call": true,
    "mock_url_pattern": "^/api/v1/.*year.*2023"
  },
  "repeat": 1,
  "pre_reset": true
}
```

필드 설명:

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | string | ✅ | - | `^[A-Z0-9\-]+$` |
| `label` | string | - | - | 사람 판독용 라벨 |
| `message` | string | ✅ | - | LLM에 보낼 질의 |
| `expect.tool_call` | boolean | ✅ | - | tool-call 발생 기대 여부 |
| `expect.mock_url_pattern` | string\|null | - | `null` | Mock URL 매칭 정규식 |
| `repeat` | number | - | `1` | 반복 횟수 (1~20) |
| `pre_reset` | boolean | - | `true` | 직전 `/reset` 수행 |

## FAQ

| Q | A |
|---|---|
| 실제 HR API를 호출해서 테스트하나? | 아니요. `localhost:8000` Mock만. 실서버 호출은 out of scope |
| dev API key는 안전한가? | prefix `E2E-DEV-` 고정, finally에서 DELETE 보장, 메모리 변수로만 전달 |
| 세션 간 결과 비교는? | `runs/` 디렉토리의 `result.json`이 영구 보존됨 (gitignore) |
| LLM 응답의 자연어 품질도 평가하나? | 아니요. tool-call args와 Mock URL만 검증 |

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `Server not reachable at http://localhost:3001` | `yarn dev:all` 실행 확인 |
| `Container anythingllm-postgres is not running` | `docker ps` 확인, 필요시 재기동 |
| `Mock HR API did not become ready on :8000` | 포트 점유 확인 (`lsof -i :8000`), `MOCK_PORT` env로 override |
| `Invalid regex in scenario Ex` | `scenarios.json`의 해당 `mock_url_pattern` 문법 확인 (JSON 이스케이프 `\\d`) |
| SSE timeout (240s 초과) | `E2E_TIMEOUT_MS`로 override, LLM 모델/서버 상태 점검 |
| Postgres `api_keys` INSERT 실패 | 스키마 마이그레이션 최신 상태 확인 (`npx prisma migrate deploy`) |

## 관련 문서

- Plan: `docs/01-plan/features/hr-e2e-automation-script.plan.md`
- Design: `docs/02-design/features/hr-e2e-automation-script.design.md`
- 직전 피처 (E2E 자동화 최초 구성): `docs/archive/2026-04/hr-year-month-past-year-fix/`
- 직전 피처 (패턴 재사용): `docs/archive/2026-04/hr-month-only-silent-pass/`
