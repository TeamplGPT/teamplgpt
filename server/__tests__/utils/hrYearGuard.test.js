/**
 * 지어낸 연도 막기 (사용자 결정 2026-10-19: "지어내는 건 절대 안 돼")
 * 실측: "6월 급여 지급 건 목록 알려줘"(연도 없음)에 모델이 year_month="2023-06"을 보내 2023년을 조회하고
 * "2023년 6월에는 …"이라고 답했다(오늘은 2026년). 시스템 지시(3·4항)를 어긴 것이라 서버에서 막는다.
 */
const {
  allowedYears,
  correctToolArgs,
  stripUnknownYears,
  yearsIn,
} = require("../../utils/hrYearGuard");

const NOW = new Date("2026-10-19T10:00:00+09:00");
const user = (text) => ({ role: "user", content: text });

describe("allowedYears — 연초의 하루·주 상대 표현(specs/020 코드 리뷰 M1)", () => {
  const JAN1 = new Date("2027-01-01T09:00:00+09:00");
  it.each(["어제 출근시각 알려줘", "그저께 퇴근 몇 시였어", "지난주 근무현황"])("%p → 작년도 허용", (text) => {
    expect(allowedYears([{ role: "user", content: text }], JAN1).has(2026)).toBe(true);
  });
  it("상대 표현이 없으면 작년은 허용하지 않는다", () => {
    expect(allowedYears([{ role: "user", content: "출근시각 알려줘" }], JAN1).has(2026)).toBe(false);
  });
});

describe("allowedYears — 사용자가 말한 연도 + 상대 표현 + 올해", () => {
  it.each([
    [["6월 급여 지급 건 목록 알려줘"], [2026]],
    [["2024년 3월 급여"], [2024, 2026]],
    [["24년 연말정산"], [2024, 2026]],
    [["작년 연장근무"], [2025, 2026]],
    [["재작년 연차"], [2024, 2026]],
    [["내년 근무일정"], [2026, 2027]],
    [["2023 급여", "그럼 6월은?"], [2023, 2026]],
  ])("%p → %p", (texts, expected) => {
    const years = allowedYears(texts.map(user), NOW);
    expect([...years].sort()).toEqual(expected);
  });

  it("Responses 형식(content 배열)도 읽는다", () => {
    const years = allowedYears([{ role: "user", content: [{ type: "input_text", text: "2022년 연말정산" }] }], NOW);
    expect(years.has(2022)).toBe(true);
  });
});

describe("correctToolArgs — 말하지 않은 연도는 떼고 조회", () => {
  const ALLOWED = new Set([2026]);
  const tc = (args) => ({ name: "hr-salary", call_id: "c", arguments: JSON.stringify(args) });

  it.each([
    [{ query_type: "pay_periods", year_month: "2023-06" }, { query_type: "pay_periods", year_month: "6월" }],
    [{ query_type: "pay_periods", year_month: "202306" }, { query_type: "pay_periods", year_month: "6월" }],
    [{ query_type: "pay_periods", year_month: "2023년 6월" }, { query_type: "pay_periods", year_month: "6월" }],
    [{ query_type: "salary_statement", year_month: "2023" }, { query_type: "salary_statement" }],
    [{ query_type: "salary_statement", year_month: "2023년" }, { query_type: "salary_statement" }],
  ])("%p → %p", (args, expected) => {
    const out = correctToolArgs(tc(args), ALLOWED);
    expect(out.corrected).toBe(true);
    expect(JSON.parse(out.tc.arguments)).toEqual(expected);
  });

  it.each([
    [{ query_type: "pay_periods", year_month: "2026-06" }],
    [{ query_type: "pay_periods", year_month: "6월" }],
    [{ query_type: "pay_periods", year_month: "지난달" }],
    [{ query_type: "pay_periods" }],
  ])("허용 연도·연도 없음은 그대로: %p", (args) => {
    const call = tc(args);
    const out = correctToolArgs(call, ALLOWED);
    expect(out.corrected).toBe(false);
    expect(out.tc).toBe(call);
  });

  it("연말정산 cal_yy는 올해·작년(귀속연도) 허용, 그 밖에 말하지 않은 연도는 뗀다", () => {
    const yta = (cal_yy) => ({ name: "hr-year-end-tax", call_id: "c", arguments: JSON.stringify({ query_type: "summary", cal_yy }) });
    expect(correctToolArgs(yta("2025"), ALLOWED).corrected).toBe(false);
    expect(JSON.parse(correctToolArgs(yta("2022"), ALLOWED).tc.arguments)).toEqual({ query_type: "summary" });
  });

  it.each([
    [{ query_type: "timesheet", date: "2023-10-15" }, { query_type: "timesheet", date: "10월 15일" }],
    [{ query_type: "timesheet", date: "20231015" }, { query_type: "timesheet", date: "10월 15일" }],
    [{ query_type: "timesheet", date: "2023년 10월 15일" }, { query_type: "timesheet", date: "10월 15일" }],
  ])("date도 말하지 않은 연도를 뗀다(specs/020) %p → %p", (args, expected) => {
    const out = correctToolArgs(tc(args), ALLOWED);
    expect(out.corrected).toBe(true);
    expect(JSON.parse(out.tc.arguments)).toEqual(expected);
  });

  it("date의 허용 연도·상대 표현은 그대로", () => {
    for (const date of ["2026-10-15", "오늘", "이번 주", "10월 15일"]) {
      expect(correctToolArgs(tc({ query_type: "timesheet", date }), ALLOWED).corrected).toBe(false);
    }
  });

  it("객체 인자도 처리하고 원본은 바꾸지 않는다", () => {
    const call = { name: "hr-attendance", call_id: "c", arguments: { query_type: "timesheet", year_month: "2023-07" } };
    const out = correctToolArgs(call, ALLOWED);
    expect(out.tc.arguments).toEqual({ query_type: "timesheet", year_month: "7월" });
    expect(call.arguments.year_month).toBe("2023-07");
  });

  it("HR tool이 아니면 그대로", () => {
    const call = { name: "web-browsing", call_id: "c", arguments: '{"q":"2023년"}' };
    expect(correctToolArgs(call, ALLOWED).tc).toBe(call);
  });
});

