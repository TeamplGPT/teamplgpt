#!/usr/bin/env node
/**
 * Widget company-documents RAG E2E runner (specs/021-widget-company-docs-rag).
 *
 * 흐름:
 *   1. 빈 테스트 워크스페이스를 만들고 공통 문서를 v1 API로 임베딩한다.
 *   2. allow_company_documents=true 인 테스트 embed를 만든다.
 *   3. 회사별 문서를 embed 회사 문서 API로 올리고 "사용 가능"이 될 때까지 기다린다.
 *   4. 시나리오마다 새 세션으로 stream-chat을 호출하고 답변 패턴을 검사한다.
 *   5. finally에서 회사 문서·워크스페이스·embed·API 키를 지운다.
 *
 * 준비 단계(시드)가 실패하면 모든 시나리오를 FAIL로 기록한다(E2E-First FAIL 확인용).
 *
 * Usage: node server/scripts/e2e-embed-company-docs/runner.js [--only=CR-01,CR-02]
 * Env:   E2E_SERVER_URL (default http://localhost:3001), E2E_WORKSPACE_ID,
 *        E2E_PROCESS_TIMEOUT_MS (default 180000),
 *        E2E_KEEP=1 (진단용 — 정리 생략, 결과 파일도 쓰지 않음)
 * Requires Node >= 20 (global fetch / FormData / Blob).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const {
  resolveWorkspaceId,
  createTestWorkspace,
} = require("../e2e-embed-hr-skill/helpers/embedconfig");
const {
  createDevApiKey,
  deleteDevApiKey,
} = require("../e2e-hr-skill/helpers/apikey");

const SERVER_URL = (
  process.env.E2E_SERVER_URL || "http://localhost:3001"
).replace(/\/$/, "");
const PROCESS_TIMEOUT_MS = Number(process.env.E2E_PROCESS_TIMEOUT_MS) || 180000;
const ROOT = __dirname;
const FIXTURES = path.join(ROOT, "fixtures");
const UUID_PREFIX = "e2e-embed-codocs-";

const PG_CONTAINER = process.env.E2E_PG_CONTAINER || "anythingllm-postgres";
const PG_USER = process.env.E2E_PG_USER || "anythingllm";
const PG_DB = process.env.E2E_PG_DB || "anythingllm";

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      PG_CONTAINER,
      "psql",
      "-U",
      PG_USER,
      "-d",
      PG_DB,
      "-tA",
      "-c",
      sql,
    ],
    { encoding: "utf8" }
  );
}

function info(msg) {
  console.log(`[codocs-e2e] ${msg}`);
}

function parseOnly() {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  const raw = arg ? arg.slice("--only=".length) : process.env.E2E_ONLY || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 공통 문서 시드 (v1 API) ────────────────────────────────────────────────

async function v1(apiKey, method, urlPath, body) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${SERVER_URL}/api${urlPath}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    /* 비 JSON */
  }
  if (!res.ok)
    throw new Error(
      `${method} ${urlPath} → ${res.status} ${text.slice(0, 200)}`
    );
  return json;
}

async function seedCommonDocs(apiKey, slug, files) {
  const locations = [];
  for (const name of files) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([fs.readFileSync(path.join(FIXTURES, name))]),
      name
    );
    const out = await v1(apiKey, "POST", "/v1/document/upload", form);
    const location = out?.documents?.[0]?.location;
    if (!location)
      throw new Error(`common upload returned no location for ${name}`);
    locations.push(location);
  }
  await v1(apiKey, "POST", `/v1/workspace/${slug}/update-embeddings`, {
    adds: locations,
    deletes: [],
  });
  info(`common docs embedded into ${slug}: ${files.join(", ")}`);
  return locations;
}

// ─── 테스트 embed ──────────────────────────────────────────────────────────

function createCompanyDocsEmbed(workspaceId) {
  const uuid = `${UUID_PREFIX}${crypto.randomBytes(4).toString("hex")}`;
  const raw = psql(
    `INSERT INTO embed_configs ` +
      `(uuid, enabled, chat_mode, workspace_id, allow_company_documents, "createdAt") ` +
      `VALUES ('${uuid}', true, 'chat', ${Number(workspaceId)}, true, NOW()) RETURNING id;`
  ).trim();
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id))
    throw new Error(`embed_configs INSERT failed: ${raw}`);
  return { uuid, id };
}

// 이번 실행이 만든 embed만 지운다 — 접두사로 지우면 개발용으로 남겨 둔 같은 접두사 embed까지 사라진다
function deleteCompanyDocsEmbed(uuid) {
  if (!/^e2e-embed-codocs-[0-9a-f]{8}$/.test(uuid || "")) {
    throw new Error(`refusing to delete non-runner embed: ${uuid}`);
  }
  psql(`DELETE FROM embed_configs WHERE uuid = '${uuid}';`);
}

