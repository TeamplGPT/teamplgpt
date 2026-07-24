/**
 * specs/011 결정론적 handler 검증 하네스 (LLM 미개입 — 서버 폴백 경로).
 * 각 K 시나리오의 query_type을 handler에 직접 호출 → 로컬 mock이 받은
 * 요청의 path+body를 scenarios.json의 mock_url_pattern/mock_body_pattern으로 판정.
 *
 * 사용: NODE_PATH=<scratchpad>/node_modules node harness.js <label>
 * 출력: <label>.json (판정 결과) + stdout 표
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = "/home/sdh/teamplgpt/teamplgpt";
const SKILLS = path.join(REPO, "server/storage/plugins/agent-skills");
const E2E = path.join(REPO, "server/scripts/e2e-hr-skill");
const SCRATCH = __dirname;
const PORT = 8901;
const LOG = path.join(SCRATCH, "mock-harness.jsonl");

const label = process.argv[2] || "run";

// K 시나리오 → handler 직접 호출 매핑
const CALLS = [
  { id: "K1", skill: "hr-attendance", args: { query_type: "annual_leave_balance" } },
  { id: "K2", skill: "hr-attendance", args: { query_type: "leave_requests" } },
  { id: "K3", skill: "hr-attendance", args: { query_type: "timesheet" } },
  { id: "K4", skill: "hr-attendance", args: { query_type: "work_status" } },
  { id: "K5", skill: "hr-attendance", args: { query_type: "work_calendar" } },
  { id: "K6", skill: "hr-attendance", args: { query_type: "overtime" } },
  { id: "K7", skill: "hr-attendance", args: { query_type: "overtime_limit" } },
  { id: "K8", skill: "hr-attendance", args: { query_type: "vacation_calendar" } },
  { id: "K9", skill: "hr-salary", args: { query_type: "pay_periods", year_month: "202606" } },
  { id: "K10", skill: "hr-salary", args: { query_type: "payslip", pay_item: "20260619P" } },
  { id: "K11", skill: "hr-salary", args: { query_type: "deductions", pay_item: "20260619P" } },
  { id: "K12", skill: "hr-salary", args: { query_type: "payslip_summary", pay_item: "20260619P" } },
  { id: "K13", skill: "hr-salary", args: { query_type: "salary_statement" } },
  { id: "K14", skill: "hr-approval", args: { query_type: "drafted" } },
  { id: "K15", skill: "hr-certificate", args: { query_type: "requests" } },
  { id: "K16", skill: "hr-welfare", args: { query_type: "loan" } },
  { id: "K17", skill: "hr-personnel", args: { query_type: "education" } },
];

const RUNTIME_ARGS = {
  HR_BASE_URL: `http://localhost:${PORT}`,
  HR_CONTEXT_PATH: "",
  HR_SESSION_COOKIE: "JSESSIONID=harness-dummy",
  HR_STAFF_ID: "100:2007:00204:kkHT",
  HR_WKAREA_CD: "1000",
  HR_SAL_APPL_CD: "",
  HR_ACTIVE_MENU_CD: "",
};

function makeCtx() {
  return {
    runtimeArgs: RUNTIME_ARGS,
    introspect() {},
    logger() {},
  };
}

function mockBodyToString(body) {
  if (body == null) return "";
  if (typeof body === "object" && typeof body._raw === "string") {
    try {
      return decodeURIComponent(body._raw.replace(/\+/g, " "));
    } catch {
      return body._raw;
    }
  }
  if (typeof body === "object")
    return Object.entries(body).map(([k, v]) => `${k}=${v}`).join("&");
  return String(body);
}

async function main() {
  const scenarios = JSON.parse(
    fs.readFileSync(path.join(E2E, "scenarios.json"), "utf8")
  ).scenarios;
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));

  fs.writeFileSync(LOG, "");
  const mock = spawn("node", [path.join(E2E, "mock-hr-api.js"), "--port", String(PORT), "--log-path", LOG], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));

  const results = [];
  try {
    for (const call of CALLS) {
      const before = fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).length;
      const mod = require(path.join(SKILLS, call.skill, "handler.js"));
      let handlerReturn;
      try {
        handlerReturn = await mod.runtime.handler.call(makeCtx(), call.args);
      } catch (e) {
        handlerReturn = `HANDLER_THROW: ${e.message}`;
      }
      await new Promise((r) => setTimeout(r, 200));
      const lines = fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      const mine = lines.slice(before);
      const entry = mine.length ? mine[mine.length - 1] : null;

      const sc = byId[call.id];
      let pass = true, reasons = [];
      if (!entry) {
        pass = false;
        reasons.push("no request captured");
      } else {
        if (sc.expect.mock_url_pattern && !new RegExp(sc.expect.mock_url_pattern).test(entry.fullUrl)) {
          pass = false;
          reasons.push(`url ${entry.fullUrl} !~ ${sc.expect.mock_url_pattern}`);
        }
        const bodyStr = mockBodyToString(entry.body);
        for (const p of sc.expect.mock_body_pattern || []) {
          if (!new RegExp(p).test(bodyStr)) {
            pass = false;
            reasons.push(`body missing: ${p}`);
          }
        }
      }
      results.push({
        id: call.id, skill: call.skill, args: call.args, pass,
        reasons,
        actualUrl: entry ? entry.fullUrl : null,
        actualBody: entry ? mockBodyToString(entry.body) : null,
        handlerReturn: String(handlerReturn).slice(0, 120),
      });
      const mark = pass ? "PASS" : "FAIL";
      console.log(`${call.id.padEnd(5)} ${mark}  ${entry ? entry.fullUrl : "(no request)"}${reasons.length ? "  <- " + reasons.join(" | ") : ""}`);
    }
  } finally {
    mock.kill("SIGTERM");
  }

  const summary = {
    label,
    ts: new Date().toISOString(),
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    results,
  };
  fs.writeFileSync(path.join(SCRATCH, `harness-${label}.json`), JSON.stringify(summary, null, 2));
  console.log(`\n${label}: PASS ${summary.pass} / FAIL ${summary.fail}  -> harness-${label}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
