/**
 * 출퇴근 기록·근무현황 "근무판정" 한 칸 (사용자 결정 2026-10-21)
 * - "상태"(MARK, NORMAL/ABNORMAL)는 5240 화면에 그대로 보이지 않는 아이콘 원재료라 뺀다 — 휴일·미래 날짜도 "정상"이었다.
 * - 지각·조퇴·결근 칸은 5240 출퇴근기록 화면(taaWrkTimeStatusMgr.jsp)의 "근무판정"처럼 한 칸으로 합친다.
 * - workComment는 5240 열 이름 그대로 "근무특이사항"(출퇴근 기록·근무현황 공통).
 * - 오늘은 아직 근무 중일 수 있어 출퇴근 누락으로 보지 않는다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-10-21T10:00:00+09:00");

const base = { week: "MON", baseStaTime: "0900", baseEndTime: "1800" };
const ROWS = [
  { ...base, workYmd: "20261012", mark: "NORMAL", inTime: "0855", outTime: "1805", staTime: "0855", endTime: "1805", workComment: "출근" },
  { ...base, workYmd: "20261013", mark: "ABNORMAL", inTime: "0920", outTime: "1700", staTime: "0920", endTime: "1700", lateYn: "지각", earlyYn: "조퇴", lateTime: "20", earlyTime: "60", workComment: "지각 / 조퇴" },
  { ...base, workYmd: "20261014", mark: "ABNORMAL", absentYn: "결근", workComment: "결근" },
  { ...base, workYmd: "20261015", mark: "ABNORMAL", inTime: "0850", staTime: "0850", workComment: "퇴근시간없음" },
  { ...base, workYmd: "20261017", week: "SAT", mark: "NORMAL", workComment: "휴일" },
  { ...base, workYmd: "20261016", mark: "NORMAL", inTime: "0900", outTime: "2100", staTime: "0900", endTime: "2100", otWorkOver: "3.0", workComment: "출근" },
  { ...base, workYmd: "20261020", mark: "NORMAL", annualLeave: "연차", workComment: "연차" },
  { ...base, workYmd: "20261021", mark: "NORMAL", inTime: "0855", staTime: "0855", workComment: "출근" },
];

const respond = () => ({ DATA: ROWS });

function parseTable(output) {
  const lines = output.split("\n").filter((l) => l.startsWith("|"));
  const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  const byDate = Object.fromEntries(rows.map((r) => [r[0].replace(/\D/g, "").slice(-4), Object.fromEntries(header.map((h, i) => [h, r[i]]))]));
  return { header, byDate };
}

describe("근무판정 한 칸", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it("출퇴근 기록: 상태·지각·조퇴·결근 칸 대신 근무판정, 특이사항은 근무특이사항", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet" }, respond);
    const { header } = parseTable(output);
    expect(header).toEqual(["일자", "요일", "출근", "퇴근", "근무판정", "근무특이사항"]);
  });

  it("근무현황: 상태 칸 없음, 근무내용 → 근무특이사항, 근무판정 추가", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, respond);
    const { header } = parseTable(output);
    expect(header).toContain("근무판정");
    expect(header).toContain("근무특이사항");
    expect(header).not.toContain("상태");
    expect(header).not.toContain("근무내용");
  });

  it.each([
    ["1012", "정상"],
    ["1013", "지각, 조퇴"],
    ["1014", "결근"],
    ["1015", "출퇴근 누락"],
    ["1017", ""],
    ["1016", "평일연장"],
    ["1020", "휴가"],
    ["1021", ""],
  ])("%s → 근무판정 %p", async (mmdd, verdict) => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet" }, respond);
    expect(parseTable(output).byDate[mmdd]["근무판정"]).toBe(verdict);
  });

  it("표 어디에도 정상/비정상 원재료(MARK)가 칸으로 나가지 않는다", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet" }, respond);
    expect(output).not.toMatch(/비정상|NORMAL/);
  });
});