// ─── 회사 문서 API ─────────────────────────────────────────────────────────

function companyDocsUrl(embedUuid, sub = "", companyName) {
  const q = companyName
    ? `?companyName=${encodeURIComponent(companyName)}`
    : "";
  return `${SERVER_URL}/api/embed/${embedUuid}/company-documents${sub}${q}`;
}

async function listCompanyDocs(embedUuid, companyName) {
  const res = await fetch(companyDocsUrl(embedUuid, "", companyName));
  if (!res.ok)
    throw new Error(`list ${companyName} → ${res.status} ${await res.text()}`);
  return (await res.json()).documents || [];
}

async function uploadCompanyDoc(embedUuid, companyName, fileName) {
  const form = new FormData();
  form.append("companyName", companyName);
  form.append("uploaderName", "E2E");
  form.append(
    "file",
    new Blob([fs.readFileSync(path.join(FIXTURES, fileName))]),
    fileName
  );
  const res = await fetch(companyDocsUrl(embedUuid), {
    method: "POST",
    body: form,
  });
  if (res.status !== 202) {
    throw new Error(
      `upload ${companyName}/${fileName} → ${res.status} ${await res.text()}`
    );
  }
  return (await res.json()).document;
}

async function deleteCompanyDoc(embedUuid, companyName, id) {
  const res = await fetch(companyDocsUrl(embedUuid, `/${id}`, companyName), {
    method: "DELETE",
  });
  if (!res.ok)
    throw new Error(
      `delete ${companyName}/${id} → ${res.status} ${await res.text()}`
    );
}

async function deleteAllCompanyDocs(embedUuid, companyName) {
  for (const doc of await listCompanyDocs(embedUuid, companyName)) {
    await deleteCompanyDoc(embedUuid, companyName, doc.id);
  }
}

async function seedCompanyDocs(embedUuid, companies) {
  for (const [companyName, files] of Object.entries(companies)) {
    for (const fileName of files)
      await uploadCompanyDoc(embedUuid, companyName, fileName);
  }
  const deadline = Date.now() + PROCESS_TIMEOUT_MS;
  for (const companyName of Object.keys(companies)) {
    for (;;) {
      const docs = await listCompanyDocs(embedUuid, companyName);
      const failed = docs.find((d) => d.status === "failed");
      if (failed)
        throw new Error(
          `${companyName}/${failed.filename} failed: ${failed.error}`
        );
      if (docs.length && docs.every((d) => d.status === "ready")) break;
      if (Date.now() > deadline)
        throw new Error(
          `${companyName} docs not ready in ${PROCESS_TIMEOUT_MS}ms`
        );
      await sleep(2000);
    }
    info(`company docs ready: ${companyName}`);
  }
}

// ─── 질문 ─────────────────────────────────────────────────────────────────

function parseSSE(text) {
  let finalText = null;
  let chunked = "";
  let error = null;
  for (const evt of text.split("\n\n")) {
    const m = evt.match(/^data:\s*(.*)$/m);
    if (!m) continue;
    let p;
    try {
      p = JSON.parse(m[1]);
    } catch (_) {
      continue;
    }
    if (p.type === "abort" || p.error) error = p.error || "abort";
    if (p.type === "textResponseChunk" && typeof p.textResponse === "string")
      chunked += p.textResponse;
    if (
      p.type === "finalizeResponseStream" &&
      typeof p.textResponse === "string"
    )
      finalText = p.textResponse;
  }
  return { text: finalText || chunked, error };
}

