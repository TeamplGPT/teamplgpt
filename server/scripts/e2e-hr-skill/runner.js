/**
 * HR skill E2E runner.
 *
 * Runs every scenario in scenarios.json against the local AnythingLLM server,
 * captures tool-call invocations via SSE parsing, correlates them with Mock
 * HR API requests (mock.jsonl tail), and writes a human-readable table plus
 * a machine-readable result.json summary.
 *
 * Design: docs/02-design/features/hr-e2e-automation-script.design.md §4
 *
 * Usage:
 *   npm run e2e:hr-skill
 *   E2E_TIMEOUT_MS=180000 MOCK_PORT=8001 npm run e2e:hr-skill
 */

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, execFileSync, spawnSync } = require("child_process");

const { createDevApiKey, deleteDevApiKey } = require("./helpers/apikey");

const SCRIPT_DIR = __dirname;

const SERVER_URL = process.env.E2E_SERVER_URL || "http://localhost:3001";
const MOCK_PORT = Number.parseInt(process.env.MOCK_PORT || "8000", 10);
const TIMEOUT_MS = Number.parseInt(process.env.E2E_TIMEOUT_MS || "240000", 10);
const WORKSPACE = process.env.E2E_WORKSPACE_SLUG || "eshelsoft";
const SCENARIOS_PATH = path.resolve(
  SCRIPT_DIR,
  process.env.E2E_SCENARIOS_PATH || "./scenarios.json"
);
const PG_CONTAINER = process.env.E2E_PG_CONTAINER || "anythingllm-postgres";

// ─── Tier selection (hr-skill-synonym-coverage-matrix) ───────────────────────
const VALID_TIERS = ["primary", "full"];

function parseTierArg() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--tier=")) return a.slice("--tier=".length);
    if (a === "--tier" && argv[i + 1]) return argv[i + 1];
  }
  return null;
}

function resolveTier() {
  const tier = parseTierArg() || process.env.E2E_TIER || "primary";
  if (!VALID_TIERS.includes(tier)) {
    fatal(`Invalid tier "${tier}". Must be one of: ${VALID_TIERS.join(", ")}`);
  }
  return tier;
}

function applyTierFilter(scenarios, tier) {
  if (tier === "full") return scenarios.slice();
  return scenarios.filter((s) => !s.tier || s.tier === "primary");
}

function parseOnlyArg() {
  const argv = process.argv.slice(2);
  let raw = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--only=")) {
      raw = a.slice("--only=".length);
      break;
    }
    if (a === "--only" && argv[i + 1]) {
      raw = argv[i + 1];
      break;
    }
  }
  if (!raw && process.env.E2E_ONLY) raw = process.env.E2E_ONLY;
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function applyOnlyFilter(scenarios, onlyIds) {
  if (!onlyIds) return scenarios;
  const missing = [...onlyIds].filter(
    (id) => !scenarios.find((s) => s.id === id)
  );
  if (missing.length > 0) {
    fatal(
      `--only: unknown scenario id(s): ${missing.join(", ")} (tier filter may have excluded them — try --tier=full)`
    );
  }
  return scenarios.filter((s) => onlyIds.has(s.id));
}

const COLOR = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function fatal(msg) {
  process.stderr.write(`${COLOR.red}[fatal]${COLOR.reset} ${msg}\n`);
  process.exit(1);
}

