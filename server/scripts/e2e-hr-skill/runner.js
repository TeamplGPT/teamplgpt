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
      "x-tool-runtime-override-HR_API_BASE_URL": `http://localhost:${MOCK_PORT}`,
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
    await sleep(500);
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
  const relevantMock = mockEntries.filter((m) =>
    /^\/api\/v1\//.test(m.path || "")
  );
  const mockUrl =
    relevantMock.length > 0 ? relevantMock[relevantMock.length - 1].fullUrl : null;

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

  return {
    scenario: scenario.id,
    iteration,
    message: scenario.message,
    elapsedMs,
    toolCall,
    finalText,
    mockUrl,
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
