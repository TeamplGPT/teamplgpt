/**
 * Embed tool calling E2E runner.
 *
 * Forked from ../e2e-hr-skill/runner.js with three adaptations:
 *   1. Target endpoint: POST /embed/:uuid/stream-chat (no API key, UUID-routed).
 *   2. Lifecycle: creates/deletes test embed_configs rows via helpers/embedconfig.js.
 *   3. 3-axis scenarios: scenarios.json adds `axis` and `embed_config` fields,
 *      assertions branch per axis (ALLOW / DENY / FILTER).
 *
 * Design: docs/02-design/features/embed-tool-calling-e2e-runner.design.md — 유실(docs/ gitignore).
 *         현행 정본: specs/013-embed-e2e-kiwibox-realign/
 *
 * Usage:
 *   npm run e2e:embed-hr-skill
 *   E2E_TIMEOUT_MS=180000 MOCK_PORT=8001 npm run e2e:embed-hr-skill
 *   E2E_WORKSPACE_ID=1 npm run e2e:embed-hr-skill
 *
 * Prerequisites:
 *   - AnythingLLM server running on :3001 (`yarn dev:all`)
 *   - Postgres container `anythingllm-postgres` healthy
 *   - Phase 1-2 migration applied (embed_configs.allow_tool_calling column exists)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, execFileSync, spawnSync } = require("child_process");

const {
  resolveWorkspaceId,
  createTestWorkspace,
  cleanupTestWorkspaces,
  createEmbedConfig,
  cleanupEmbedConfigs,
} = require("./helpers/embedconfig");

const SCRIPT_DIR = __dirname;

const SERVER_URL = process.env.E2E_SERVER_URL || "http://localhost:3001";
const MOCK_PORT = Number.parseInt(process.env.MOCK_PORT || "8001", 10);
const TIMEOUT_MS = Number.parseInt(process.env.E2E_TIMEOUT_MS || "240000", 10);
const SCENARIOS_PATH = path.resolve(
  SCRIPT_DIR,
  process.env.E2E_EMBED_SCENARIOS_PATH || "./scenarios.json"
);
const PG_CONTAINER = process.env.E2E_PG_CONTAINER || "anythingllm-postgres";
const WORKSPACE_ID_ENV = process.env.E2E_WORKSPACE_ID || "";

const VALID_AXES = ["ALLOW", "DENY", "FILTER"];

// Tool-friendly system prompt override.
// The Eshelsoft workspace's production prompt restricts LLM to document-only
// answers, which causes it to refuse tool calls. Override with a prompt that
// explicitly encourages HR tool usage when tools are available.
const TOOL_FRIENDLY_PROMPT =
  "당신은 HR 데이터를 조회하는 챗봇입니다. " +
  "사용자가 근태/급여/인사/연말정산 관련 데이터를 요청하면, " +
  "사용 가능한 tool(hr-attendance, hr-salary, hr-personnel, hr-year-end-tax)을 " +
  "즉시 호출해서 응답하세요. tool이 없거나 호출이 허용되지 않으면 일반 답변을 하세요. " +
  "사번(emp_no)이 사용자 발화에 명시되어 있으면 그대로 전달하세요.";

// Test embed_config specs. Keys MUST match scenarios.json `embed_config` field.
const CONFIGS = [
  {
    name: "e2e-embed-allow-all",
    allowToolCalling: true,
    allowedSkillHashes: null,
  },
  {
    name: "e2e-embed-deny",
    allowToolCalling: false,
    allowedSkillHashes: null,
  },
  {
    name: "e2e-embed-filter-attendance",
    allowToolCalling: true,
    allowedSkillHashes: "hr-attendance",
  },
  {
    name: "e2e-embed-filter-salary-personnel",
    allowToolCalling: true,
    allowedSkillHashes: "hr-salary,hr-personnel",
  },
];

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

  const validConfigNames = new Set(CONFIGS.map((c) => c.name));
  const ids = new Set();
  for (const s of raw.scenarios) {
    if (!s.id || !/^EC-[A-Z]+-\d{2}$/.test(s.id)) {
      fatal(`Invalid scenario id: ${JSON.stringify(s.id)} (expected EC-AXIS-NN)`);
    }
    if (ids.has(s.id)) fatal(`Duplicate scenario id: ${s.id}`);
    ids.add(s.id);
    if (!VALID_AXES.includes(s.axis)) {
      fatal(`Scenario ${s.id}: axis must be one of ${VALID_AXES.join(", ")}`);
    }
    if (!validConfigNames.has(s.embed_config)) {
      fatal(
        `Scenario ${s.id}: embed_config "${s.embed_config}" not in CONFIGS. ` +
          `Valid: ${[...validConfigNames].join(", ")}`
      );
    }
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
    // kiwibox POST body 검증 (specs/013 — hr-skill runner와 동일 계약)
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
    // 최종 답변·HR 호출 건수 검증 (옵셔널 — specs/012 contracts/e2e-assertion-schema.md 준용)
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
      fatal(
        `Server ${SERVER_URL}/api/ping returned ${status}. Start with: yarn dev:all`
      );
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function spawnMock(runDir) {
  const mockLogPath = path.join(runDir, "mock.jsonl");
  // 공유 mock (specs/013 D2 — cmd 기반 fixture 포함, 중복 mock 제거)
  const mockPath = path.join(SCRIPT_DIR, "..", "e2e-hr-skill", "mock-hr-api.js");
  const child = spawn(
    process.execPath,
    [mockPath, "--port", String(MOCK_PORT), "--log-path", mockLogPath],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  child.on("error", (e) => warn(`mock process error: ${e.message}`));

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

// ─── Phase 4: setup embed configs ────────────────────────────────────────────

async function setupEmbedConfigs(workspaceId) {
  // Pre-cleanup in case a prior run crashed mid-way.
  try {
    const { deleted } = await cleanupEmbedConfigs();
    if (deleted > 0) info(`pre-cleanup removed ${deleted} stale embed config(s)`);
  } catch (e) {
    warn(`pre-cleanup failed (non-fatal): ${e.message}`);
  }

  const map = {};
  for (const spec of CONFIGS) {
    const { uuid, id } = await createEmbedConfig({
      name: spec.name,
      workspaceId,
      allowToolCalling: spec.allowToolCalling,
      allowedSkillHashes: spec.allowedSkillHashes,
    });
    map[spec.name] = { uuid, id };
    info(
      `embed_config created: ${spec.name} (id=${id}, uuid=${uuid.slice(0, 24)}…)`
    );
  }
  return map;
}

// ─── Phase 5: per-scenario run ───────────────────────────────────────────────

async function embedStreamChat(embedUuid, body) {
  const u = new URL(SERVER_URL);
  const json = JSON.stringify(body);
  return httpRequest({
    hostname: u.hostname,
    port: u.port || 80,
    path: `/api/embed/${embedUuid}/stream-chat`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(json),
      // Redirect HR skill HTTP target to the mock server spawned by this runner.
      // Server must be in NODE_ENV=development (or ALLOW_TOOL_RUNTIME_OVERRIDE=true) for this to take effect.
      // In production the header is silently ignored.
      // 현행 kiwibox skill이 읽는 runtimeArgs 키 3종 (hrSession.js 서버 폴백 계약).
      // 쿠키·스태프 더미가 없으면 hrSession이 "연동 미구성" 즉시 반환 → HTTP 미발생
      // → mock-hit 판정 불가 (specs/013 T002 실측). plugin.json setup_args 무변경.
      "x-tool-runtime-override-HR_BASE_URL": `http://localhost:${MOCK_PORT}`,
      "x-tool-runtime-override-HR_SESSION_COOKIE": "JSESSIONID=E2E-MOCK",
      "x-tool-runtime-override-HR_STAFF_ID": "E2E001",
    },
    body: json,
  });
}

function parseSSE(text) {
  const events = text.split("\n\n").filter((e) => e.startsWith("data:"));
  let toolCall = null;
  let finalText = null;
  let chunkedText = "";
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
    // embed 스트림은 본문을 chunk로 전달하고 finalize의 textResponse가 빈 값일 수
    // 있음 (specs/013 T002 실측: finalText="") — chunk 누적을 폴백으로 사용.
    if (
      p.type === "textResponseChunk" &&
      typeof p.textResponse === "string"
    ) {
      chunkedText += p.textResponse;
    }
    if (
      p.type === "finalizeResponseStream" &&
      typeof p.textResponse === "string"
    ) {
      finalText = p.textResponse;
    }
  }
  if (!finalText && chunkedText) finalText = chunkedText;
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
      /* skip malformed */
    }
  }
  return out;
}