function info(msg) {
  process.stdout.write(`${COLOR.cyan}[info]${COLOR.reset} ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`${COLOR.yellow}[warn]${COLOR.reset} ${msg}\n`);
}

// ─── Phase 0: load + validate scenarios ──────────────────────────────────────

function loadScenarios() {
  if (!fs.existsSync(SCENARIOS_PATH)) {
    fatal(`Scenarios file not found at ${SCENARIOS_PATH}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SCENARIOS_PATH, "utf8"));
  } catch (e) {
    fatal(`Invalid JSON in ${SCENARIOS_PATH}: ${e.message}`);
  }
  if (!raw || !Array.isArray(raw.scenarios) || raw.scenarios.length === 0) {
    fatal(`No scenarios found in ${SCENARIOS_PATH}`);
  }
  const ids = new Set();
  for (const s of raw.scenarios) {
    if (!s.id || !/^[A-Za-z0-9\-]+$/.test(s.id)) {
      fatal(`Invalid scenario id: ${JSON.stringify(s.id)}`);
    }
    if (ids.has(s.id)) fatal(`Duplicate scenario id: ${s.id}`);
    ids.add(s.id);
    if (typeof s.message !== "string" || s.message.length === 0) {
      fatal(`Scenario ${s.id}: message must be a non-empty string`);
    }
    if (!s.expect || typeof s.expect.tool_call !== "boolean") {
      fatal(`Scenario ${s.id}: expect.tool_call (boolean) required`);
    }
    if (
      s.expect.mock_url_pattern != null &&
      typeof s.expect.mock_url_pattern !== "string"
    ) {
      fatal(`Scenario ${s.id}: expect.mock_url_pattern must be string or null`);
    }
    if (s.expect.mock_url_pattern) {
      try {
        s._mockUrlRegex = new RegExp(s.expect.mock_url_pattern);
      } catch (e) {
        fatal(
          `Scenario ${s.id}: invalid regex "${s.expect.mock_url_pattern}": ${e.message}`
        );
      }
    }
    // kiwibox .do 계열: 파라미터가 POST body(urlencoded)에 있어 URL 대신 body를 검증
    if (s.expect.mock_body_pattern != null) {
      if (
        !Array.isArray(s.expect.mock_body_pattern) ||
        s.expect.mock_body_pattern.some((p) => typeof p !== "string")
      ) {
        fatal(`Scenario ${s.id}: expect.mock_body_pattern must be string[]`);
      }
      s._mockBodyRegexes = s.expect.mock_body_pattern.map((p) => {
        try {
          return new RegExp(p);
        } catch (e) {
          fatal(`Scenario ${s.id}: invalid body regex "${p}": ${e.message}`);
        }
      });
    }
    // 012-hr-answer-quality: 최종 답변 텍스트·HR 호출 건수 검증 (옵셔널 —
    // 미존재 시 스킵, 기존 시나리오 판정 무영향). contracts/e2e-assertion-schema.md
    for (const key of ["answer_pattern", "answer_not_pattern"]) {
      if (s.expect[key] == null) continue;
      if (
        !Array.isArray(s.expect[key]) ||
        s.expect[key].some((p) => typeof p !== "string")
      ) {
        fatal(`Scenario ${s.id}: expect.${key} must be string[]`);
      }
      const compiled = s.expect[key].map((p) => {
        try {
          return new RegExp(p);
        } catch (e) {
          fatal(`Scenario ${s.id}: invalid ${key} regex "${p}": ${e.message}`);
        }
      });
      if (key === "answer_pattern") s._answerRegexes = compiled;
      else s._answerNotRegexes = compiled;
    }
    if (s.expect.max_hr_calls != null) {
      if (!Number.isInteger(s.expect.max_hr_calls) || s.expect.max_hr_calls < 1) {
        fatal(`Scenario ${s.id}: expect.max_hr_calls must be an integer >= 1`);
      }
    }
    s.repeat = Number.isInteger(s.repeat) ? s.repeat : 1;
    if (s.repeat < 1 || s.repeat > 20) {
      fatal(`Scenario ${s.id}: repeat must be 1..20`);
    }
    s.pre_reset = s.pre_reset !== false;
  }
  return raw.scenarios;
}

// ─── Phase 1: runs/ directory ────────────────────────────────────────────────

function makeRunDir() {
  const iso = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  const dir = path.join(SCRIPT_DIR, "runs", iso);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Phase 2: health check ───────────────────────────────────────────────────

function httpRequest({ hostname, port, path: p, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname, port, path: p, method, headers: headers || {} },
      (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c.toString("utf8");
        });
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    if (body) req.write(body);
    req.end();
  });
}

