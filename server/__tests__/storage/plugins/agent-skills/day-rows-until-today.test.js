/**
 * 출퇴근 기록·근무현황은 오늘까지만 (사용자 결정 2026-10-21: "그냥 오늘까지만 딱 보여주면 될거같은데")
 * 실서버: "출근내역 알려줘"(10/21)에 10/22~10/31이 "정상"으로 표에 나왔다 — 5240은 오지 않은 날에도
 * mark=NORMAL을 준다. 안내 줄은 붙이지 않는다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-10-21T10:00:00+09:00");

const day = (ymd, extra = {}) => ({ workYmd: ymd, week: "WED", mark: "NORMAL", baseStaTime: "16:00", baseEndTime: "02:00", ...extra });

function respond({ path }) {
  if (path !== "/TAAWrkTimeStatusMgr.do") throw new Error(`unexpected path ${path}`);
  return {
    DATA: [
      day("20261019", { mark: "ABNORMAL", workComment: "결근", absentYn: "결근" }),
      day("20261020", { workComment: "휴일" }),
      day("20261021", { staTime: "15:55", endTime: "", inTime: "15:55" }),
      day("20261022", { workComment: "휴일" }),
      day("20261030"),
      day("20261031", { workComment: "휴일" }),
    ],
  };
}

const tableDates = (output) =>
  output
    .split("\n")
    .filter((l) => /^\| \d/.test(l))
    .map((l) => l.split("|")[1].trim());

describe("하루 단위 표는 오늘까지만", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it.each(["timesheet", "work_status"])("%s: 오늘 이후 날짜는 표에 없다", async (query_type) => {
    const { output } = await runHandler("hr-attendance", { query_type }, respond);
    const dates = tableDates(output);
    expect(dates.length).toBe(3);
    expect(dates.join(" ")).toMatch(/10.?19/);
    expect(dates.join(" ")).toMatch(/10.?21/);
    expect(dates.join(" ")).not.toMatch(/10.?(22|30|31)/);
    expect(output).not.toMatch(/지나지 않은/);
  });

  it("오늘 이후만 있는 달이면 데이터 없음 안내", async () => {
    const future = () => ({ DATA: [day("20261105"), day("20261106")] });
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", year_month: "11월" }, future);
    expect(tableDates(output)).toEqual([]);
    expect(output).toMatch(/조회된 데이터가 없습니다|조회 결과가 존재하지 않습니다/);
  });

  it("근무캘린더(앞으로의 일정)는 그대로 미래 날짜를 보여준다", async () => {
    const cal = () => ({
      DATA: [
        { ymd: "20261021", workTypeNm: "주간근무", holidayNm: "", mark: "NORMAL" },
        { ymd: "20261030", workTypeNm: "주간근무", holidayNm: "", mark: "NORMAL" },
      ],
    });
    const { output } = await runHandler("hr-attendance", { query_type: "work_calendar" }, cal);
    expect(tableDates(output).join(" ")).toMatch(/10.?30/);
  });
});

// 실서버 형식(2026-10-21 ntest 확인): workYmd는 "10-22"(월-일, 연도 없음), 전체 날짜는 ymd("20261022")
describe("실서버 날짜 형식 — ymd로 판정", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  const real = (md, extra = {}) => ({ workYmd: md, ymd: `2026${md.replace("-", "")}`, week: "WED", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", ...extra });
  const respondReal = () => ({
    DATA: [real("10-20", { workComment: "출근", inTime: "0855", outTime: "1805" }), real("10-21", { workComment: "출근", inTime: "0855" }), real("10-22", { workComment: "교육" }), real("10-31", { workComment: "휴일" })],
  });

  it.each(["timesheet", "work_status"])("%s: workYmd가 월-일이어도 오늘 이후는 뺀다", async (query_type) => {
    const { output } = await runHandler("hr-attendance", { query_type }, respondReal);
    expect(output).toMatch(/10-20/);
    expect(output).toMatch(/10-21/);
    expect(output).not.toMatch(/10-22|10-31/);
  });

  it("오늘(10-21)은 출근만 있어도 출퇴근 누락이 아니다", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet" }, respondReal);
    expect(output).not.toMatch(/출퇴근 누락/);
  });
});
