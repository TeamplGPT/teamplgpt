#!/usr/bin/env node
"use strict";

/**
 * harvest.js 로컬 검증용 합성 픽스처 (P1-4 2단계)
 *
 * 휴리스틱 7종 각각을 정확히 트리거하는 양성 케이스 + 미포집 확인용 음성 케이스를
 * workspace_chats / workspace_llm_message_logs에 주입한다.
 * 모든 행은 api_session_id='harvest-fixture'로 표시되어 --cleanup으로 일괄 제거된다.
 *
 * 사용법 (server 디렉토리에서):
 *   node evals/hr-routing/seed-harvest-fixtures.js            # 주입 (기존 픽스처 제거 후)
 *   node evals/hr-routing/seed-harvest-fixtures.js --cleanup  # 제거만
 */

const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.resolve(__dirname, "../..");
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
const envPath = path.join(SERVER_DIR, `.env.${process.env.NODE_ENV}`);
require("dotenv").config(
  fs.existsSync(envPath) ? { path: envPath } : { path: path.join(SERVER_DIR, ".env") }
);

const prisma = require(path.join(SERVER_DIR, "utils/prisma"));

const FIXTURE_TAG = "harvest-fixture";
const FIXTURE_THREAD = 999901;

function resp(text) {
  return JSON.stringify({ text, sources: [], type: "chat", metrics: {} });
}

// toolTrace 픽스처 — 프로덕션은 openai-responses라 arguments는 JSON string
function tt(name, argsObj, extra = {}) {
  return {
    round: extra.round ?? 1,
    name,
    arguments: JSON.stringify(argsObj),
    resultLength: extra.resultLength ?? 120,
    durationMs: extra.durationMs ?? 300,
    isError: extra.isError ?? false,
    resultIsGuardrail: extra.resultIsGuardrail ?? false,
  };
}

async function cleanup(workspaceId) {
  const old = await prisma.workspace_chats.findMany({
    where: { api_session_id: FIXTURE_TAG },
    select: { id: true },
  });
  if (old.length) {
    await prisma.workspace_llm_message_logs.deleteMany({
      where: { chat_id: { in: old.map((c) => c.id) } },
    });
    await prisma.workspace_chats.deleteMany({
      where: { api_session_id: FIXTURE_TAG },
    });
  }
  console.log(`[fixtures] 기존 픽스처 ${old.length}건 제거.`);
}

async function main() {
  const ws = await prisma.workspaces.findFirst({ select: { id: true } });
  if (!ws) throw new Error("workspace가 없습니다. 앱에서 워크스페이스를 먼저 만드세요.");

  await cleanup(ws.id);
  if (process.argv.includes("--cleanup")) return;

  const base = Date.now();
  const at = (minAgo) => new Date(base - minAgo * 60 * 1000);

  // [prompt, response, trace|null, {feedbackScore, threadId, createdAt}]
  const cases = [
    // P1 → H1: 가드레일 발동
    ["연차 얼마나 남았어?", "조회 결과를 확인해주세요.",
      [tt("hr-attendance", { query_type: "annual_leave_balance" }, { resultIsGuardrail: true })],
      { createdAt: at(60) }],
    // P2 → H2: HR 의도인데 tool 0회 (미라우팅). []=루프 실행·호출 0회
    ["남은 연차 알려줘", "연차 관리는 인사팀에 문의해 주세요.", [], { createdAt: at(58) }],
    // P3 → H2+H3: tool 0회 + 되묻기
    ["급여 명세서 보여줘", "몇 월 급여 명세서를 원하시나요?", [], { createdAt: at(56) }],
    // P4 → H4: pay_periods 선행 없이 deductions 직행
    ["4대보험 얼마나 나갔어?", "공제 내역입니다.",
      [tt("hr-salary", { query_type: "deductions", pay_item: "20260625A" })],
      { createdAt: at(54) }],
    // P5 → H5: hr tool 3회 (헤맴)
    ["작년 근태랑 급여 정리해줘", "정리했습니다.",
      [
        tt("hr-attendance", { query_type: "timesheet" }, { round: 1 }),
        tt("hr-salary", { query_type: "pay_periods" }, { round: 2 }),
        tt("hr-salary", { query_type: "payslip_summary", pay_item: "X" }, { round: 3 }),
      ],
      { createdAt: at(52) }],
    // P6a+P6b → H6: 같은 스레드 2분 간격 유사 재질문 (앞 발화가 후보)
    ["지난달 월급 얼마 받았어?", "지난달 실수령액은 ...입니다.",
      [tt("hr-salary", { query_type: "salary_statement" })],
      { threadId: FIXTURE_THREAD, createdAt: at(50) }],
    ["저번달 월급 얼마 받았는지 알려줘", "지난달 급여는 ...입니다.",
      [tt("hr-salary", { query_type: "pay_periods" })],
      { threadId: FIXTURE_THREAD, createdAt: at(48) }],
    // P7 → H7: 부정 피드백 + hr tool 사용
    ["재직증명서 발급해줘", "재직증명서 신청 내역입니다.",
      [tt("hr-certificate", { query_type: "issuance_list" })],
      { feedbackScore: false, createdAt: at(46) }],
    // N1 → 미포집: HR 무관 발화, tool 없음
    ["오늘 점심 메뉴 추천해줘", "김치찌개는 어떠세요?", null, { createdAt: at(44) }],
    // N2 → 미포집: 정상 2단계 (pay_periods → payslip_summary, 2회)
    ["이번달 실수령액 알려줘", "이번 달 실수령액은 ...입니다.",
      [
        tt("hr-salary", { query_type: "pay_periods" }, { round: 1 }),
        tt("hr-salary", { query_type: "payslip_summary", pay_item: "Y" }, { round: 2 }),
      ],
      { createdAt: at(42) }],
    // N3 → 미포집: HR 발화지만 tool_trace 미기록(null) — 과거 로그는 H2 판정 불가
    ["연차 며칠 남았지?", "연차 조회 결과입니다.", null, { createdAt: at(40) }],
  ];

  for (const [prompt, text, trace, opts] of cases) {
    const chat = await prisma.workspace_chats.create({
      data: {
        workspaceId: ws.id,
        prompt,
        response: resp(text),
        api_session_id: FIXTURE_TAG,
        thread_id: opts.threadId ?? null,
        feedbackScore: opts.feedbackScore ?? null,
        createdAt: opts.createdAt,
        lastUpdatedAt: opts.createdAt,
      },
    });
    await prisma.workspace_llm_message_logs.create({
      data: {
        chat_id: chat.id,
        user_prompt: prompt,
        llm_response: text,
        tool_trace: Array.isArray(trace) ? JSON.stringify(trace) : null,
      },
    });
  }
  console.log(`[fixtures] ${cases.length}건 주입 완료 (workspace ${ws.id}, api_session_id='${FIXTURE_TAG}').`);
  console.log("[fixtures] 검증: node evals/hr-routing/harvest.js --since <1시간 전> --verbose --stats");
}

main()
  .catch((e) => {
    console.error("[fixtures] 실패:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect?.());
