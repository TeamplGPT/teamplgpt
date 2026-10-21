/**
 * 기간을 말했는데 해석하지 못하면 조회하지 않고 안내한다(2026-10-21 사용자 결정, 버그 경로).
 * 전에는 skill마다 이번 달·최근 3개월·최신 연도로 조용히 바꿔 조회해, 말한 기간과 다른 값이 나갔다.
 * "최근"·"요즘"·"전체"처럼 기간을 정하지 않는 말은 지정하지 않은 것과 같게 본다.
 */
const path = require("path");
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const { periodProblem, cleanPeriod, UNRESOLVED_PERIOD } = require(path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/_shared/periodCheck.js"
));

const NOW = new Date("2026-10-21T10:00:00+09:00");

describe("periodProblem / cleanPeriod", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it.each([[undefined], [null], [""], ["  "], ["3"], ["지난달"], ["2026년"], ["작년"], ["202509"], ["2025-03"], ["올해 3월"], ["이번 주"], ["최근"], ["요즘"], ["전체"]])(
    "%p → 문제 없음",
    (v) => {
      expect(periodProblem(v)).toBeNull();
    }
  );

  it.each([["abc"], ["13월"], ["상반기"], ["1분기"], ["최근 3개월"], ["작년 이맘때"], ["202600"], ["202613"]])("%p → 안내", (v) => {
    expect(periodProblem(v)).toBe(UNRESOLVED_PERIOD);
  });

  it("year 형식(연말정산 cal_yy)", () => {
    expect(periodProblem("2025", "year")).toBeNull();
    expect(periodProblem("작년", "year")).toBeNull();
    expect(periodProblem("재작년", "year")).toBeNull();
    expect(periodProblem("abc", "year")).toBe(UNRESOLVED_PERIOD);
  });

  it("기간을 정하지 않는 말은 undefined로(지정 없음과 같게)", () => {
    expect(cleanPeriod("최근")).toBeUndefined();
    expect(cleanPeriod(" 전체 ")).toBeUndefined();
    expect(cleanPeriod("3월")).toBe("3월");
    expect(cleanPeriod(undefined)).toBeUndefined();
  });

  it("안내 문구에 입력값을 싣지 않는다(모델이 만든 값이 사용자 화면에 그대로 나가지 않게)", () => {
    expect(UNRESOLVED_PERIOD).not.toMatch(/abc/);
    expect(UNRESOLVED_PERIOD).toMatch(/^> ⚠️ /);
  });
});

describe("handler — 해석 못 한 기간이면 HR 조회 없이 안내", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  const anyRespond = () => ({ DATA: [{ a: 1 }] });

  it.each([
    ["hr-attendance", { query_type: "timesheet", year_month: "abc" }],
    ["hr-attendance", { query_type: "work_status", year_month: "abc" }],
    ["hr-attendance", { query_type: "work_calendar", year_month: "abc" }],
    ["hr-attendance", { query_type: "leave_requests", year_month: "abc" }],
    ["hr-attendance", { query_type: "overtime", year_month: "abc" }],
    ["hr-attendance", { query_type: "work_hours", year_month: "abc" }],
    ["hr-personnel", { query_type: "schedule_day", year_month: "abc" }],
    ["hr-salary", { query_type: "pay_periods", year_month: "abc" }],
    ["hr-approval", { query_type: "drafted", year_month: "abc" }],
    ["hr-year-end-tax", { query_type: "summary", cal_yy: "abc" }],
  ])("%s %p", async (skill, params) => {
    const { calls, output } = await runHandler(skill, params, anyRespond);
    expect(calls).toHaveLength(0);
    expect(output).toBe(UNRESOLVED_PERIOD);
  });

  it.each([
    ["hr-attendance", { query_type: "timesheet", year_month: "최근" }],
    ["hr-approval", { query_type: "drafted", year_month: "요즘" }],
    ["hr-salary", { query_type: "pay_periods", year_month: "전체" }],
  ])("기간을 정하지 않는 말은 지정 없음처럼 조회한다 %s %p", async (skill, params) => {
    const { calls, output } = await runHandler(skill, params, anyRespond);
    expect(calls.length).toBeGreaterThan(0);
    expect(output).not.toBe(UNRESOLVED_PERIOD);
  });

  it("연차 잔여는 기간을 쓰지 않으므로 이상한 값이 와도 그대로 조회한다", async () => {
    const { calls } = await runHandler("hr-attendance", { query_type: "annual_leave_balance", year_month: "abc" }, anyRespond);
    expect(calls.length).toBeGreaterThan(0);
  });
});
