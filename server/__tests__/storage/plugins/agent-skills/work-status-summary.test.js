/**
 * 근무현황(work_status) 표·요약 — 5240 근무현황 화면(taaWrkTimeStatusMgr.jsp)의 분류를 그대로 쓴다
 * (2026-11-17 사용자 결정: 해당하는 날만, 해당하는 분류만, 표는 여섯 칸).
 * - 정상 출퇴근: 출근·퇴근이 찍혔고 지각·조퇴·결근·출퇴근 누락이 없음
 * - 출퇴근 특이사항: 지각·조퇴·결근·출퇴근 누락
 * - 근무예외사항: 휴가·출장·교육
 * - 연장근로: 승인 OT가 있는 날(있을 때만)
 * 휴일·기록 없는 날은 표에도 요약에도 나오지 않는다. 분류는 5240 화면처럼 겹칠 수 있다(반차 출근 = 정상 + 휴가).
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-10-21T10:00:00+09:00");
const day = (md, extra = {}) => ({ workYmd: md, ymd: `2026${md.replace("-", "")}`, week: "MON", mark: "NORMAL", minusDd: 1, baseStaTime: "0900", baseEndTime: "1800", ...extra });
const punch = { inTime: "0855", outTime: "1805" };

const outputOf = async (rows, params = {}) => {
  const { output } = await runHandler("hr-attendance", { query_type: "work_status", ...params }, (req) =>
    req.path === "/Home.do" ? { Map: {} } : { DATA: rows }
  );
  return output;
};
const summaryOf = async (rows) => (await outputOf(rows)).split("\n").find((l) => l.startsWith("> 요약"));
const tableHeaderOf = (output) => output.split("\n").find((l) => l.startsWith("| 일자"));
const tableDates = (output) =>
  output
    .split("\n")
    .filter((l) => /^\| \d{2}-\d{2} \|/.test(l))
    .map((l) => l.split("|")[1].trim());

describe("근무현황 요약 줄 — 해당하는 분류만", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it("4월 실사례: 출근 1 · 출장 1 · 결근 12 · 휴일 8 · 기록 없음 8 → 휴일·기록 없음은 빼고 5240 묶음으로", async () => {
    const rows = [
      day("04-01", punch),
      day("04-02", { bizTrip: "부산" }),
      ...Array.from({ length: 12 }, (_, i) => day(`04-${String(i + 3).padStart(2, "0")}`, { absentYn: "결근", mark: "ABNORMAL", workComment: "결근" })),
      ...Array.from({ length: 8 }, (_, i) => day(`04-${String(i + 15).padStart(2, "0")}`, { minusDd: 0, workComment: "휴일" })),
      ...Array.from({ length: 8 }, (_, i) => day(`04-${String(i + 23).padStart(2, "0")}`, { workComment: "휴일" })),
    ];
    // 5240 근태현황(월)과 같게 — 출퇴근 기록 없는 출장일(04-02)도 5240 판정이 정상이면 정상 출퇴근
    expect(await summaryOf(rows)).toBe(
      "> 요약: 정상 출퇴근 2일 · 출퇴근 특이사항(결근 12일) · 근무예외사항(출장 1일)"
    );
  });

  it("4월 실데이터 모양: 5240 근태현황(월) 정상 2 · 특이 12 · 예외 2와 같다", async () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => day(`04-${String(i + 1).padStart(2, "0")}`, { absentYn: "결근", mark: "ABNORMAL", workComment: "결근" })),
      ...Array.from({ length: 16 }, (_, i) => day(`04-${String(i + 13).padStart(2, "0")}`, { minusDd: i < 8 ? 0 : 1, workComment: "휴일" })),
      day("04-29", { bizTrip: "출장(국내)()", workComment: "출장(국내)()" }),
      day("04-30", { inTime: "0800", outTime: "1730", bizTrip: "외근(지역, 13:00-16:00)", workComment: "출근 / 외근(지역, 13:00-16:00) / 휴일근무" }),
    ];
    expect(await summaryOf(rows)).toBe(
      "> 요약: 정상 출퇴근 2일 · 출퇴근 특이사항(결근 12일) · 근무예외사항(출장 2일)"
    );
  });

  it("5240 판정이 정상이 아닌 날(ABNORMAL)은 출퇴근이 찍혀도 정상 출퇴근이 아니다, 연장근로일은 정상", async () => {
    const rows = [
      day("10-01", { ...punch, mark: "ABNORMAL" }),
      day("10-02", { ...punch, mark: "", otWorkOver: "2.0" }),
    ];
    expect(await summaryOf(rows)).toBe("> 요약: 정상 출퇴근 1일 · 연장근로 1일(승인 2.0h)");
  });

  it("지각·조퇴·출퇴근 누락은 출퇴근 특이사항, 휴가·출장·교육은 근무예외사항(오늘은 누락 아님)", async () => {
    const rows = [
      day("10-13", { inTime: "0910", outTime: "1700", lateYn: "지각", earlyYn: "조퇴" }),
      day("10-14", { inTime: "0855" }),
      day("10-15", { annualLeave: "연차", mark: "" }),
      day("10-16", { education: "사내교육", mark: "" }),
      day("10-21", { inTime: "0855" }),
    ];
    // 오늘(10-21)은 출근만 있어도 누락이 아니라 근무 중 — 5240 판정이 정상이면 정상 출퇴근
    expect(await summaryOf(rows)).toBe(
      "> 요약: 정상 출퇴근 1일 · 출퇴근 특이사항(지각 1회, 조퇴 1회, 출퇴근 누락 1일) · 근무예외사항(휴가 1일, 교육 1일)"
    );
  });

  it("반차로 출근한 날은 5240 화면처럼 정상 출퇴근과 휴가에 모두 센다", async () => {
    const rows = [day("10-02", { ...punch, annualLeave: "반차" })];
    expect(await summaryOf(rows)).toBe("> 요약: 정상 출퇴근 1일 · 근무예외사항(휴가 1일)");
  });

  it("연장근로는 있을 때만", async () => {
    const rows = [
      day("10-01", punch),
      day("10-03", { ...punch, minusDd: 0, workComment: "휴일근무", otHoliWork: "4.0" }),
    ];
    expect(await summaryOf(rows)).toBe("> 요약: 정상 출퇴근 2일 · 연장근로 1일(승인 4.0h)");
  });

  it("휴일·기록 없음 일수는 어디에도 쓰지 않는다", async () => {
    const out = await outputOf([day("10-01", punch), day("10-04", { minusDd: 0, workComment: "휴일" }), day("10-06")]);
    expect(out).not.toMatch(/휴일 \d+일|기록 없음|집계\(/);
  });
});

describe("근무현황 표 — 여섯 칸, 해당하는 날만", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it("표는 일자·요일·근무판정·근무특이사항·출근·퇴근 여섯 칸", async () => {
    const out = await outputOf([
      day("10-01", { ...punch, workComment: "출근", lateTime: "0", otTime: "0" }),
      day("10-02", { bizTrip: "부산", workComment: "출장", annualLeave: "", education: "" }),
    ]);
    expect(tableHeaderOf(out)).toBe("| 일자 | 요일 | 근무판정 | 근무특이사항 | 출근 | 퇴근 |");
    // 칸 이름은 머리글 줄에서만 본다 — 근무판정 칸의 값 "출장"은 그대로 나와야 한다
    expect(tableHeaderOf(out)).not.toMatch(/지각\(분\)|조퇴\(분\)|외출\(분\)|연장\(분\)|\| (연차|기타휴가|출장|교육|휴직) \|/);
  });

  it("휴일·기록 없는 날은 표에서 빠지고, 정상·특이사항·예외·연장근로 날만 남는다", async () => {
    const out = await outputOf([
      day("10-01", punch),
      day("10-02", { absentYn: "결근", mark: "ABNORMAL", workComment: "결근" }),
      day("10-03", { bizTrip: "부산" }),
      day("10-04", { minusDd: 0, workComment: "휴일" }),
      day("10-05", { minusDd: 0, workComment: "휴일근무", inTime: "1000", outTime: "1400", otHoliWork: "4.0" }),
      day("10-06", { workComment: "휴일" }),
      day("10-07"),
    ]);
    expect(tableDates(out)).toEqual(["10-01", "10-02", "10-03", "10-05"]);
  });

  it("해당하는 날이 하나도 없으면 빈 표 대신 한 줄 안내", async () => {
    const out = await outputOf([day("10-04", { minusDd: 0, workComment: "휴일" }), day("10-06")]);
    expect(out).toMatch(/이 기간에는 출퇴근·특이사항·예외 기록이 없습니다\./);
    expect(tableHeaderOf(out)).toBeUndefined();
    expect(out).not.toMatch(/> 요약/);
  });

  it("하루·주 조회도 같은 규칙", async () => {
    const out = await outputOf(
      [day("10-19", { workComment: "휴일" }), day("10-20", punch)],
      { date: "이번 주" }
    );
    expect(tableDates(out)).toEqual(["10-20"]);
  });
});

describe("근무현황 — 분 단위 값은 AI만 읽는 줄로 (2026-11-17 사용자 결정)", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  const detailLineOf = (out) => out.split("\n").find((l) => l.startsWith("> [근무 상세(분)]"));

  it("0이 아닌 지각·조퇴·외출·연장 분을 날짜별로 한 줄에 넘긴다", async () => {
    const out = await outputOf([
      day("10-13", { inTime: "0910", outTime: "1700", lateYn: "지각", earlyYn: "조퇴", lateTime: "10", earlyTime: "60", goOutTime: "0", otTime: "0" }),
      day("10-14", { ...punch, lateTime: "0", earlyTime: "0", goOutTime: "30", otTime: "90", otWorkOver: "1.5" }),
      day("10-15", { ...punch, lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" }),
    ]);
    const line = detailLineOf(out);
    expect(line).toMatch(/10-13 지각 10분, 조퇴 60분/);
    expect(line).toMatch(/10-14 외출 30분, 연장 90분/);
    expect(line).not.toMatch(/10-15/);
    expect(line).toMatch(/이 줄은 답변에 포함하지 마세요/);
  });

  it("분 값이 모두 0이면 줄을 붙이지 않는다", async () => {
    const out = await outputOf([day("10-15", { ...punch, lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" })]);
    expect(detailLineOf(out)).toBeUndefined();
  });

  it("표에는 분 칸이 다시 생기지 않는다", async () => {
    const out = await outputOf([day("10-13", { inTime: "0910", outTime: "1800", lateYn: "지각", lateTime: "10", workComment: "출근" })]);
    expect(tableHeaderOf(out)).toBe("| 일자 | 요일 | 근무판정 | 근무특이사항 | 출근 | 퇴근 |");
  });

  it("사용자 화면용 표 추출에서는 이 줄이 빠진다", async () => {
    const { extractTableBlock, toModelResult } = require("../../../../utils/hrTableBlocks");
    const out = await outputOf([day("10-13", { inTime: "0910", outTime: "1800", lateYn: "지각", lateTime: "10", workComment: "출근" })]);
    const block = extractTableBlock("hr-attendance", out);
    expect(block).toMatch(/\| 일자 \|/);
    expect(block).not.toMatch(/근무 상세|지각 10분/);
    // AI에게 넘기는 결과에는 남아야 "몇 분" 질문에 답한다
    expect(toModelResult(out, true)).toMatch(/10-13 지각 10분/);
  });
});


describe("출근 기록 없이 지각·조퇴만 찍힌 날 (2026-11-18 실데이터 회귀)", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  // 5240은 기준 출근 시각이 지나도 출근 체크가 없으면 결근이 아니라 "지각"으로 표시한다
  const noPunchLate = day("10-21", { mark: "ABNORMAL", lateYn: "지각", lateTime: "0", workComment: "지각", baseStaTime: "1600", baseEndTime: "0200" });

  it("근무현황 표와 요약에 남는다", async () => {
    const out = await outputOf([day("10-20", { absentYn: "결근", mark: "ABNORMAL", workComment: "결근" }), noPunchLate]);
    expect(tableDates(out)).toEqual(["10-20", "10-21"]);
    expect(out.split("\n").find((l) => l.startsWith("> 요약"))).toBe("> 요약: 출퇴근 특이사항(지각 1회, 결근 1일)");
  });

  it("출퇴근 기록이 없으면 출근·퇴근 칸에 —를 넣어 칸이 사라지지 않는다(AI가 출근을 지어내지 않게)", async () => {
    const out = await outputOf([noPunchLate]);
    expect(tableHeaderOf(out)).toBe("| 일자 | 요일 | 근무판정 | 근무특이사항 | 출근 | 퇴근 |");
    expect(out).toMatch(/\| 10-21 \| [^|]+ \| 지각 \| 지각 \| — \| — \|/);
  });

  it("출퇴근 기록(timesheet) 오늘 조회도 출근·퇴근 칸이 —로 남는다", async () => {
    const { output } = await runHandler("hr-attendance", { query_type: "timesheet", date: "오늘" }, () => ({ DATA: [noPunchLate] }));
    expect(output.split("\n").find((l) => l.startsWith("| 일자"))).toMatch(/\| 출근 \| 퇴근 \|/);
    expect(output).toMatch(/\| 10-21 \|[^\n]*\| — \| — \|/);
  });
});