describe("stripUnknownYears — 답변 문장에서 근거 없는 'YYYY년'을 뗀다", () => {
  const ALLOWED = new Set([2026]);
  it.each([
    ["2023년 6월에는 1건 지급되었습니다.", "6월에는 1건 지급되었습니다."],
    ["2023년 6월 급여명세서는 조회되지 않았어요.", "6월 급여명세서는 조회되지 않았어요."],
    ["2026년 6월에는 1건이에요.", "2026년 6월에는 1건이에요."],
    ["6월에는 1건이에요.", "6월에는 1건이에요."],
  ])("%p → %p", (text, expected) => {
    expect(stripUnknownYears(text, ALLOWED)).toBe(expected);
  });

  it("조회 결과에 있는 연도는 남긴다", () => {
    const allowed = new Set([2026, ...yearsIn("> 조회 기간: 2025-01 ~ 2025-12 (2025년 전체)")]);
    expect(stripUnknownYears("2025년 연장근무는 총 90시간이에요.", allowed)).toBe("2025년 연장근무는 총 90시간이에요.");
  });
});

describe("@agent 경로 — wrapHrRuntime도 말하지 않은 연도 인자를 뗀다", () => {
  const { wrapHrRuntime } = require("../../utils/hrSelfDataNotice");

  it("aibitat 대화(USER)에 연도가 없으면 2023-06 → 6월로 handler 실행", async () => {
    const original = jest.fn().mockResolvedValue("> ⚠️ 조회 결과가 존재하지 않습니다.");
    const wrapped = wrapHrRuntime("hr-salary", { handler: original });
    const ctx = { super: { chats: [{ from: "USER", to: "@agent", content: "6월 급여 지급 건 목록 알려줘", state: "success" }] } };
    await wrapped.handler.call(ctx, { query_type: "pay_periods", year_month: "2023-06" });
    expect(original.mock.calls[0][0]).toEqual({ query_type: "pay_periods", year_month: "6월" });
  });

  it("사용자가 말한 연도는 그대로", async () => {
    const original = jest.fn().mockResolvedValue("ok");
    const wrapped = wrapHrRuntime("hr-salary", { handler: original });
    const ctx = { super: { chats: [{ from: "USER", content: "2023년 6월 급여 지급 건" }] } };
    await wrapped.handler.call(ctx, { query_type: "pay_periods", year_month: "2023-06" });
    expect(original.mock.calls[0][0].year_month).toBe("2023-06");
  });
});