async function healthCheck() {
  const u = new URL(SERVER_URL);
  try {
    const { status } = await httpRequest({
      hostname: u.hostname,
      port: u.port || 80,
      path: "/api/ping",
      method: "GET",
    });
    if (status !== 200) {
      fatal(`Server ${SERVER_URL}/api/ping returned ${status}. Start with: yarn dev:all`);
    }
  } catch (e) {
    fatal(
      `Server not reachable at ${SERVER_URL} (${e.message}). Start with: yarn dev:all`
    );
  }
  const docker = spawnSync(
    "docker",
    ["ps", "--filter", `name=^/${PG_CONTAINER}$`, "--format", "{{.Names}}"],
    { encoding: "utf8" }
  );
  if (docker.status !== 0 || !docker.stdout.trim()) {
    fatal(
      `Container ${PG_CONTAINER} is not running. Start it or set E2E_PG_CONTAINER.`
    );
  }
  info(`health check OK (server ${SERVER_URL}, container ${PG_CONTAINER})`);
}

// ─── Phase 3: spawn mock-hr-api ──────────────────────────────────────────────

async function spawnMock(runDir) {
  const mockLogPath = path.join(runDir, "mock.jsonl");
  const mockPath = path.join(SCRIPT_DIR, "mock-hr-api.js");
  const child = spawn(
    process.execPath,
    [mockPath, "--port", String(MOCK_PORT), "--log-path", mockLogPath],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  child.on("error", (e) => warn(`mock process error: ${e.message}`));

  // Wait for /health to become ready (max 5s)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const { status } = await httpRequest({
        hostname: "localhost",
        port: MOCK_PORT,
        path: "/health",
        method: "GET",
      });
      if (status === 200) {
        info(`mock-hr-api ready on :${MOCK_PORT}`);
        return { child, mockLogPath };
      }
    } catch (_) {
      /* not ready yet */
    }
    await sleep(200);
  }
  try {
    child.kill("SIGTERM");
  } catch (_) {}
  fatal(
    `Mock HR API did not become ready on :${MOCK_PORT} within 5s. Port conflict?`
  );
}

// ─── Phase 5: per-scenario run ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function streamChat(apiKey, body) {
  const u = new URL(SERVER_URL);
  const json = JSON.stringify(body);
  return httpRequest({
    hostname: u.hostname,
    port: u.port || 80,
    path: `/api/v1/workspace/${WORKSPACE}/stream-chat`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // 현행 kiwibox skill이 읽는 runtimeArgs 키로 override (hrSession.js).
      // 구 REST 시대 키(HR_API_BASE_URL)는 무효라 제거 — setup_args(plugin.json)
      // 무변경으로 mock 라우팅 (executor.js #mergeRuntimeOverrides 계약).
      "x-tool-runtime-override-HR_BASE_URL": `http://localhost:${MOCK_PORT}`,
      "x-tool-runtime-override-HR_SESSION_COOKIE": "JSESSIONID=E2E-MOCK",
      "x-tool-runtime-override-HR_STAFF_ID": "E2E001",
      "Content-Length": Buffer.byteLength(json),
    },
    body: json,
  });
}

function parseSSE(text) {
  const events = text.split("\n\n").filter((e) => e.startsWith("data:"));
  let toolCall = null;
  let finalText = null;
  for (const evt of events) {
    const m = evt.match(/^data:\s*(.*)$/m);
    if (!m) continue;
    let p;
    try {
      p = JSON.parse(m[1]);
    } catch (_) {
      continue;
    }
    const tr = p.textResponse;
    if (tr && tr.type === "toolCallInvocation" && typeof tr.content === "string") {
      const cm = tr.content.match(/^Assembling Tool Call: (.+)$/);
      if (cm) toolCall = cm[1];
    }
    // Top-level toolCallInvocation type (chat/query + embed paths via toolCallingLoop).
    // Introduced by hr-personnel-search-web-search-assist (2026-04-24) for E2E parity.
    if (p.type === "toolCallInvocation" && typeof p.content === "string") {
      const cm = p.content.match(/^Assembling Tool Call: (.+)$/);
      if (cm) toolCall = cm[1];
    }
    if (
      p.type === "finalizeResponseStream" &&
      typeof p.textResponse === "string"
    ) {
      finalText = p.textResponse;
    }
  }
  return { toolCall, finalText, eventCount: events.length };
}

function readMockLogTail(mockLogPath, sinceIso) {
  if (!fs.existsSync(mockLogPath)) return [];
  const content = fs.readFileSync(mockLogPath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const out = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!sinceIso || entry.ts >= sinceIso) out.push(entry);
    } catch (_) {
      /* skip malformed line */
    }
  }
  return out;
}

