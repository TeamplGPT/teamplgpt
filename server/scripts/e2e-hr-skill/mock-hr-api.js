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

const BODYLESS_METHODS = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

// 012-hr-answer-quality: cmd 기반 fixture (답변 품질 E2E의 answer_pattern 검증용).
// 미등록 cmd는 기존 빈 응답 유지 — 기존 시나리오(tool_call/url/body 검증) 무영향.
const FIXTURES_BY_CMD = {
  // 연차 발생/사용/잔여 (TAA-1310) — Q1/Q2: 연차 잔여 22 + 무관 휴가종류 1건
  getTAADclzVcatnList1: {
    result: [
      { workNm: "연차", creDd: "23", useDd: "1", remDd: "22", staYmd: "20260101", endYmd: "20261231" },
      { workNm: "배우자출산휴가(유급)", creDd: "20", useDd: "0", remDd: "20", staYmd: "20260101", endYmd: "20261231" },
    ],
  },
  // 휴가 사용내역 (TAA-0490) — Q4: 2건 전건 포함(과요약 방지)
  getTAADclzVcatnList2: {
    result: [
      { ymd: "20260710", week: "금", leavNm: "연차", useDd: "1", reason: "개인사유" },
      { ymd: "20260721", week: "화", leavNm: "반차", useDd: "0.5", reason: "병원" },
    ],
  },
  // 근무현황/출퇴근기록 (TAA-1410) — Q3: 지각 1건(07-03, 10분) / Q6: 특정일 발췌.
  // 실측 42필드 superset: timesheet 화이트리스트(staTime/endTime/lateYn 등)와
  // work_status 화이트리스트(inTime/outTime/lateTime 등) 키를 모두 포함해야
  // 두 query_type 렌더가 모두 채워진다 (kiwibox-endpoint-test-guide §3.2).
  getTAAWrkTimeStatusMgrList: {
    result: [
      { workYmd: "20260701", week: "수", workComment: "출근", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0855", endTime: "1810", inTime: "0855", outTime: "1810", lateYn: "N", earlyYn: "N", absentYn: "N", lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" },
      { workYmd: "20260703", week: "금", workComment: "출근", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0910", endTime: "1805", inTime: "0910", outTime: "1805", lateYn: "Y", earlyYn: "N", absentYn: "N", lateTime: "10", earlyTime: "0", goOutTime: "0", otTime: "0" },
      { workYmd: "20260706", week: "월", workComment: "출근", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0850", endTime: "1800", inTime: "0850", outTime: "1800", lateYn: "N", earlyYn: "N", absentYn: "N", lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" },
    ],
  },
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, false);
  const baseEntry = {
    ts: new Date().toISOString(),
    method: req.method,
    path: parsed.pathname,
    query: parsed.query || "",
    fullUrl: req.url,
    headers: { host: req.headers.host || "" },
  };

  function respond(parsedBody) {
    if (parsed.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else if (parsed.pathname === "/CommonCode.do") {
      // 급여 2단 체인용 fixture: pay_periods(getSalYmdTypeCdList2) 응답 —
      // LLM이 code(20260619P)를 pay_item으로 이어 호출할 수 있게 한다 (specs/011 K10).
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          codeList: [
            { codeNm: "2026-06-19 급여", code: "20260619P", colorCode: null },
          ],
        })
      );
    } else if (parsedBody && parsedBody.cmd && FIXTURES_BY_CMD[parsedBody.cmd]) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(FIXTURES_BY_CMD[parsedBody.cmd]));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: [], message: "mock" }));
    }
  }

  // Fast-path: body 없는 메서드는 즉시 logging + 응답 + drain
  // (GET 요청은 'end' 이벤트가 환경에 따라 지연될 수 있어 응답 누락 발생)
  if (BODYLESS_METHODS.has(req.method)) {
    writeLog({ ...baseEntry, body: null });
    respond(null);
    req.resume();
    return;
  }

  // body 있는 메서드: cmd 기반 fixture 선택을 위해 body 수신 완료 후 응답
  // (클라이언트가 body+end를 보내는 POST는 'end' 지연 문제 없음 — GET fast-path만 별도)
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // kiwibox 계열은 urlencoded — 객체 파싱 + 원문(_raw) 병기 (runner body 검증용)
        if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(rawBody)) {
          parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
          parsedBody._raw = rawBody;
        } else {
          parsedBody = { _raw: rawBody };
        }
      }
    }
    writeLog({ ...baseEntry, body: parsedBody });
    respond(parsedBody);
  });
  req.on("error", (e) => {
    writeLog({ ...baseEntry, body: { _error: e.message } });
  });
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
