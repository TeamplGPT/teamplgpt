#!/usr/bin/env node
"use strict";

/**
 * HR 라우팅 실패 후보 수확 스크립트 (P1-4 2단계)
 *
 * workspace_chats + workspace_llm_message_logs(tool_trace)를 기간 조회해
 * 휴리스틱 7종으로 "라우팅/인자 실패 후보"를 JSONL로 출력한다.
 * 후보는 사람이 검수·라벨링 후 dataset.jsonl에 `production` 태그로 편입한다
 * (이름·사번 등 개인정보 마스킹 필수 — 이 출력물은 원문 발화를 그대로 담는다).
 *
 * 휴리스틱:
 *  H1 가드레일 발동      tool 결과가 "> ⚠️" (resultIsGuardrail) — 인자 실패 확정 시그니처
 *  H2 미라우팅           HR 의도 발화인데 hr-* tool 호출 0회
 *  H3 되묻기             HR 의도 + tool 호출 0회 + 응답이 질문형 (H2의 강화형)
 *  H4 2단계 위반         hr-salary payslip/deductions/payslip_summary를 pay_periods 선행 없이 호출
 *  H5 헤맴               한 응답에 hr-* tool 3회 이상
 *  H6 유사 재시도        같은 스레드에서 직후(10분 내) 유사 발화 재질문 — 오라우팅 간접 신호
 *  H7 부정 피드백        feedbackScore=false + hr-* tool 사용
 *
 * 사용법 (server 디렉토리에서, DATABASE_URL 필요):
 *   node evals/hr-routing/harvest.js                          # 최근 7일
 *   node evals/hr-routing/harvest.js --since 2026-09-01 --until 2026-09-05
 *   node evals/hr-routing/harvest.js --workspace 3 --heuristics H1,H4 --verbose
 *   node evals/hr-routing/harvest.js --stats                  # 후보 파일 없이 집계만
 *
 * 출력: evals/hr-routing/harvest/<timestamp>.jsonl (--out으로 변경 가능)
 */

const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.resolve(__dirname, "../..");

// run.js와 동일한 env 로딩 (기본 development)
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
const envPath = path.join(SERVER_DIR, `.env.${process.env.NODE_ENV}`);
require("dotenv").config(
  fs.existsSync(envPath) ? { path: envPath } : { path: path.join(SERVER_DIR, ".env") }
);

const prisma = require(path.join(SERVER_DIR, "utils/prisma"));