// mock 로그 body를 검증용 단일 문자열로 정규화.
// - { _raw: "a=1&b=2" } (urlencoded 원문) → URL 디코드된 "a=1&b=2"
// - 파싱된 객체 → "k=v&k2=v2" 직렬화
function mockBodyToString(body) {
  if (body == null) return null;
  if (typeof body === "object" && typeof body._raw === "string") {
    try {
      return decodeURIComponent(body._raw.replace(/\+/g, " "));
    } catch (_) {
      return body._raw;
    }
  }
  if (typeof body === "object") {
    return Object.entries(body)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
  }
  return String(body);
}

// 워크스페이스 chat log 물리 삭제 (docker psql — helpers/apikey.js와 동일 패턴).
// API 경로의 /reset은 workspace_chats를 지우지 않아(스레드 스코프) 직전 시나리오
// 답변(표 데이터)이 히스토리로 유입 → LLM이 tool-call을 생략하는 오염 발생
// (specs/012 T015에서 관측 — fixture 도입 전에는 빈 데이터라 무해했던 설계 공백).
function wipeWorkspaceChats() {
  execFileSync(
    "docker",
    [
      "exec",
      PG_CONTAINER,
      "psql",
      "-U",
      process.env.E2E_PG_USER || "anythingllm",
      "-d",
      process.env.E2E_PG_DB || "anythingllm",
      "-tA",
      "-c",
      `DELETE FROM workspace_chats WHERE "workspaceId" = (SELECT id FROM workspaces WHERE slug = '${WORKSPACE.replace(/'/g, "''")}');`,
    ],
    { encoding: "utf8" }
  );
}

// wipe 후 히스토리가 실제로 비었는지 폴링 (최대 5s).
async function waitForEmptyHistory(apiKey) {
  const u = new URL(SERVER_URL);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await httpRequest({
        hostname: u.hostname,
        port: u.port || 80,
        path: `/api/v1/workspace/${WORKSPACE}/chats`,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (status === 200) {
        const parsed = JSON.parse(body);
        const hist = parsed.history || parsed.chats || [];
        if (Array.isArray(hist) && hist.length === 0) return true;
      }
    } catch (_) {
      /* retry until deadline */
    }
    await sleep(300);
  }
  return false;
}

