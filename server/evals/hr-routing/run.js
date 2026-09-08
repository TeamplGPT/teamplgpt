#!/usr/bin/env node
"use strict";

/**
 * HR skill 라우팅 평가 하네스 (P0-1)
 *
 * 프로덕션 채팅 경로(stream.js)와 동일한 구성으로 LLM에 1턴 요청을 보내
 * "어떤 skill/query_type이 호출되는가"만 평가한다. tool은 실제로 실행하지 않는다.
 *
 * 프로덕션 동일 구성 요소:
 *  - tool 정의: ChatToolsManager.getToolDefinitions("openai-responses")
 *  - 시스템 프롬프트: chatPrompt(null, null) (기본 프롬프트 + hrSkillChatGuard)
 *  - 발화별 tool 필터: routeHrToolsForMessage
 *  - 요청 형식: OpenAI Responses API (utils/AiProviders/openAi getChatCompletion과 동일 필드)
 *
 * 사용법 (server 디렉토리에서):
 *   node evals/hr-routing/run.js                 # 전체 실행
 *   node evals/hr-routing/run.js --dry           # LLM 호출 없이 프롬프트/tool 구성만 검증
 *   node evals/hr-routing/run.js --tags colloquial,typo
 *   node evals/hr-routing/run.js --grep 연차 --limit 5
 *   node evals/hr-routing/run.js --model gpt-5.1 --concurrency 4
 *
 * 리포트: evals/hr-routing/reports/<timestamp>.{json,md}
 */

const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.resolve(__dirname, "../..");
const EVAL_DIR = __dirname;

// index.js와 동일한 env 로딩 (기본 development)
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
const NODE_ENV = process.env.NODE_ENV;
const envPath = path.join(SERVER_DIR, `.env.${NODE_ENV}`);
require("dotenv").config(
  fs.existsSync(envPath) ? { path: envPath } : { path: path.join(SERVER_DIR, ".env") }
);

const { ChatToolsManager } = require(path.join(
  SERVER_DIR,
  "utils/chats/toolCalling/manager"
));
const { routeHrToolsForMessage } = require(path.join(
  SERVER_DIR,
  "utils/chats/toolCalling/hrRouting"
));

const PROVIDER_FORMAT = "openai-responses";

// ---------- CLI ----------
function parseArgs(argv) {
  const args = {
    tags: null,
    grep: null,
    limit: null,
    model: null,
    concurrency: 4,
    dry: false,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") args.dry = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--tags") args.tags = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--grep") args.grep = argv[++i];
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// ---------- Dataset ----------
function loadDataset() {
  const raw = fs.readFileSync(path.join(EVAL_DIR, "dataset.jsonl"), "utf8");
  const cases = [];
  raw.split("\n").forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const c = JSON.parse(trimmed);
      if (!c.id || !c.utterance || !Array.isArray(c.expect))
        throw new Error("id/utterance/expect required");
      cases.push(c);
    } catch (e) {
      console.error(`dataset.jsonl:${idx + 1} parse error: ${e.message}`);
      process.exit(1);
    }
  });
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) {
      console.error(`dataset.jsonl duplicate id: ${c.id}`);
      process.exit(1);
    }
    ids.add(c.id);
  }
  return cases;
}

function filterCases(cases, args) {
  let out = cases;
  if (args.tags)
    out = out.filter((c) => (c.tags || []).some((t) => args.tags.includes(t)));
  if (args.grep)
    out = out.filter(
      (c) => c.id.includes(args.grep) || c.utterance.includes(args.grep)
    );
  if (args.limit) out = out.slice(0, args.limit);
  return out;
}

// ---------- System prompt (프로덕션 경로 우선, 실패 시 폴백) ----------
async function buildSystemPrompt() {
  try {
    const { chatPrompt } = require(path.join(SERVER_DIR, "utils/chats/index"));
    const prompt = await chatPrompt(null, null);
    if (prompt && prompt.trim().length > 0) return { prompt, source: "chatPrompt" };
  } catch (e) {
    console.warn(`[eval] chatPrompt() 실패, 폴백 사용: ${e.message}`);
  }
  const { SystemSettings } = require(path.join(SERVER_DIR, "models/systemSettings"));
  const { hrSkillChatGuard } = require(path.join(SERVER_DIR, "utils/chats/index"));
  const guard = hrSkillChatGuard();
  const base = SystemSettings.saneDefaultSystemPrompt;
  return {
    prompt: guard ? `${base}\n\n${guard}` : base,
    source: "fallback(saneDefault+guard)",
  };
}

