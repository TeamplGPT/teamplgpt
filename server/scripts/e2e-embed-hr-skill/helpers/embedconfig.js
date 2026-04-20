/**
 * Embed config lifecycle helper for embed-tool-calling E2E tests.
 *
 * Uses `docker exec psql` against the existing `anythingllm-postgres`
 * container — same pattern as ../e2e-hr-skill/helpers/apikey.js. This avoids
 * introducing a new Node dependency (pg / Prisma client) into the script tree.
 *
 * Exports:
 *   resolveWorkspaceId(env)            -> number
 *   createEmbedConfig(spec)            -> { uuid, id }
 *   cleanupEmbedConfigs()              -> { deleted }
 *
 * Safety:
 *   - All config names must match /^e2e-embed-[a-z0-9-]+$/.
 *   - cleanupEmbedConfigs() only deletes rows with uuid LIKE 'e2e-embed-%'.
 *
 * Design: docs/02-design/features/embed-tool-calling-e2e-runner.design.md §3, §9
 */

"use strict";

const { execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");

const CONTAINER = process.env.E2E_PG_CONTAINER || "anythingllm-postgres";
const DB_USER = process.env.E2E_PG_USER || "anythingllm";
const DB_NAME = process.env.E2E_PG_DB || "anythingllm";

const NAME_RE = /^e2e-embed-[a-z0-9-]+$/;
const UUID_PREFIX = "e2e-embed-";
const WORKSPACE_SLUG_PREFIX = "e2e-embed-ws-";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-tA", "-c", sql],
    { encoding: "utf8" }
  );
}

function assertContainerRunning() {
  const out = spawnSync(
    "docker",
    ["ps", "--filter", `name=^/${CONTAINER}$`, "--format", "{{.Names}}"],
    { encoding: "utf8" }
  );
  if (out.status !== 0 || !out.stdout.trim()) {
    throw new Error(
      `Postgres container "${CONTAINER}" is not running. ` +
        `Start it or set E2E_PG_CONTAINER env to the correct name.`
    );
  }
}

function assertColumnsExist() {
  const raw = psql(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_name='embed_configs' " +
      "AND column_name IN ('allow_tool_calling','allowed_skill_hashes');"
  ).trim();
  const cols = new Set(raw.split("\n").filter(Boolean));
  if (!cols.has("allow_tool_calling") || !cols.has("allowed_skill_hashes")) {
    throw new Error(
      "embed_configs.allow_tool_calling or allowed_skill_hashes column missing. " +
        "Phase 1-2 migration not applied. Run: cd server && npx prisma migrate deploy"
    );
  }
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`invalid number: ${value}`);
    return String(value);
  }
  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

async function resolveWorkspaceId(envValue) {
  assertContainerRunning();
  if (envValue !== null && envValue !== undefined && envValue !== "") {
    const n = Number.parseInt(envValue, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`E2E_WORKSPACE_ID must be a positive integer, got: ${envValue}`);
    }
    const exists = psql(
      `SELECT id FROM workspaces WHERE id = ${n} LIMIT 1;`
    ).trim();
    if (!exists) {
      throw new Error(`workspace id=${n} does not exist in DB`);
    }
    return n;
  }
  const raw = psql("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1;").trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(
      "no workspace exists. Create one via UI or set E2E_WORKSPACE_ID."
    );
  }
  return n;
}

/**
 * Create a dedicated test workspace with no vectors — RAG returns empty
 * context, so the LLM must rely on tools. The workspace inherits LLM config
 * from the primary workspace (chatProvider/chatModel) to match production
 * behavior.
 *
 * Slug is unique per run (timestamped) to avoid namespace collisions.
 *
 * @param {number} primaryWorkspaceId  source of LLM config to copy
 * @returns {Promise<{id: number, slug: string}>}
 */