async function runScenarioOnce(scenario, iteration, apiKey, mockLogPath) {
  if (scenario.pre_reset) {
    try {
      await streamChat(apiKey, {
        message: "/reset",
        mode: "chat",
        attachments: [],
      });
    } catch (e) {
      warn(`${scenario.id}-${iteration}: /reset failed: ${e.message}`);
    }
    try {
      wipeWorkspaceChats();
    } catch (e) {
      warn(`${scenario.id}-${iteration}: chat wipe failed: ${e.message}`);
    }
    const cleared = await waitForEmptyHistory(apiKey);
    if (!cleared) {
      warn(
        `${scenario.id}-${iteration}: chat history not empty after /reset+wipe (5s) — possible contamination`
      );
    }
  }
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let body = "";
  let errorMsg = null;
  try {
    const res = await streamChat(apiKey, {
      message: scenario.message,
      mode: "chat",
      attachments: [],
    });
    body = res.body;
  } catch (e) {
    errorMsg = e.message;
  }
  const elapsedMs = Date.now() - t0;
  const { toolCall, finalText, eventCount } = parseSSE(body);

  const mockEntries = readMockLogTail(mockLogPath, startedAt);
  // 현행 kiwibox(*.do)만 대조 대상 (구세대 REST /api/v1/* 잔재 제거 —
  // backup 방식 폐기 이후 유효 호출은 .do뿐, hrCallCount 계수 대상도 동일)
  const relevantMock = mockEntries.filter((m) => /\.do$/.test(m.path || ""));
  const mockUrl =
    relevantMock.length > 0 ? relevantMock[relevantMock.length - 1].fullUrl : null;
  const mockBody =
    relevantMock.length > 0
      ? mockBodyToString(relevantMock[relevantMock.length - 1].body)
      : null;

  const asked =
    !toolCall && finalText ? /연도|년/.test(finalText) : false;

  let pass = true;
  let reason = null;
  if (errorMsg) {
    pass = false;
    reason = `request error: ${errorMsg}`;
  } else if (scenario.expect.tool_call && !toolCall) {
    pass = false;
    reason = "expected tool_call but LLM did not invoke any tool";
  } else if (!scenario.expect.tool_call && toolCall) {
    pass = false;
    reason = "expected no tool_call but LLM invoked one";
  } else if (scenario._mockUrlRegex) {
    if (!mockUrl) {
      pass = false;
      reason = "no mock URL captured (timing or tool-call non-HTTP)";
    } else if (!scenario._mockUrlRegex.test(mockUrl)) {
      pass = false;
      reason = `mock URL did not match pattern ${scenario.expect.mock_url_pattern}`;
    }
  }
  // body 검증 (kiwibox urlencoded 필수 파라미터 — 전 패턴 매칭 필요)
  if (pass && scenario._mockBodyRegexes) {
    if (mockBody == null) {
      pass = false;
      reason = "no mock body captured";
    } else {
      const missed = scenario.expect.mock_body_pattern.filter(
        (p, i) => !scenario._mockBodyRegexes[i].test(mockBody)
      );
      if (missed.length > 0) {
        pass = false;
        reason = `mock body missing pattern(s): ${missed.join(" | ")}`;
      }
    }
  }
  // 012-hr-answer-quality: 최종 답변 검증 — 판정 4~7 (기존 체인 뒤 순차).
  // contracts/e2e-assertion-schema.md
  if (pass && (scenario._answerRegexes || scenario._answerNotRegexes)) {
    if (finalText == null) {
      pass = false;
      reason = "no final answer captured";
    }
  }
  if (pass && scenario._answerRegexes) {
    const missed = scenario.expect.answer_pattern.filter(
      (p, i) => !scenario._answerRegexes[i].test(finalText)
    );
    if (missed.length > 0) {
      pass = false;
      reason = `answer missing pattern(s): ${missed.join(" | ")}`;
    }
  }
  if (pass && scenario._answerNotRegexes) {
    const hit = scenario.expect.answer_not_pattern.filter((p, i) =>
      scenario._answerNotRegexes[i].test(finalText)
    );
    if (hit.length > 0) {
      pass = false;
      reason = `answer contains forbidden pattern(s): ${hit.join(" | ")}`;
    }
  }
  if (
    pass &&
    scenario.expect.max_hr_calls != null &&
    relevantMock.length > scenario.expect.max_hr_calls
  ) {
    pass = false;
    reason = `hr calls ${relevantMock.length} exceeded max ${scenario.expect.max_hr_calls}`;
  }

  return {
    scenario: scenario.id,
    iteration,
    message: scenario.message,
    elapsedMs,
    toolCall,
    finalText,
    mockUrl,
    mockBody,
    hrCallCount: relevantMock.length,
    asked,
    eventCount,
    pass,
    reason,
  };
}

// ─── console formatting ──────────────────────────────────────────────────────

function printRunLine(run) {
  const pad = (s, n) => String(s).padEnd(n);
  const label = `${run.scenario}${run.iteration > 1 ? `-${run.iteration}` : ""}`;
  const elapsed = `${String(run.elapsedMs).padStart(6)}ms`;
  const tool = run.toolCall ? "YES" : "NO ";
  const ask = run.asked ? "YES" : "NO ";
  const status = run.pass
    ? `${COLOR.green}PASS${COLOR.reset}`
    : `${COLOR.red}FAIL${COLOR.reset}`;
  const detail = run.toolCall
    ? run.toolCall.slice(0, 80)
    : run.finalText
    ? `(${run.finalText.slice(0, 80).replace(/\s+/g, " ")})`
    : "(no response)";
  console.log(
    `${pad(label, 6)} | elapsed ${elapsed} | tool=${tool} | ask=${ask} | ${status} | ${detail}`
  );
}