// ---------- LLM 호출 (utils/AiProviders/openAi getChatCompletion과 동일 요청 형식) ----------
function temperatureFor(model) {
  const NO_TEMP_MODELS = ["o", "gpt-5"];
  if (NO_TEMP_MODELS.some((prefix) => model.startsWith(prefix))) return 1;
  return 0.7;
}

async function callLlm({ openai, model, systemPrompt, utterance, tools, toolChoice }) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: utterance },
  ];
  const result = await openai.responses.create({
    model,
    input: messages,
    store: false,
    temperature: temperatureFor(model),
    ...(tools?.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  });
  const calls = (result.output || [])
    .filter((item) => item.type === "function_call")
    .map((item) => {
      let parsed = {};
      try {
        parsed = JSON.parse(item.arguments || "{}");
      } catch (_) {
        /* arguments 파싱 실패 시 빈 객체 */
      }
      return { skill: item.name, args: parsed };
    });
  return {
    calls,
    text: result.output_text || "",
    usage: result.usage || {},
  };
}

// ---------- Scoring ----------
/**
 * expect: 대안 집합의 배열. 각 대안은 기대 호출 목록(순서 무관 완전 일치).
 * 기대 호출: { skill, query_type?, params_regex? }
 *  - query_type 생략 시 skill만 일치하면 됨
 *  - params_regex: { paramName: regexString } — 실제 인자 값에 대해 부분 일치 검사
 * 빈 대안 []은 "tool 호출 없음"이 정답.
 */
function matchesExpectedSet(actualCalls, expectedSet) {
  if (actualCalls.length !== expectedSet.length) return false;
  const remaining = [...actualCalls];
  for (const exp of expectedSet) {
    const idx = remaining.findIndex((call) => matchesExpectedCall(call, exp));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}

function matchesExpectedCall(call, exp) {
  if (call.skill !== exp.skill) return false;
  if (exp.query_type && call.args?.query_type !== exp.query_type) return false;
  if (exp.params_regex) {
    for (const [key, pattern] of Object.entries(exp.params_regex)) {
      const value = call.args?.[key];
      if (typeof value !== "string" || !new RegExp(pattern).test(value))
        return false;
    }
  }
  return true;
}

function scoreCase(c, actualCalls) {
  const pass = c.expect.some((set) => matchesExpectedSet(actualCalls, set));
  // skill 수준 일치(진단용): 첫 대안 기준
  const primary = c.expect[0] || [];
  const expectedSkills = [...new Set(primary.map((e) => e.skill))].sort();
  const actualSkills = [...new Set(actualCalls.map((call) => call.skill))].sort();
  const skillPass =
    pass ||
    (expectedSkills.length === actualSkills.length &&
      expectedSkills.every((s, i) => s === actualSkills[i]));
  return { pass, skillPass };
}

function primaryExpectLabel(c) {
  const primary = c.expect[0] || [];
  if (primary.length === 0) return "(no-tool)";
  return primary
    .map((e) => `${e.skill}${e.query_type ? `.${e.query_type}` : ""}`)
    .join(" + ");
}

function actualLabel(calls) {
  if (!calls || calls.length === 0) return "(no-tool)";
  return calls
    .map((call) => {
      const qt = call.args?.query_type ? `.${call.args.query_type}` : "";
      return `${call.skill}${qt}`;
    })
    .join(" + ");
}

// ---------- Concurrency pool ----------
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane)
  );
  return results;
}

// ---------- Report ----------
function pct(n, d) {
  return d === 0 ? "-" : `${((n / d) * 100).toFixed(1)}%`;
}

