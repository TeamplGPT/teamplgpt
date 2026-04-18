/**
 * Dev API key helper for HR skill E2E tests.
 *
 * Uses `docker exec psql` against the existing `anythingllm-postgres`
 * container, so no new Node package (pg, prisma client, etc.) is required.
 *
 * Exports:
 *   createDevApiKey() -> { secret, id }
 *   deleteDevApiKey(secret) -> void
 *
 * The secret is prefixed with `E2E-DEV-` so it is trivially distinguishable
 * from production keys in audit logs. Callers must wrap deleteDevApiKey in
 * finally{} so the key is removed even when the run fails.
 */

"use strict";

const { execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");

const CONTAINER = process.env.E2E_PG_CONTAINER || "anythingllm-postgres";
const DB_USER = process.env.E2E_PG_USER || "anythingllm";
const DB_NAME = process.env.E2E_PG_DB || "anythingllm";

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

async function createDevApiKey() {
  assertContainerRunning();
  const secret = `E2E-DEV-${crypto.randomBytes(7).toString("hex")}`;
  const sql =
    `INSERT INTO api_keys (secret, "createdAt", "lastUpdatedAt") ` +
    `VALUES ('${secret}', NOW(), NOW()) RETURNING id;`;
  const raw = psql(sql).trim();
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    throw new Error(`API key INSERT failed (unexpected psql output): ${raw}`);
  }
  return { secret, id };
}

async function deleteDevApiKey(secret) {
  if (!secret) return;
  if (!/^E2E-DEV-[A-Fa-f0-9]+$/.test(secret)) {
    throw new Error(`refusing to DELETE non-E2E secret: ${secret}`);
  }
  psql(`DELETE FROM api_keys WHERE secret = '${secret}';`);
}

module.exports = { createDevApiKey, deleteDevApiKey };