function buildSummary(runs) {
  const perScenario = {};
  for (const r of runs) {
    const s = (perScenario[r.scenario] = perScenario[r.scenario] || {
      total: 0,
      pass: 0,
      toolCalls: 0,
      asks: 0,
    });
    s.total++;
    if (r.pass) s.pass++;
    if (r.toolCall) s.toolCalls++;
    if (r.asked) s.asks++;
  }
  const summary = {};
  for (const id of Object.keys(perScenario)) {
    const s = perScenario[id];
    summary[id] = {
      total: s.total,
      pass: s.pass,
      toolCallRate: `${s.toolCalls}/${s.total}`,
      askRate: `${s.asks}/${s.total}`,
    };
  }
  const total = runs.length;
  const passCount = runs.filter((r) => r.pass).length;
  return {
    perScenario: summary,
    overall: {
      total,
      pass: passCount,
      fail: total - passCount,
      passRate: `${passCount}/${total} (${
        total ? ((passCount / total) * 100).toFixed(1) : "0.0"
      }%)`,
    },
  };
}

function printSummary(summary) {
  console.log("");
  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");
  for (const id of Object.keys(summary.perScenario)) {
    const s = summary.perScenario[id];
    console.log(
      `${id}: tool-call ${s.toolCallRate} | 되묻기 ${s.askRate} | pass ${s.pass}/${s.total}`
    );
  }
  console.log("");
  console.log(`Overall: ${summary.overall.passRate}`);
  console.log("========================================");
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (_) {
    return null;
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const rawScenarios = loadScenarios();
  const tier = resolveTier();
  const onlyIds = parseOnlyArg();
  const tierFiltered = applyTierFilter(rawScenarios, tier);
  const scenarios = applyOnlyFilter(tierFiltered, onlyIds);
  info(
    `tier="${tier}"${onlyIds ? `, --only=${[...onlyIds].join(",")}` : ""}, ${scenarios.length}/${rawScenarios.length} scenarios after filter (${scenarios.reduce(
      (n, s) => n + s.repeat,
      0
    )} total runs)`
  );

  const runDir = makeRunDir();
  info(`run dir: ${path.relative(process.cwd(), runDir)}`);

  await healthCheck();

  const { child: mockChild, mockLogPath } = await spawnMock(runDir);

  let apiKey = null;
  let apiKeyId = null;
  const runs = [];
  const meta = {
    feature: "hr-e2e-automation-script",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    appliedTier: tier,
    totalAvailable: rawScenarios.length,
    scenariosCount: scenarios.length,
    totalRuns: scenarios.reduce((n, s) => n + s.repeat, 0),
    serverUrl: SERVER_URL,
    mockPort: MOCK_PORT,
    workspace: WORKSPACE,
    gitHead: gitHead(),
  };

  try {
    const key = await createDevApiKey();
    apiKey = key.secret;
    apiKeyId = key.id;
    info(`dev API key created (id=${apiKeyId})`);

    console.log("");
    console.log("========================================");
    console.log(`  hr-e2e-automation-script — ${meta.startedAt}`);
    console.log("========================================");

    const t0 = Date.now();
    for (const scenario of scenarios) {
      for (let i = 1; i <= scenario.repeat; i++) {
        const run = await runScenarioOnce(scenario, i, apiKey, mockLogPath);
        runs.push(run);
        printRunLine(run);
        if (i < scenario.repeat || scenario !== scenarios[scenarios.length - 1]) {
          await sleep(1500);
        }
      }
    }
    meta.finishedAt = new Date().toISOString();
    meta.durationMs = Date.now() - t0;

    const summary = buildSummary(runs);
    printSummary(summary);

    const resultPath = path.join(runDir, "result.json");
    fs.writeFileSync(
      resultPath,
      JSON.stringify({ meta, runs, summary }, null, 2)
    );
    info(`result written: ${path.relative(process.cwd(), resultPath)}`);

    process.exitCode = summary.overall.fail === 0 ? 0 : 1;
  } finally {
    if (apiKey) {
      try {
        await deleteDevApiKey(apiKey);
        info(`dev API key deleted (id=${apiKeyId})`);
      } catch (e) {
        warn(`API key DELETE failed: ${e.message}`);
      }
    }
    if (mockChild && !mockChild.killed) {
      try {
        mockChild.kill("SIGTERM");
        await sleep(500);
        if (!mockChild.killed) mockChild.kill("SIGKILL");
      } catch (e) {
        warn(`mock kill failed: ${e.message}`);
      }
    }
    info("cleanup complete");
  }
}

main().catch((e) => {
  process.stderr.write(`${COLOR.red}[fatal]${COLOR.reset} ${e.stack || e.message}\n`);
  process.exit(1);
});