async function ask(embedUuid, companyName, question) {
  const body = {
    message: question,
    sessionId: crypto.randomUUID(),
    ...(companyName ? { companyName } : {}),
  };
  const res = await fetch(`${SERVER_URL}/api/embed/${embedUuid}/stream-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok)
    return { text: "", error: `HTTP ${res.status} ${raw.slice(0, 200)}` };
  return parseSSE(raw);
}

function check(expect, text) {
  const reasons = [];
  for (const p of expect.answer_pattern || []) {
    if (!new RegExp(p).test(text)) reasons.push(`missing /${p}/`);
  }
  for (const p of expect.answer_not_pattern || []) {
    if (new RegExp(p).test(text)) reasons.push(`forbidden /${p}/`);
  }
  return reasons;
}

async function runScenario(embedUuid, sc) {
  if (sc.before?.delete_all_company_docs) {
    await deleteAllCompanyDocs(embedUuid, sc.company);
    const left = await listCompanyDocs(embedUuid, sc.company);
    if (left.length)
      return {
        pass: false,
        runs: [],
        reason: `${left.length} docs left after delete`,
      };
  }
  const repeat = sc.repeat || 1;
  const minPass = sc.min_pass || repeat;
  const runs = [];
  for (let i = 0; i < repeat; i++) {
    const { text, error } = await ask(embedUuid, sc.company, sc.question);
    const reasons = error ? [`stream error: ${error}`] : check(sc.expect, text);
    if (!text && !error) reasons.push("empty answer");
    runs.push({ pass: reasons.length === 0, reasons, answer: text });
  }
  const passed = runs.filter((r) => r.pass).length;
  return { pass: passed >= minPass, passed, repeat, minPass, runs };
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  const spec = JSON.parse(
    fs.readFileSync(path.join(ROOT, "scenarios.json"), "utf8")
  );
  const only = parseOnly();
  const scenarios = spec.scenarios.filter((s) => !only || only.has(s.id));
  const runDir = path.join(
    ROOT,
    "runs",
    new Date().toISOString().replace(/[:.]/g, "-")
  );
  fs.mkdirSync(runDir, { recursive: true });

  const results = [];
  let apiKey = null;
  let workspaceSlug = null;
  let commonLocations = [];
  let embed = null;
  const seededCompanies = Object.keys(spec.seeds.companies);

  try {
    let setupError = null;
    try {
      apiKey = (await createDevApiKey()).secret;
      const primaryId = await resolveWorkspaceId(process.env.E2E_WORKSPACE_ID);
      const ws = await createTestWorkspace(primaryId);
      workspaceSlug = ws.slug;
      commonLocations = await seedCommonDocs(
        apiKey,
        ws.slug,
        spec.seeds.common
      );
      embed = createCompanyDocsEmbed(ws.id);
      info(`embed created: ${embed.uuid}`);
      await seedCompanyDocs(embed.uuid, spec.seeds.companies);
    } catch (e) {
      setupError = e.message;
      info(`SETUP FAILED: ${setupError}`);
    }

    for (const sc of scenarios) {
      let r;
      if (setupError) {
        r = { pass: false, reason: `setup failed: ${setupError}`, runs: [] };
      } else {
        try {
          r = await runScenario(embed.uuid, sc);
        } catch (e) {
          r = { pass: false, reason: e.message, runs: [] };
        }
      }
      results.push({ id: sc.id, title: sc.title, company: sc.company, ...r });
      const tally = r.repeat
        ? ` (${r.passed}/${r.repeat}, need ${r.minPass})`
        : "";
      info(
        `${r.pass ? "PASS" : "FAIL"} ${sc.id}${tally} ${sc.title}${r.reason ? ` — ${r.reason}` : ""}`
      );
      for (const run of r.runs.filter((x) => !x.pass).slice(0, 2)) {
        info(
          `    ${run.reasons.join("; ")} :: ${run.answer.replace(/\s+/g, " ").slice(0, 160)}`
        );
      }
    }
  } finally {
    if (process.env.E2E_KEEP === "1") {
      info(
        `E2E_KEEP=1 — cleanup skipped (embed ${embed?.uuid}, workspace ${workspaceSlug}, api key ${apiKey})`
      );
      return;
    }
    if (embed) {
      for (const companyName of seededCompanies) {
        try {
          await deleteAllCompanyDocs(embed.uuid, companyName);
        } catch (e) {
          info(`cleanup company docs ${companyName}: ${e.message}`);
        }
      }
    }
    if (embed) {
      try {
        deleteCompanyDocsEmbed(embed.uuid);
      } catch (e) {
        info(`cleanup embed: ${e.message}`);
      }
    }
    if (apiKey && workspaceSlug) {
      try {
        await v1(apiKey, "DELETE", `/v1/workspace/${workspaceSlug}`);
      } catch (e) {
        info(`cleanup workspace: ${e.message}`);
      }
      if (commonLocations.length) {
        try {
          await v1(apiKey, "DELETE", "/v1/system/remove-documents", {
            names: commonLocations,
          });
        } catch (e) {
          info(`cleanup common docs: ${e.message}`);
        }
      }
    }
    if (apiKey) await deleteDevApiKey(apiKey).catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(
    path.join(runDir, "result.json"),
    JSON.stringify(
      { serverUrl: SERVER_URL, passed, total: results.length, results },
      null,
      2
    )
  );
  info(
    `${passed}/${results.length} PASS — ${path.relative(process.cwd(), runDir)}/result.json`
  );
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
