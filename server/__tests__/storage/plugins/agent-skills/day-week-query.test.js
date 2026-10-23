/**
 * 하루·주 조회 (specs/020 contracts/date-param.md §4·§5)
 * "오늘 출근시각 알려줘"에 한 달 표가 붙던 문제 — date가 오면 그 범위만 조회하고 그 범위 행만 보여준다.
 * 오늘 = 2026-10-23(금) 10:00 서울.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-10-23T10:00:00+09:00");
const WEEK_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (ymd) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
const ymdOf = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// 실서버 형식 행(workYmd "MM-DD" + ymd) — 요청 범위의 날마다 1행
function realRow(ymd) {
  const dow = toUtc(ymd).getUTCDay();
  return {
    workYmd: `${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`, ymd, week: WEEK_EN[dow], mark: "NORMAL",
    workComment: "출근", baseStaTime: "0900", baseEndTime: "1800",
    staTime: "0855", endTime: "1810", inTime: "0855", outTime: "1810", lateTime: "0",
  };
}

function rowsBetween(start, end) {
  const rows = [];
  for (let d = toUtc(start); ymdOf(d) <= end; d = new Date(d.getTime() + DAY_MS)) rows.push(realRow(ymdOf(d)));
  return rows;
}

// 요청 범위 행 + 범위 밖 한 행(서버가 범위를 무시해도 표에 새지 않는지)
function respondRange({ path, form }) {
  if (path === "/Home.do") return { Map: { workT: 82.5, basTime1: 171, basTime2: 53, basTime12: 128, remT: "88.5" } };
  if (path !== "/TAAWrkTimeStatusMgr.do") throw new Error(`unexpected path ${path}`);
  return { result: [...rowsBetween(form.searchBaseSYmd, form.searchBaseEYmd), realRow("20250101")] };
}

const tableDates = (output) =>
  output
    .split("\n")
    .filter((l) => /^\| \d/.test(l))
    .map((l) => l.split("|")[1].trim());

const rangeOf = (form) => [form.searchBaseSYmd, form.searchBaseEYmd, form.searchSYmd, form.searchEYmd];

describe("하루 조회 — 출퇴근 기록·근무현황 (US1)", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it.each(["timesheet", "work_status"])("%s date=오늘 → 오늘만 조회, 표도 오늘 한 줄", async (query_type) => {
    const { calls, output } = await runHandler("hr-attendance", { query_type, date: "오늘" }, respondRange);
    const att = calls.filter((c) => c.path === "/TAAWrkTimeStatusMgr.do");
    expect(att).toHaveLength(1);
    expect(rangeOf(att[0].form)).toEqual(["20261023", "20261023", "20261023", "20261023"]);
    expect(tableDates(output)).toEqual(["10-23"]);
    expect(output).toContain("> 조회 날짜: 10월 23일(금)");
  });

  it("work_status date=어제 → 근무시간(월) 블록 없음, 요약은 그 하루", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "work_status", date: "어제" }, respondRange);
    expect(calls.map((c) => c.path)).toEqual(["/TAAWrkTimeStatusMgr.do"]);
    expect(tableDates(output)).toEqual(["10-22"]);
    expect(output).toMatch(/집계\(1일\) · 출근 1일/);
    expect(output).not.toMatch(/월별 근무현황|최대 가능/);
  });

  it("date=10월 15일 → 그 날", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "10월 15일" }, respondRange);
    expect(rangeOf(calls[0].form)).toEqual(["20261015", "20261015", "20261015", "20261015"]);
    expect(tableDates(output)).toEqual(["10-15"]);
    expect(output).toContain("> 조회 날짜: 10월 15일(목)");
  });

  it("다른 해 날짜는 연도까지 적는다", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "2025년 3월 4일" }, respondRange);
    expect(output).toContain("> 조회 날짜: 2025년 3월 4일(화)");
  });

  it.each(["timesheet", "work_status"])("%s date=내일 → 조회하지 않고 지나지 않은 날 안내", async (query_type) => {
    const { calls, output } = await runHandler("hr-attendance", { query_type, date: "내일" }, respondRange);
    expect(calls).toHaveLength(0);
    expect(output).toBe("> ⚠️ 내일(10/24)은 아직 지나지 않은 날이라 출퇴근 기록이 없습니다.");
  });

  it("범위 행이 없으면 기록 없음 안내(지어내지 않음)", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "10월 15일" }, () => ({ result: [] }));
    expect(output).toContain("> ⚠️ 10월 15일 출퇴근 기록이 없습니다.");
    expect(tableDates(output)).toEqual([]);
  });

  it("서버가 범위 밖 행만 주면 기록 없음 안내", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "어제" }, () => ({ result: [realRow("20261001")] }));
    expect(output).toContain("> ⚠️ 어제(10/22) 출퇴근 기록이 없습니다.");
  });

  it("해석하지 못한 date → 날짜 안내, 조회 없음", async () => {
    const { UNRESOLVED_DATE } = require("../../../../storage/plugins/agent-skills/_shared/periodCheck");
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "저번 분기" }, respondRange);
    expect(calls).toHaveLength(0);
    expect(output).toBe(UNRESOLVED_DATE);
  });

  it("행은 왔는데 날짜를 하나도 읽지 못하면 '기록 없음'이라 단정하지 않는다(코드 리뷰 M3)", async () => {
    const noDate = () => ({ result: [{ week: "FRI", workComment: "출근", staTime: "0855" }] });
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "오늘" }, noDate);
    expect(output).not.toMatch(/기록이 없습니다/);
    expect(output).toContain("> ⚠️ 오늘(10/23) 출퇴근 기록의 날짜를 확인하지 못해 표시하지 않았습니다.");
  });

  it("조회 오류는 그대로 전한다", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "오늘" }, () => ({
      __raw: { ok: false, status: 500, body: "{}" },
    }));
    expect(output).toMatch(/⚠️/);
    expect(output).not.toMatch(/기록이 없습니다/);
  });

  it("date와 year_month가 같이 오면 date 우선", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance", { query_type: "timesheet", date: "오늘", year_month: "9월" }, respondRange
    );
    expect(rangeOf(calls[0].form)).toEqual(["20261023", "20261023", "20261023", "20261023"]);
    expect(tableDates(output)).toEqual(["10-23"]);
  });

  it.each([[undefined], [""], ["최근"]])("date=%p → 기존 월 조회 그대로", async (date) => {
    const params = date === undefined ? { query_type: "work_status" } : { query_type: "work_status", date };
    const { calls, output } = await runHandler("hr-attendance", params, respondRange);
    const att = calls.find((c) => c.path === "/TAAWrkTimeStatusMgr.do");
    expect(rangeOf(att.form)).toEqual(["20261001", "20261031", "20261001", "20261031"]);
    expect(calls.some((c) => c.path === "/Home.do")).toBe(true);
    expect(output).not.toMatch(/조회 날짜|조회 기간/);
  });
});

describe("한 주 조회 (US2)", () => {
  afterEach(() => jest.useRealTimers());

  it("이번 주 → 월요일~오늘까지 조회, 머리 줄은 그 주 월~일", async () => {
    freezeClock(NOW);
    const { calls, output } = await runHandler("hr-attendance", { query_type: "work_status", date: "이번 주" }, respondRange);
    expect(calls.map((c) => c.path)).toEqual(["/TAAWrkTimeStatusMgr.do"]);
    expect(rangeOf(calls[0].form)).toEqual(["20261019", "20261023", "20261019", "20261023"]);
    expect(tableDates(output)).toEqual(["10-19", "10-20", "10-21", "10-22", "10-23"]);
    expect(output).toContain("> 조회 기간: 10/19(월) ~ 10/25(일)");
    expect(output).toMatch(/집계\(5일\)/);
  });

  it("지난주 → 그 주 월~일 전부", async () => {
    freezeClock(NOW);
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "지난주" }, respondRange);
    expect(rangeOf(calls[0].form)).toEqual(["20261012", "20261018", "20261012", "20261018"]);
    expect(tableDates(output)).toHaveLength(7);
    expect(output).toContain("> 조회 기간: 10/12(월) ~ 10/18(일)");
  });

  it("두 달에 걸친 주(9/28~10/4, 오늘 10/2) → 한 번에 조회", async () => {
    freezeClock(new Date("2026-10-02T10:00:00+09:00"));
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "이번 주" }, respondRange);
    expect(rangeOf(calls[0].form)).toEqual(["20260928", "20261002", "20260928", "20261002"]);
    expect(tableDates(output)).toEqual(["09-28", "09-29", "09-30", "10-01", "10-02"]);
  });

  it("다음 주 → 지나지 않은 날 안내", async () => {
    freezeClock(NOW);
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "다음 주" }, respondRange);
    expect(calls).toHaveLength(0);
    // 조사는 라벨 앞말(주)에 맞춘다(코드 리뷰 L3)
    expect(output).toBe("> ⚠️ 다음 주(10/26~11/1)는 아직 지나지 않은 날이라 출퇴근 기록이 없습니다.");
  });
});

describe("근무캘린더·연장근무·인사 일정 (US3)", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  // 근무캘린더: 요청 달(searchSYmd~EYmd)의 날마다 1행
  function respondCalendar({ path, form }) {
    if (path !== "/TAADclzWorkSearchCldr.do") throw new Error(`unexpected path ${path}`);
    const rows = [];
    for (let d = toUtc(form.searchSYmd); ymdOf(d) <= form.searchEYmd; d = new Date(d.getTime() + DAY_MS)) {
      const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      rows.push({ ymd: ymdOf(d), workTypeNm: weekend ? "휴일" : "통상근무", holidayNm: "", mark: "" });
    }
    return { result: rows };
  }

  it("work_calendar date=내일 → 내일 한 줄(앞으로의 일정은 보여준다)", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "work_calendar", date: "내일" }, respondCalendar);
    expect(calls).toHaveLength(1);
    expect(calls[0].form.searchYm).toBe("202610");
    expect(tableDates(output)).toHaveLength(1);
    expect(tableDates(output)[0]).toMatch(/10.?24/);
    expect(output).toContain("> 조회 날짜: 10월 24일(토)");
  });

  it("work_calendar 두 달에 걸친 주 → 두 달 조회 후 그 주만", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance", { query_type: "work_calendar", date: "다음 주" }, respondCalendar
    );
    expect(calls.map((c) => c.form.searchYm)).toEqual(["202610", "202611"]);
    expect(tableDates(output)).toHaveLength(7);
    expect(output).toContain("> 조회 기간: 10/26(월) ~ 11/1(일)");
  });

  it("work_calendar 범위 행이 없으면 안내", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "work_calendar", date: "내일" }, () => ({ result: [] }));
    expect(output).toBe("> ⚠️ 내일(10/24) 근무일정이 없습니다.");
  });

  // 연장근무: 한도 1행 + 내역(15일·22일)
  function respondOvertime({ path, form }) {
    if (path === "/getMBLDclzWorkOtSchdul.do") {
      return { DATA: [{ lmtOt: 12, useOt: 4, remOt: 8, lmtOt2: 52, useOt2: 10, remOt2: 42 }] };
    }
    if (path === "/getMBLDclzWorkOtSchdulPerson.do") {
      return {
        DATA: [
          { workYmd: "20261015", staHm: "1800", endHm: "2000", otTime: "02:00", wktypeNm: "통상근무", reason: "" },
          { workYmd: "20261022", staHm: "1800", endHm: "2100", otTime: "03:00", wktypeNm: "통상근무", reason: "배포" },
        ],
      };
    }
    throw new Error(`unexpected path ${path}`);
  }

  it("overtime date=어제 → 한도 표 그대로 + 내역은 어제만", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "overtime", date: "어제" }, respondOvertime);
    const person = calls.find((c) => c.path === "/getMBLDclzWorkOtSchdulPerson.do");
    expect(person.form.searchBaseSYmd).toBe("2026-10-22");
    expect(person.form.searchBaseEYmd).toBe("2026-10-22");
    expect(output).toMatch(/\| 이번 주\(10\/23 기준\) \|/);
    expect(output).toMatch(/\| 이번 달\(10월\) \|/);
    expect(output).toContain("### 어제(10/22) 연장근무 내역");
    expect(output).toMatch(/10\/22\(목\)/);
    expect(output).not.toMatch(/10\/15/);
  });

  it("overtime 지난주 → 이번 주 한도 줄은 빼고 이번 달 줄만(D13), 주간 한도 조회 없음", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "overtime", date: "지난주" }, respondOvertime);
    expect(calls.some((c) => c.path === "/getMBLDclzWorkOtSchdul.do" && c.form.searchType === "2")).toBe(false);
    expect(output).not.toMatch(/이번 주\(/);
    expect(output).toMatch(/\| 이번 달\(10월\) \|/);
    expect(output).toContain("### 지난주(10/12~10/18) 연장근무 내역");
    expect(output).toMatch(/10\/15\(목\)/);
  });

  it("overtime 이번 주 안의 날(어제)·이번 주 → 주간 줄 유지", async () => {
    for (const date of ["어제", "이번 주", "이번 주 수요일"]) {
      const { output } = await runHandler("hr-attendance", { query_type: "overtime", date }, respondOvertime);
      expect(output).toMatch(/\| 이번 주\(10\/23 기준\) \|/);
    }
  });

  it("overtime 그 날 내역이 없으면 기록 없음", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "overtime", date: "10월 20일" }, respondOvertime);
    expect(output).toContain("> 10월 20일 연장근무 기록이 없습니다.");
    expect(output).toMatch(/\| 이번 달\(10월\) \|/);
  });

  it("overtime_limit 내일 → 한도 표 + 지나지 않은 날 안내, 내역 조회 없음", async () => {
    const { calls, output } = await runHandler("hr-attendance", { query_type: "overtime_limit", date: "내일" }, respondOvertime);
    expect(calls.some((c) => c.path === "/getMBLDclzWorkOtSchdulPerson.do")).toBe(false);
    expect(output).toMatch(/\| 이번 달\(10월\) \|/);
    expect(output).toContain("> ⚠️ 내일(10/24)은 아직 지나지 않은 날입니다.");
  });

  it("overtime date 없음 → 기존 그대로(내역 요청은 월초~오늘)", async () => {
    const { calls } = await runHandler("hr-attendance", { query_type: "overtime" }, respondOvertime);
    const person = calls.find((c) => c.path === "/getMBLDclzWorkOtSchdulPerson.do");
    expect([person.form.searchBaseSYmd, person.form.searchBaseEYmd]).toEqual(["2026-10-01", "2026-10-23"]);
  });

  it.each(["schedule_day", "schedule_titles"])("personnel %s date=오늘 → staYmd/endYmd = 오늘", async (query_type) => {
    const { calls } = await runHandler("hr-personnel", { query_type, date: "오늘" }, () => ({ DATA: [{ TITLE: "전사 워크숍", MD: "1023", RESULT: "1" }] }));
    expect([calls[0].form.staYmd, calls[0].form.endYmd]).toEqual(["20261023", "20261023"]);
  });

  it("personnel schedule_titles date=이번 주 → 그 주 월~일", async () => {
    const { calls } = await runHandler("hr-personnel", { query_type: "schedule_titles", date: "이번 주" }, () => ({ DATA: [{ TITLE: "추석" }] }));
    expect([calls[0].form.staYmd, calls[0].form.endYmd]).toEqual(["20261019", "20261025"]);
  });

  it("personnel date 해석 실패 → 안내, 조회 없음", async () => {
    const { calls, output } = await runHandler("hr-personnel", { query_type: "schedule_day", date: "abc" }, () => ({ DATA: [] }));
    expect(calls).toHaveLength(0);
    expect(output).toMatch(/날짜/);
  });

  it("해를 넘기는 주(오늘 2027-01-01) 출퇴근 → 12/28~1/1", async () => {
    freezeClock(new Date("2027-01-01T10:00:00+09:00"));
    const { calls, output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "이번 주" }, respondRange);
    expect(rangeOf(calls[0].form)).toEqual(["20261228", "20270101", "20261228", "20270101"]);
    expect(tableDates(output)).toEqual(["12-28", "12-29", "12-30", "12-31", "01-01"]);
    freezeClock(NOW);
  });

  it("지난달 날짜 연장근무 → 그 달 한도 표 + 그 날 내역(runMonth 경로)", async () => {
    const sept = ({ path }) =>
      path === "/getMBLDclzWorkOtSchdul.do"
        ? { DATA: [{ lmtOt2: 52, useOt2: 5, remOt2: 47 }] }
        : { DATA: [{ workYmd: "20260915", staHm: "1800", endHm: "2000", otTime: "02:00", wktypeNm: "통상근무" }] };
    const { calls, output } = await runHandler("hr-attendance", { query_type: "overtime", date: "9월 15일" }, sept);
    const person = calls.find((c) => c.path === "/getMBLDclzWorkOtSchdulPerson.do");
    expect([person.form.searchBaseSYmd, person.form.searchBaseEYmd]).toEqual(["2026-09-15", "2026-09-15"]);
    expect(output).toMatch(/\| 9월 \|/);
    expect(output).toContain("### 9월 15일 연장근무 내역");
  });
});
