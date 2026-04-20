# embed-tool-calling E2E runner

Verifies `embed-tool-calling-support` (Phase 1-2) via `POST /embed/:uuid/stream-chat`.

## Prerequisites

1. **AnythingLLM server running on :3001** — `yarn dev:all` (or `yarn dev:server`)
2. **Postgres container `anythingllm-postgres` healthy** — `docker ps`
3. **Phase 1-2 migration applied** — `embed_configs.allow_tool_calling` column exists
4. **LLM tool calling support** — current provider must support native tool calling (OpenAI, Anthropic, compatible OpenRouter models)
5. **HR agent skills active** — `hr-attendance`, `hr-salary`, `hr-personnel`, `hr-year-end-tax` must be imported and active

## Run

```bash
npm run e2e:embed-hr-skill
```

Timeout/port overrides:

```bash
E2E_TIMEOUT_MS=180000 MOCK_PORT=8001 npm run e2e:embed-hr-skill
E2E_WORKSPACE_ID=2 npm run e2e:embed-hr-skill   # pin to specific workspace
```

## Scenarios (22 total)

| Axis | Count | Purpose |
|------|-------|---------|
| **ALLOW** | 10 | `allow_tool_calling=true`, `allowed_skill_hashes=null` — all 4 HR skills should invoke |
| **DENY** | 5 | `allow_tool_calling=false` — no tool call should occur (RAG fallback) |
| **FILTER** | 7 | `allowed_skill_hashes` restricts which skills can be called |

Scenario IDs follow `EC-<AXIS>-<NN>` — see [`scenarios.json`](./scenarios.json).

## Output

- **Console**: per-axis grouped PASS/FAIL table + overall pass rate
- **`runs/<timestamp>/mock.jsonl`**: all mock HR API requests
- **`runs/<timestamp>/result.json`**: machine-readable (meta / runs[] / summary.byAxis)
- **Exit code**: `0` if all PASS, `1` otherwise

## Test Lifecycle

1. **Pre-cleanup**: `DELETE FROM embed_configs WHERE uuid LIKE 'e2e-embed-%'` — recovers from crashed runs
2. **Setup**: 4 test embed_configs inserted with prefix `e2e-embed-` (ALLOW-all, DENY, FILTER-attendance, FILTER-salary-personnel)
3. **Run**: each scenario POSTs to `/embed/<uuid>/stream-chat` with a fresh `sessionId`
4. **Teardown** (`finally`): `cleanupEmbedConfigs()` removes all `e2e-embed-*` configs

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_SERVER_URL` | `http://localhost:3001` | AnythingLLM base URL |
| `E2E_PG_CONTAINER` | `anythingllm-postgres` | Docker container name for psql |
| `E2E_PG_USER` | `anythingllm` | Postgres user |
| `E2E_PG_DB` | `anythingllm` | Postgres database |
| `MOCK_PORT` | `8001` | Mock HR API port (different from `:8000` used by `e2e-hr-skill`) |
| `E2E_TIMEOUT_MS` | `240000` | HTTP request timeout |
| `E2E_WORKSPACE_ID` | first workspace | embed_config's workspace_id |
| `E2E_EMBED_SCENARIOS_PATH` | `./scenarios.json` | scenario file path |

## Adding Scenarios

Schema (see [design §3.1](../../../docs/02-design/features/embed-tool-calling-e2e-runner.design.md#31-entity-definition)):

```json
{
  "id": "EC-ALLOW-11",
  "axis": "ALLOW",
  "label": "short description",
  "embed_config": "e2e-embed-allow-all",
  "message": "natural language query (no @agent prefix)",
  "expect": {
    "tool_call": true,
    "mock_url_pattern": "^/api/v1/...(\\?.*)?$"
  },
  "repeat": 1
}
```

**Notes**:
- `embed_config` must match one of the `CONFIGS[]` entries in `runner.js`
- For FILTER-block cases: `expect.tool_call: false` (no `mock_url_pattern`)
- `repeat` caps at 20

## Regression — does not affect `e2e-hr-skill`

This runner is an **independent fork**. It shares only `mock-hr-api.js` (via symlink). `e2e-hr-skill` uses `MOCK_PORT=8000` (default) while this runner uses `MOCK_PORT=8001`, so both can be run sequentially without state conflict.

## Known Limitation (2026-04-20 initial Do-phase run)

**Current pass pattern**: DENY 5/5 (100%), ALLOW 0/10 (0%), FILTER 3/7 (43%, block cases only).

**Root cause** (verified via instrumented debug logging):
- Phase 1-2 code is correct — tools ARE passed (`allTools=4, filtered=4`), `applyAllowedHashes` filters properly, `allow_tool_calling` gate works.
- gpt-5-mini with RAG context chooses **text answer over tool calls**. Even with a dedicated test workspace (no vectors), the LLM still receives 1 merged-shared pinned doc and prefers it.
- DENY passes because tools=null forces text fallback (gate works correctly).
- FILTER-block passes vacuously (blocked skill → tools array empty → text fallback, same as DENY).
- ALLOW and FILTER-allow require the LLM to **prefer** tools over text — behavior not guaranteed without `tool_choice="required"` injection.

**Next-phase remediation options**:
1. Inject `tool_choice: "required"` when test config sets a marker flag (embed.js change).
2. Add `E2E_FORCE_TOOL_CALL` env to runner that passes a `tool_choice` override in request body.
3. Accept DENY/FILTER-block as the primary Phase 1-2 verification; use Phase 3 (observability) to instrument tool-call attempts for ALLOW/FILTER-allow.

**What this test DOES verify today**:
- `allow_tool_calling=false` correctly suppresses tool definitions (DENY 100%)
- `allowed_skill_hashes` correctly blocks unauthorized skills (FILTER-block 100%)
- Embed config lifecycle (create/teardown) works
- Test workspace isolation helper works
- SSE parsing, mock HR API capture, result.json schema all function

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `embed_configs.allow_tool_calling column missing` | Phase 1-2 migration not applied | `cd server && npx prisma migrate deploy` |
| All ALLOW scenarios FAIL with `expected tool_call but LLM did not invoke` | LLM provider does not support tool calling | Switch to OpenAI/Anthropic in `.env` |
| `Container anythingllm-postgres is not running` | Postgres container stopped | Start via `docker compose up -d` or adjust `E2E_PG_CONTAINER` |
| FILTER-block scenario FAILs with tool call invoked | `allowed_skill_hashes` filter bypassed — possible regression | Check `server/utils/chats/embed.js#applyAllowedHashes` |
| All DENY scenarios FAIL with tool call invoked | `allow_tool_calling=false` branch bypassed — regression | Check `server/utils/chats/embed.js` `toolsEnabled` gate |

## References

- **Plan**: `docs/01-plan/features/embed-tool-calling-e2e-runner.plan.md`
- **Design**: `docs/02-design/features/embed-tool-calling-e2e-runner.design.md`
- **Phase 1-2 (archived)**: `docs/archive/2026-04/embed-tool-calling-support/`
- **Parent runner**: `server/scripts/e2e-hr-skill/README.md`