// ---------- CLI ----------
function parseArgs(argv) {
  const args = {
    since: null,
    until: null,
    workspace: null,
    thread: null,
    heuristics: null,
    out: null,
    stats: false,
    verbose: false,
    limit: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") args.since = argv[++i];
    else if (a === "--until") args.until = argv[++i];
    else if (a === "--workspace") args.workspace = Number(argv[++i]);
    else if (a === "--thread") args.thread = Number(argv[++i]);
    else if (a === "--heuristics") args.heuristics = argv[++i].split(",").map((s) => s.trim().toUpperCase());
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--stats") args.stats = true;
    else if (a === "--verbose") args.verbose = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else {
      console.error(`알 수 없는 인자: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// ---------- 판정 유틸 ----------

// HR 의도 판별 키워드 (recall 우선 — 후보는 사람이 검수하므로 과포집 허용)
const HR_INTENT_RE = new RegExp(
  [
    "연차", "휴가", "반차", "월차", "보상휴가", "근태", "출근", "퇴근", "지각",
    "야근", "초과근무", "연장근무", "타임시트", "근무시간",
    "급여", "월급", "실수령", "명세서", "페이슬립", "공제", "4대\\s*보험", "원천징수", "일용직",
    "연말정산", "환급", "부양가족", "공제신고", "종전근무지",
    "증명서", "재직", "경력증명",
    "대출", "복리후생", "복지",
    "결재", "상신", "미결", "기안",
    "발령", "인사기록", "사번", "호봉", "직급", "경조",
    "가족\\s*(정보|사항|등록)", "교육\\s*(이력|수료|이수)",
  ].join("|")
);

// hr-salary 2단계 대상 query_type (pay_item 선확보 필요)
const SALARY_DETAIL_TYPES = new Set(["payslip", "deductions", "payslip_summary"]);

// 되묻기(질문형 응답) 판별
const COUNTER_QUESTION_RE =
  /(원하시나요|필요하신가요|말씀해\s*주|알려\s*주시(겠|면)|선택해\s*주|어떤\s*.{0,16}(조회|확인)|기간(을|이)\s*(알려|지정|말씀))/;

function isQuestionResponse(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return /[?？]\s*$/.test(trimmed) || COUNTER_QUESTION_RE.test(trimmed);
}

function parseJsonSafe(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

// toolTrace 항목의 arguments는 provider에 따라 string(JSON) 또는 object
function traceArgs(entry) {
  return parseJsonSafe(entry?.arguments, {}) || {};
}

function isHrCall(entry) {
  return typeof entry?.name === "string" && entry.name.startsWith("hr-");
}

// 발화 유사도: 공백/구두점 제거 후 문자 bigram Jaccard
function bigrams(s) {
  const norm = s.toLowerCase().replace(/[\s.,!?~․…'"“”()\[\]{}]/g, "");
  const set = new Set();
  for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const REASK_WINDOW_MS = 10 * 60 * 1000;
// 0.45는 실제 패러프레이즈(예: '지난달 월급 얼마 받았어?' vs '저번달 월급 얼마
// 받았는지 알려줘' = 0.375)를 놓침. 같은 스레드+10분 내 인접 조건이 이미 강해 0.35로.
const REASK_SIM_THRESHOLD = 0.35;

// ---------- 휴리스틱 ----------
function evaluateChat(chat, trace, responseText) {
  const hits = [];
  // trace === null: tool_trace 미기록(영속화 배포 이전 로그, react/chatSync 경로)
  // trace === []: tool 루프는 돌았으나 호출 0회 — H2/H3는 이 구분이 있어야만 판정 가능
  const traceKnown = Array.isArray(trace);
  const calls = traceKnown ? trace : [];
  const hrCalls = calls.filter(isHrCall);
  const hrIntent = HR_INTENT_RE.test(chat.prompt || "");

  // H1 가드레일 발동
  if (calls.some((t) => t.resultIsGuardrail === true)) hits.push("H1");

  // H2 미라우팅 / H3 되묻기
  if (traceKnown && hrIntent && hrCalls.length === 0) {
    hits.push("H2");
    if (isQuestionResponse(responseText)) hits.push("H3");
  }

  // H4 hr-salary 2단계 위반: detail 호출 시점까지 pay_periods 선행 없음
  let seenPayPeriods = false;
  for (const t of calls) {
    if (t.name !== "hr-salary") continue;
    const qt = traceArgs(t).query_type;
    if (qt === "pay_periods") seenPayPeriods = true;
    else if (SALARY_DETAIL_TYPES.has(qt) && !seenPayPeriods) {
      // 이전 대화에서 pay_item을 이미 확보한 정상 케이스일 수 있음 → 후보로만 표시
      hits.push("H4");
      break;
    }
  }

  // H5 헤맴
  if (hrCalls.length >= 3) hits.push("H5");

  // H7 부정 피드백
  if (chat.feedbackScore === false && hrCalls.length > 0) hits.push("H7");

  return hits;
}

// H6 유사 재시도: 스레드 단위로 시간순 인접 쌍 비교. 후보는 "앞" 발화.
function markReasks(rows) {
  const byThread = new Map();
  for (const row of rows) {
    const key = `${row.chat.workspaceId}|${row.chat.user_id ?? ""}|${row.chat.thread_id ?? ""}`;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key).push(row);
  }
  for (const group of byThread.values()) {
    group.sort((a, b) => new Date(a.chat.createdAt) - new Date(b.chat.createdAt));
    for (let i = 0; i < group.length - 1; i++) {
      const cur = group[i];
      const next = group[i + 1];
      const gapMs = new Date(next.chat.createdAt) - new Date(cur.chat.createdAt);
      if (gapMs > REASK_WINDOW_MS) continue;
      const sim = similarity(cur.chat.prompt || "", next.chat.prompt || "");
      if (sim >= REASK_SIM_THRESHOLD) {
        cur.heuristics.push("H6");
        cur.followupPrompt = next.chat.prompt;
        cur.followupSimilarity = Number(sim.toFixed(3));
      }
    }
  }
}

// ---------- 메인 ----------
async function main() {
  const args = parseArgs(process.argv);
  const until = args.until ? new Date(args.until) : new Date();
  const since = args.since
    ? new Date(args.since)
    : new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);

  const where = {
    createdAt: { gte: since, lt: until },
    ...(args.workspace ? { workspaceId: args.workspace } : {}),
    ...(args.thread ? { thread_id: args.thread } : {}),
  };

  const chats = await prisma.workspace_chats.findMany({
    where,
    include: { llm_message_log: true },
    orderBy: { createdAt: "asc" },
    ...(args.limit ? { take: args.limit } : {}),
  });

  const rows = [];
  for (const chat of chats) {
    const rawTrace = chat.llm_message_log?.tool_trace;
    const trace = rawTrace == null ? null : parseJsonSafe(rawTrace, null);
    const responseText =
      parseJsonSafe(chat.response, {})?.text ??
      chat.llm_message_log?.llm_response ??
      "";
    const heuristics = evaluateChat(chat, trace, responseText);
    rows.push({ chat, trace, responseText, heuristics });
  }
  markReasks(rows);

  let candidates = rows.filter((r) => r.heuristics.length > 0);
  if (args.heuristics) {
    candidates = candidates.filter((r) =>
      r.heuristics.some((h) => args.heuristics.includes(h))
    );
  }

  // 집계
  const counts = {};
  for (const r of candidates)
    for (const h of r.heuristics) counts[h] = (counts[h] || 0) + 1;

  console.log(`[harvest] 기간: ${since.toISOString()} ~ ${until.toISOString()}`);
  console.log(`[harvest] 조회 채팅: ${chats.length}건, 후보: ${candidates.length}건`);
  const LABELS = {
    H1: "가드레일 발동", H2: "미라우팅", H3: "되묻기", H4: "2단계 위반",
    H5: "헤맴(3회+)", H6: "유사 재시도", H7: "부정 피드백",
  };
  for (const h of Object.keys(LABELS)) {
    if (counts[h]) console.log(`  ${h} ${LABELS[h]}: ${counts[h]}건`);
  }

  if (args.verbose) {
    for (const r of candidates) {
      console.log(
        `  - [${r.heuristics.join(",")}] chat#${r.chat.id} ${JSON.stringify(
          (r.chat.prompt || "").slice(0, 60)
        )}`
      );
    }
  }

  if (args.stats) {
    console.log("[harvest] --stats: 파일 출력 생략.");
    return;
  }

  const outPath =
    args.out ||
    path.join(
      __dirname,
      "harvest",
      `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = candidates.map((r) =>
    JSON.stringify({
      chat_id: r.chat.id,
      created_at: r.chat.createdAt,
      workspace_id: r.chat.workspaceId,
      thread_id: r.chat.thread_id,
      user_id: r.chat.user_id,
      api_session_id: r.chat.api_session_id,
      feedback_score: r.chat.feedbackScore,
      heuristics: r.heuristics,
      prompt: r.chat.prompt,
      response_excerpt: (r.responseText || "").slice(0, 200),
      tool_trace_known: Array.isArray(r.trace),
      tool_calls: (r.trace || []).map((t) => ({
        round: t.round,
        name: t.name,
        query_type: traceArgs(t).query_type ?? null,
        isError: t.isError ?? null,
        resultIsGuardrail: t.resultIsGuardrail ?? null,
        durationMs: t.durationMs ?? null,
      })),
      ...(r.followupPrompt
        ? { followup_prompt: r.followupPrompt, followup_similarity: r.followupSimilarity }
        : {}),
    })
  );
  fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""));
  console.log(`[harvest] 출력: ${outPath}`);
  console.log(
    "[harvest] ⚠️ 출력물은 원문 발화 포함 — dataset.jsonl 편입 전 이름·사번 마스킹 필수."
  );
}

main()
  .catch((e) => {
    console.error("[harvest] 실패:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect?.());