async function createTestWorkspace(primaryWorkspaceId) {
  assertContainerRunning();
  const slug = `${WORKSPACE_SLUG_PREFIX}${crypto.randomBytes(4).toString("hex")}`;
  const name = `E2E Embed Test ${Date.now()}`;
  // Copy chatProvider/chatModel from the primary workspace so the test uses
  // the same LLM as production. Null-safe via COALESCE.
  const sql =
    `INSERT INTO workspaces ` +
    `(name, slug, "chatProvider", "chatModel", "chatMode", "openAiHistory", "createdAt", "lastUpdatedAt") ` +
    `SELECT ${sqlQuote(name)}, ${sqlQuote(slug)}, "chatProvider", "chatModel", 'chat', 20, NOW(), NOW() ` +
    `FROM workspaces WHERE id = ${sqlQuote(primaryWorkspaceId)} ` +
    `RETURNING id;`;
  const raw = psql(sql).trim();
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    throw new Error(`test workspace INSERT failed (output: ${raw})`);
  }
  return { id, slug };
}

async function cleanupTestWorkspaces() {
  assertContainerRunning();
  const raw = psql(
    `WITH deleted AS (` +
      `DELETE FROM workspaces WHERE slug LIKE '${WORKSPACE_SLUG_PREFIX}%' RETURNING id` +
      `) SELECT COUNT(*) FROM deleted;`
  ).trim();
  const deleted = Number.parseInt(raw, 10) || 0;
  return { deleted };
}

/**
 * Create a test embed_config row.
 *
 * @param {Object} spec
 * @param {string} spec.name              unique within this run (matches scenarios.embed_config)
 * @param {number} spec.workspaceId
 * @param {boolean} spec.allowToolCalling
 * @param {string|null} spec.allowedSkillHashes  csv (null = no filter)
 * @returns {Promise<{uuid: string, id: number}>}
 */
async function createEmbedConfig(spec) {
  assertContainerRunning();
  assertColumnsExist();
  if (!NAME_RE.test(spec.name)) {
    throw new Error(
      `invalid embed config name "${spec.name}" (must match ${NAME_RE})`
    );
  }
  const uuid = `${UUID_PREFIX}${spec.name.replace(/^e2e-embed-/, "")}-${crypto
    .randomBytes(4)
    .toString("hex")}`;
  // Columns: uuid, enabled, chat_mode, workspace_id, allow_tool_calling,
  // allowed_skill_hashes, allow_prompt_override, allowlist_domains, createdAt
  // (embed_configs has no updatedAt — see server/prisma/schema.prisma)
  //
  // allow_prompt_override=true lets the runner pass a tool-friendly system
  // prompt per request, isolating this test from the workspace's document-
  // bound system prompt (which otherwise suppresses tool calls).
  const sql =
    `INSERT INTO embed_configs ` +
    `(uuid, enabled, chat_mode, workspace_id, allow_tool_calling, ` +
    ` allowed_skill_hashes, allow_prompt_override, allowlist_domains, "createdAt") ` +
    `VALUES (` +
    `${sqlQuote(uuid)}, true, 'chat', ${sqlQuote(spec.workspaceId)}, ` +
    `${sqlQuote(!!spec.allowToolCalling)}, ${sqlQuote(
      spec.allowedSkillHashes === undefined ? null : spec.allowedSkillHashes
    )}, true, NULL, NOW()` +
    `) RETURNING id;`;
  const raw = psql(sql).trim();
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    throw new Error(`embed_configs INSERT failed (output: ${raw})`);
  }
  return { uuid, id };
}

async function cleanupEmbedConfigs() {
  assertContainerRunning();
  const raw = psql(
    `WITH deleted AS (` +
      `DELETE FROM embed_configs WHERE uuid LIKE '${UUID_PREFIX}%' RETURNING id` +
      `) SELECT COUNT(*) FROM deleted;`
  ).trim();
  const deleted = Number.parseInt(raw, 10) || 0;
  return { deleted };
}

module.exports = {
  resolveWorkspaceId,
  createTestWorkspace,
  cleanupTestWorkspaces,
  createEmbedConfig,
  cleanupEmbedConfigs,
  UUID_PREFIX,
  WORKSPACE_SLUG_PREFIX,
};