function buildReport({ results, model, promptSource, toolCount, startedAt }) {
  const done = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const passed = done.filter((r) => r.pass);
  const failed = done.filter((r) => !r.pass);

  const byTag = {};
  const bySkill = {};
  for (const r of done) {
    for (const tag of r.case.tags || ["untagged"]) {
      byTag[tag] = byTag[tag] || { total: 0, pass: 0 };
      byTag[tag].total++;
      if (r.pass) byTag[tag].pass++;
    }
    const skillKey =
      (r.case.expect[0] || []).map((e) => e.skill).join("+") || "(no-tool)";
    bySkill[skillKey] = bySkill[skillKey] || { total: 0, pass: 0 };
    bySkill[skillKey].total++;
    if (r.pass) bySkill[skillKey].pass++;
  }

  // 혼동 페어: 기대 → 실제 (실패 케이스만)
  const confusion = {};
  for (const r of failed) {
    const key = `${primaryExpectLabel(r.case)}  →  ${actualLabel(r.calls)}`;
    confusion[key] = (confusion[key] || 0) + 1;
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    model,
    promptSource,
    toolCount,
    total: results.length,
    errors: errors.length,
    pass: passed.length,
    fail: failed.length,
    passRate: done.length ? passed.length / done.length : null,
    skillPassRate: done.length
      ? done.filter((r) => r.skillPass).length / done.length
      : null,
    byTag,
    bySkill,
    confusion,
    failures: failed.map((r) => ({
      id: r.case.id,
      tags: r.case.tags,
      utterance: r.case.utterance,
      expected: primaryExpectLabel(r.case),
      actual: actualLabel(r.calls),
      text: r.text ? r.text.slice(0, 200) : "",
    })),
    errorCases: errors.map((r) => ({ id: r.case.id, error: r.error })),
    results: results.map((r) => ({
      id: r.case.id,
      pass: r.pass ?? null,
      skillPass: r.skillPass ?? null,
      error: r.error ?? null,
      expected: primaryExpectLabel(r.case),
      actual: r.error ? null : actualLabel(r.calls),
      durationMs: r.durationMs ?? null,
    })),
  };
  return summary;
}

