/**
 * 근무현황 요약 줄 — 하루를 한 가지로만 센다(2026-10-21 사용자 결정 "출근 ㅁ일 교육 ㅁ일 휴일 ㅁ일 휴가 ㅁ일").
 * 전에는 5240 화면처럼 "정상"(지각·조퇴·결근·누락 없음)을 겹쳐 세서, 출근 기록이 없는 계정도
 * "정상 21일 · 교육 13일"(합 34 > 21일)로 나왔다.
 * 분류: 출퇴근 기록이 있으면 출근 → 없으면 휴가 → 출장 → 교육 → 결근 → 휴일(minusDd 0) → 기록 없음.
 * 지각·조퇴·출퇴근 누락·연장근로는 그날 생긴 일이라 따로 센다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-10-21T10:00:00+09:00");
const day = (md, extra = {}) => ({ workYmd: md, ymd: `2026${md.replace("-", "")}`, week: "MON", mark: "NORMAL", minusDd: 1, baseStaTime: "0900", baseEndTime: "1800", ...extra });
const punch = { inTime: "0855", outTime: "1805" };

const summaryOf = async (rows) => {
  const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, (req) =>
    req.path === "/Home.do" ? { Map: {} } : { DATA: rows }
  );
  return output.split("\n").find((l) => l.startsWith("> 집계"));
};

describe("근무현황 요약 줄 — 하루 한 분류", () => {
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  it("실서버 예시: 교육 13일 + 휴일 8일, 출근 기록 없음 → 합이 집계와 같다", async () => {
    const rows = [
      ...Array.from({ length: 13 }, (_, i) => day(`10-${String(i + 1).padStart(2, "0")}`, { education: "기본교육1", workComment: "기본교육1" })),
      ...Array.from({ length: 8 }, (_, i) => day(`10-${String(i + 14).padStart(2, "0")}`, { minusDd: 0, workComment: "휴일" })),
    ];
    expect(await summaryOf(rows)).toBe("> 집계(21일) · 출근 0일 · 교육 13일 · 휴일 8일");
  });

  it("출퇴근 기록이 있으면 교육·반차·휴일이어도 출근", async () => {
    const rows = [
      day("10-01", { ...punch, education: "사내교육" }),
      day("10-02", { ...punch, annualLeave: "반차" }),
      day("10-03", { ...punch, minusDd: 0, workComment: "휴일근무", otHoliWork: "4.0" }),
    ];
    expect(await summaryOf(rows)).toBe("> 집계(3일) · 출근 3일 · 연장근로 1일(승인 4.0h)");
  });

  it("기록 없는 날: 휴가 > 출장 > 교육 > 결근 > 휴일 > 기록 없음", async () => {
    const rows = [
      day("10-05", { annualLeave: "연차", education: "x" }),
      day("10-06", { bizTrip: "부산" }),
      day("10-07", { education: "x" }),
      day("10-08", { absentYn: "결근", mark: "ABNORMAL" }),
      day("10-10", { minusDd: 0, workComment: "휴일" }),
      day("10-12"),
    ];
    expect(await summaryOf(rows)).toBe("> 집계(6일) · 출근 0일 · 휴가 1일 · 출장 1일 · 교육 1일 · 결근 1일 · 휴일 1일 · 기록 없음 1일");
  });

  it("지각·조퇴·출퇴근 누락은 출근일에 따로 센다(오늘은 누락 아님)", async () => {
    const rows = [
      day("10-13", { inTime: "0910", outTime: "1700", lateYn: "지각", earlyYn: "조퇴" }),
      day("10-14", { inTime: "0855" }),
      day("10-21", { inTime: "0855" }),
    ];
    expect(await summaryOf(rows)).toBe("> 집계(3일) · 출근 3일 · 지각 1회 · 조퇴 1회 · 출퇴근 누락 1일");
  });

  it("minusDd가 없는 데이터(mock·구형식)는 근무특이사항 '휴일'로 휴일을 안다", async () => {
    const { minusDd, ...noFlag } = day("10-15", { workComment: "휴일" });
    expect(await summaryOf([noFlag])).toBe("> 집계(1일) · 출근 0일 · 휴일 1일");
  });

  it("'정상'이라는 말은 요약 줄에 쓰지 않는다", async () => {
    expect(await summaryOf([day("10-16", punch)])).toBe("> 집계(1일) · 출근 1일");
  });
});
