/**
 * Mock HR API server for HR skill E2E tests.
 *
 * - Listens on $MOCK_PORT (default 8000) on 0.0.0.0
 * - Returns 200 {"success":true,"data":[],"message":"mock"} for all routes
 *   except /health which returns {"ok":true}
 * - Logs every request as one JSON Lines entry to the file passed via
 *   --log-path (or the --log-path env var), including method/path/query/headers.
 * - On SIGINT/SIGTERM, closes the server and exits 0 within ~1s.
 *
 * Spawned by runner.js. Not intended for direct production use.
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

function parseArgs(argv) {
  const args = { port: null, logPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = argv[i + 1];
    else if (argv[i] === "--log-path") args.logPath = argv[i + 1];
  }
  if (!args.port) args.port = process.env.MOCK_PORT || "8000";
  if (!args.logPath) args.logPath = process.env.MOCK_LOG_PATH || null;
  return args;
}

const { port, logPath } = parseArgs(process.argv.slice(2));
const portNum = Number.parseInt(port, 10);
if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
  process.stderr.write(`[mock-hr-api] invalid port: ${port}\n`);
  process.exit(1);
}

if (logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "");
}

function writeLog(entry) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (e) {
    process.stderr.write(`[mock-hr-api] log write failed: ${e.message}\n`);
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, false);
  const entry = {
    ts: new Date().toISOString(),
    method: req.method,
    path: parsed.pathname,
    query: parsed.query || "",
    fullUrl: req.url,
    headers: { host: req.headers.host || "" },
  };
  writeLog(entry);

  if (parsed.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data: [], message: "mock" }));
});

server.listen(portNum, "0.0.0.0", () => {
  process.stderr.write(
    `[mock-hr-api] listening on :${portNum}, logging to ${logPath || "(none)"}\n`
  );
});

function shutdown(signal) {
  process.stderr.write(`[mock-hr-api] shutdown on ${signal}\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