function reportMarkdown(s) {
  const lines = [];
  lines.push(`# HR 라우팅 평가 리포트`);
  lines.push("");
  lines.push(`- 실행: ${s.startedAt} ~ ${s.finishedAt}`);
  lines.push(`- 모델: ${s.model} / tool ${s.toolCount}개 / prompt: ${s.promptSource}`);
  lines.push(
    `- **전체 정확도: ${pct(s.pass, s.pass + s.fail)}** (${s.pass}/${s.pass + s.fail}${s.errors ? `, 오류 ${s.errors}건 제외` : ""})`
  );
  lines.push(
    `- skill 수준 정확도(진단용): ${pct(Math.round((s.skillPassRate ?? 0) * (s.pass + s.fail)), s.pass + s.fail)}`
  );
  lines.push("");
  lines.push(`## 태그별`);
  lines.push("");
  lines.push(`| 태그 | 정확도 | 통과/전체 |`);
  lines.push(`|---|---|---|`);
  for (const [tag, v] of Object.entries(s.byTag).sort()) {
    lines.push(`| ${tag} | ${pct(v.pass, v.total)} | ${v.pass}/${v.total} |`);
  }
  lines.push("");
  lines.push(`## 기대 skill별`);
  lines.push("");
  lines.push(`| skill | 정확도 | 통과/전체 |`);
  lines.push(`|---|---|---|`);
  for (const [skill, v] of Object.entries(s.bySkill).sort()) {
    lines.push(`| ${skill} | ${pct(v.pass, v.total)} | ${v.pass}/${v.total} |`);
  }
  if (Object.keys(s.confusion).length) {
    lines.push("");
    lines.push(`## 혼동 페어 (기대 → 실제)`);
    lines.push("");
    for (const [key, count] of Object.entries(s.confusion).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`- ${count}건: ${key}`);
    }
  }
  if (s.failures.length) {
    lines.push("");
    lines.push(`## 실패 케이스`);
    lines.push("");
    lines.push(`| id | 발화 | 기대 | 실제 |`);
    lines.push(`|---|---|---|---|`);
    for (const f of s.failures) {
      lines.push(
        `| ${f.id} | ${f.utterance} | ${f.expected} | ${f.actual} |`
      );
    }
  }
  if (s.errorCases.length) {
    lines.push("");
    lines.push(`## 오류 케이스`);
    for (const e of s.errorCases) lines.push(`- ${e.id}: ${e.error}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ---------- Main ----------
async function main() {
  const args = parseArgs(process.argv);
  const cases = filterCases(loadDataset(), args);
  if (cases.length === 0) {
    console.error("실행할 케이스가 없습니다 (필터 확인).");
    process.exit(1);
  }

  const tools = ChatToolsManager.getToolDefinitions(PROVIDER_FORMAT);
  const hrTools = tools.filter((t) => t.type === "function");
  if (hrTools.length === 0) {
    console.error(
      "active HR skill tool이 없습니다. storage/plugins/agent-skills의 plugin.json active 여부를 확인하세요."
    );
    process.exit(1);
  }

  const { prompt: systemPrompt, source: promptSource } =
    await buildSystemPrompt();
  const model = args.model || process.env.OPEN_MODEL_PREF || "gpt-4o";

  console.log(
    `[eval] cases=${cases.length} tools=${tools.length}(function ${hrTools.length}) model=${model} prompt=${promptSource}`
  );

  if (args.dry) {
    console.log(`\n--- system prompt (${systemPrompt.length} chars) ---`);
    console.log(systemPrompt.slice(0, 1500));
    console.log(`\n--- tools ---`);
    for (const t of tools)
      console.log(
        `- ${t.name || t.type} (desc ${t.description?.length ?? 0} chars)`
      );
    console.log(`\n--- 케이스 샘플 ---`);
    for (const c of cases.slice(0, 5))
      console.log(`- [${c.id}] ${c.utterance} => ${primaryExpectLabel(c)}`);
    console.log(`\n[dry] LLM 호출 없이 종료.`);
    return;
  }

  if (!process.env.OPEN_AI_KEY) {
    console.error("OPEN_AI_KEY가 설정돼 있지 않습니다 (.env.development 확인).");
    process.exit(1);
  }
  const { OpenAI } = require("openai");
  const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

  const startedAt = new Date().toISOString();
  let doneCount = 0;

  const results = await runPool(
    cases,
    async (c) => {
      // 프로덕션과 동일: 발화별 tool 필터링(hrRouting)
      const { tools: routedTools, toolChoice } = routeHrToolsForMessage({
        tools,
        providerFormat: PROVIDER_FORMAT,
        message: c.utterance,
      });
      const t0 = Date.now();
      try {
        const { calls, text } = await callLlm({
          openai,
          model,
          systemPrompt,
          utterance: c.utterance,
          tools: routedTools,
          toolChoice,
        });
        const { pass, skillPass } = scoreCase(c, calls);
        const r = {
          case: c,
          calls,
          text,
          pass,
          skillPass,
          durationMs: Date.now() - t0,
        };
        doneCount++;
        const mark = pass ? "PASS" : "FAIL";
        const line = `[${doneCount}/${cases.length}] ${mark} ${c.id}  ${primaryExpectLabel(c)}  =>  ${actualLabel(calls)}`;
        if (!pass || args.verbose) console.log(line);
        return r;
      } catch (e) {
        doneCount++;
        console.error(`[${doneCount}/${cases.length}] ERROR ${c.id}: ${e.message}`);
        return { case: c, error: e.message, durationMs: Date.now() - t0 };
      }
    },
    args.concurrency
  );

  const summary = buildReport({
    results,
    model,
    promptSource,
    toolCount: tools.length,
    startedAt,
  });

  const reportsDir = path.join(EVAL_DIR, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(reportsDir, `${stamp}.json`);
  const mdPath = path.join(reportsDir, `${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(mdPath, reportMarkdown(summary));

  console.log("");
  console.log(
    `전체 정확도: ${pct(summary.pass, summary.pass + summary.fail)} (${summary.pass}/${summary.pass + summary.fail})` +
      (summary.errors ? ` / 오류 ${summary.errors}건` : "")
  );
  for (const [tag, v] of Object.entries(summary.byTag).sort())
    console.log(`  - ${tag}: ${pct(v.pass, v.total)} (${v.pass}/${v.total})`);
  console.log(`리포트: ${path.relative(process.cwd(), mdPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