// mock 로그 body를 검증용 단일 문자열로 정규화 (hr-skill runner와 동일).
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

function assertByAxis(scenario, { toolCall, mockUrl }) {
  // Unified logic: scenario.expect.tool_call drives pass/fail across all 3 axes.
  // `axis` is metadata for grouping/reporting.
  if (scenario.expect.tool_call) {
    if (!toolCall) {
      return {
        pass: false,
        reason: `[${scenario.axis}] expected tool_call but LLM did not invoke any tool`,
      };
    }
    if (scenario._mockUrlRegex) {
      if (!mockUrl) {
        return {
          pass: false,
          reason: `[${scenario.axis}] no mock URL captured (timing or non-HTTP tool-call)`,
        };
      }
      if (!scenario._mockUrlRegex.test(mockUrl)) {
        return {
          pass: false,
          reason: `[${scenario.axis}] mock URL did not match pattern ${scenario.expect.mock_url_pattern} (actual: ${mockUrl})`,
        };
      }
    }
    return { pass: true, reason: null };
  }
  // expect.tool_call === false
  if (toolCall) {
    const hint =
      scenario.axis === "DENY"
        ? "allow_tool_calling=false bypassed"
        : scenario.axis === "FILTER"
          ? "blocked skill was invoked (allowlist filter bypassed)"
          : "unexpected tool call";
    return {
      pass: false,
      reason: `[${scenario.axis}] expected no tool_call but LLM invoked one — ${hint}`,
    };
  }
  if (mockUrl) {
    return {
      pass: false,
      reason: `[${scenario.axis}] mock HR API was called despite tool_call=false (url: ${mockUrl})`,
    };
  }
  return { pass: true, reason: null };
}

