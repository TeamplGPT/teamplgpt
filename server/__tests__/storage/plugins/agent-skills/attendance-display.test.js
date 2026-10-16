/**
 * 근태 표 표시 보정 (_shared/attendanceDisplay) — 시각 HH:MM, 기준시간 분리
 */
const path = require("path");
const {
  toHHMM,
  formatTimes,
  splitBaseHours,
  prepareAttendanceTable,
} = require(path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared/attendanceDisplay.js"));

const COLUMNS = { workYmd: "일자", staTime: "출근", endTime: "퇴근", baseStaTime: "기준출근", baseEndTime: "기준퇴근", mark: "상태" };
const day = (workYmd, staTime, endTime, baseStaTime = "0900", baseEndTime = "1800") =>
  ({ workYmd, staTime, endTime, baseStaTime, baseEndTime, mark: "정상" });

describe("toHHMM", () => {
  it.each([
    ["0900", "09:00"],
    ["1805", "18:05"],
    ["09:00", "09:00"],
    ["", ""],
    [null, null],
    ["900", "900"],
    ["09시", "09시"],
  ])("%p → %p", (input, expected) => {
    expect(toHHMM(input)).toBe(expected);
  });
});

describe("formatTimes", () => {
  it("시각 칸만 바꾸고 원본은 그대로 둔다", () => {
    const rows = [{ ...day("20260301", "0855", "1810"), lateTime: "0010" }];
    const out = formatTimes(rows);
    expect(out[0]).toMatchObject({ staTime: "08:55", endTime: "18:10", baseStaTime: "09:00", lateTime: "0010" });
    expect(rows[0].staTime).toBe("0855");
  });
});

describe("splitBaseHours", () => {
  it("모든 날이 같으면 기준 두 열을 빼고 표 위 한 줄로 만든다", () => {
    const rows = formatTimes([day("1", "0855", "1810"), day("2", "0910", "1805")]);
    const out = splitBaseHours(rows, COLUMNS);
    expect(Object.values(out.columns)).toEqual(["일자", "출근", "퇴근", "상태"]);
    expect(out.basisLine).toBe("> 기준 근무시간 09:00 ~ 18:00\n\n");
    expect(out.rows).toBe(rows);
  });

  it("기준이 다른 날은 표 칸이 아니라 기준 줄에 날짜로 적는다", () => {
    const rows = formatTimes([day("20260701", "0855", "1810"), day("20260705", "1029", "", "1000", "2200"), day("20260706", "0850", "1800")]);
    const out = splitBaseHours(rows, COLUMNS);
    expect(Object.values(out.columns)).toEqual(["일자", "출근", "퇴근", "상태"]);
    expect(out.basisLine).toBe("> 기준 근무시간 09:00 ~ 18:00 (7/5는 10:00 ~ 22:00)\n\n");
    expect(out.rows).toBe(rows);
  });

  it("기준이 다른 날이 많으면 5일까지만 적고 나머지는 개수로", () => {
    const rows = formatTimes([
      ...Array.from({ length: 8 }, (_, i) => day(`2026070${i + 1}`, "0900", "1800")),
      ...Array.from({ length: 7 }, (_, i) => day(`2026071${i}`, "1000", "2200", "1000", "2200")),
    ]);
    const { basisLine } = splitBaseHours(rows, COLUMNS);
    expect(basisLine).toContain("7/10는 10:00 ~ 22:00");
    expect(basisLine).toContain("외 2일");
  });

  it("기준 열이 컬럼 정의에 없으면 그대로 돌려준다", () => {
    const columns = { workYmd: "일자", staTime: "출근" };
    const rows = [day("1", "0855", "1810")];
    expect(splitBaseHours(rows, columns)).toEqual({ rows, columns, basisLine: "" });
  });

  it("기준시간이 하나도 없으면 줄 없이 열만 뺀다", () => {
    const rows = [day("1", "", "", "", ""), day("2", "", "", "", "")];
    const out = splitBaseHours(rows, COLUMNS);
    expect(out.basisLine).toBe("");
    expect(out.columns).not.toHaveProperty("baseStaTime");
  });
});

describe("prepareAttendanceTable", () => {
  it("단일 객체 응답도 처리한다", () => {
    const out = prepareAttendanceTable(day("1", "0855", "1810"), COLUMNS);
    expect(out.rows[0].staTime).toBe("08:55");
    expect(out.basisLine).toContain("09:00 ~ 18:00");
  });
});