async function runScenarioOnce(scenario, iteration, configMap, mockLogPath) {
  const cfg = configMap[scenario.embed_config];
  const embedUuid = cfg.uuid;
  const sessionId = crypto.randomUUID();

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let body = "";
  let errorMsg = null;
  try {
    const res = await embedStreamChat(embedUuid, {
      sessionId,
      message: scenario.message,
      prompt: TOOL_FRIENDLY_PROMPT,
    });
    body = res.body;
  } catch (e) {
    errorMsg = e.message;
  }
  const elapsedMs = Date.now() - t0;
  const { toolCall, finalText, eventCount } = parseSSE(body);

  const mockEntries = readMockLogTail(mockLogPath, startedAt);
  // 현행 kiwibox(*.do)만 대조 대상 (구세대 REST /api/v1/* 잔재 제거 — specs/013)
  const relevantMock = mockEntries.filter((m) => /\.do$/.test(m.path || ""));
  const mockUrl =
    relevantMock.length > 0
      ? relevantMock[relevantMock.length - 1].fullUrl
      : null;
  const mockBody =
    relevantMock.length > 0
      ? mockBodyToString(relevantMock[relevantMock.length - 1].body)
      : null;

  // Embed tool calling path does not emit "Assembling Tool Call" SSE events
  // (those are agent-mode specific, see server/utils/agents/aibitat/providers/*).
  // Mock API hit is the ground truth of tool execution — if the mock logged an HR
  // request for this scenario window, a tool was actually invoked regardless of SSE shape.
  const effectiveToolCall =
    toolCall || (mockUrl ? `[mock-hit:${mockUrl.split("?")[0]}]` : null);

  let pass = true;
  let reason = null;
  if (errorMsg) {
    pass = false;
    reason = `request error: ${errorMsg}`;
  } else {
    const verdict = assertByAxis(scenario, {
      toolCall: effectiveToolCall,
      mockUrl,
    });
    pass = verdict.pass;
    reason = verdict.reason;
  }
  // kiwibox body 검증 (허용측 시나리오 — 축 판정 통과 후)
  if (pass && scenario._mockBodyRegexes) {
    if (mockBody == null) {
      pass = false;
      reason = `[${scenario.axis}] no mock body captured`;
    } else {
      const missed = scenario.expect.mock_body_pattern.filter(
        (p, i) => !scenario._mockBodyRegexes[i].test(mockBody)
      );
      if (missed.length > 0) {
        pass = false;
        reason = `[${scenario.axis}] mock body missing pattern(s): ${missed.join(" | ")}`;
      }
    }
  }
  // 최종 답변·호출 건수 검증 — specs/012 contracts/e2e-assertion-schema.md 판정 4~7
  if (pass && (scenario._answerRegexes || scenario._answerNotRegexes)) {
    if (!finalText) {
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
    axis: scenario.axis,
    iteration,
    embedConfig: scenario.embed_config,
    message: scenario.message,
    elapsedMs,
    toolCall: effectiveToolCall,
    toolCallSource: toolCall
      ? "sse"
      : mockUrl
        ? "mock-hit-fallback"
        : null,
    finalText,
    mockUrl,
    mockBody,
    hrCallCount: relevantMock.length,
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
  const status = run.pass
    ? `${COLOR.green}PASS${COLOR.reset}`
    : `${COLOR.red}FAIL${COLOR.reset}`;
  const detail = run.toolCall
    ? run.toolCall.slice(0, 80)
    : run.finalText
      ? `(${run.finalText.slice(0, 60).replace(/\s+/g, " ")})`
      : run.reason
        ? `[reason: ${run.reason.slice(0, 60)}]`
        : "(no response)";
  console.log(
    `${pad(label, 14)} | ${pad(run.axis, 6)} | elapsed ${elapsed} | tool=${tool} | ${status} | ${detail}`
  );
}

function buildSummary(runs) {
  const perScenario = {};
  const perAxis = { ALLOW: { total: 0, pass: 0 }, DENY: { total: 0, pass: 0 }, FILTER: { total: 0, pass: 0 } };
  for (const r of runs) {
    const s = (perScenario[r.scenario] = perScenario[r.scenario] || {
      total: 0,
      pass: 0,
      toolCalls: 0,
      axis: r.axis,
    });
    s.total++;
    if (r.pass) s.pass++;
    if (r.toolCall) s.toolCalls++;

    perAxis[r.axis].total++;
    if (r.pass) perAxis[r.axis].pass++;
  }
  const summary = {};
  for (const id of Object.keys(perScenario)) {
    const s = perScenario[id];
    summary[id] = {
      axis: s.axis,
      total: s.total,
      pass: s.pass,
      toolCallRate: `${s.toolCalls}/${s.total}`,
    };
  }
  const total = runs.length;
  const passCount = runs.filter((r) => r.pass).length;
  return {
    perScenario: summary,
    byAxis: perAxis,
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
  for (const axis of VALID_AXES) {
    const a = summary.byAxis[axis];
    if (a.total === 0) continue;
    const rate = ((a.pass / a.total) * 100).toFixed(1);
    const color = a.pass === a.total ? COLOR.green : COLOR.red;
    console.log(
      `  ${axis.padEnd(6)}: ${color}${a.pass}/${a.total} (${rate}%)${COLOR.reset}`
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
  const scenarios = loadScenarios();
  info(
    `${scenarios.length} scenarios loaded (${scenarios.reduce(
      (n, s) => n + s.repeat,
      0
    )} total runs)`
  );

  const runDir = makeRunDir();
  info(`run dir: ${path.relative(process.cwd(), runDir)}`);

  await healthCheck();

  // Resolve primary workspace to copy LLM config from.
  const primaryWorkspaceId = await resolveWorkspaceId(WORKSPACE_ID_ENV);
  info(`primary workspace for LLM config: ${primaryWorkspaceId}`);

  // Create a dedicated test workspace with NO vectors so RAG cannot compete
  // with tool calls. This isolates the test from production document context.
  try {
    const staleWs = await cleanupTestWorkspaces();
    if (staleWs.deleted > 0)
      info(`pre-cleanup removed ${staleWs.deleted} stale test workspace(s)`);
  } catch (e) {
    warn(`test workspace pre-cleanup failed (non-fatal): ${e.message}`);
  }
  const testWorkspace = await createTestWorkspace(primaryWorkspaceId);
  info(
    `test workspace created: id=${testWorkspace.id}, slug=${testWorkspace.slug} (empty vectors → RAG bypassed)`
  );
  const workspaceId = testWorkspace.id;

  const { child: mockChild, mockLogPath } = await spawnMock(runDir);

  let configMap = null;
  const runs = [];
  const meta = {
    feature: "embed-tool-calling-e2e-runner",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    scenariosCount: scenarios.length,
    totalRuns: scenarios.reduce((n, s) => n + s.repeat, 0),
    serverUrl: SERVER_URL,
    mockPort: MOCK_PORT,
    primaryWorkspaceId,
    testWorkspaceId: workspaceId,
    testWorkspaceSlug: testWorkspace.slug,
    gitHead: gitHead(),
  };

  try {
    configMap = await setupEmbedConfigs(workspaceId);

    console.log("");
    console.log("========================================");
    console.log(`  embed-tool-calling-e2e-runner — ${meta.startedAt}`);
    console.log("========================================");

    const t0 = Date.now();
    for (const scenario of scenarios) {
      for (let i = 1; i <= scenario.repeat; i++) {
        const run = await runScenarioOnce(scenario, i, configMap, mockLogPath);
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
    try {
      const { deleted } = await cleanupEmbedConfigs();
      info(`embed configs cleaned: ${deleted} row(s)`);
    } catch (e) {
      warn(`teardown DELETE failed: ${e.message}`);
      warn("remaining e2e-embed-* configs must be removed manually");
    }
    try {
      const { deleted } = await cleanupTestWorkspaces();
      info(`test workspaces cleaned: ${deleted} row(s)`);
    } catch (e) {
      warn(`test workspace teardown failed: ${e.message}`);
      warn(`remaining ${testWorkspace?.slug || "?"} workspace must be removed manually`);
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
  process.stderr.write(
    `${COLOR.red}[fatal]${COLOR.reset} ${e.stack || e.message}\n`
  );
  process.exit(1);
});
