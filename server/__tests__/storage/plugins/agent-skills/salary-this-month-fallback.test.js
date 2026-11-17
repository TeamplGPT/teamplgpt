/**
 * "이번 달 급여명세서" — 이번 달 급여가 아직 지급(마감) 전이면 지난달 지급 건을 보여준다(사용자 결정 2026-11-18).
 * 전에는 이번 달만 조회해 "지급 건이 없어 제공할 수 없습니다"로 끝났다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const NOW = new Date("2026-11-18T10:00:00+09:00");
const periodsBy = (paid) => (req) => {
  const ym = req.form.searchYm;
  return { codeList: paid[ym] ? [{ CODE_NM: `${ym}-25 정기급여`, CODE: `${ym.replace("-", "")}25P` }] : [] };
};

describe("pay_periods — 이번 달 미지급이면 지난달", () => {
  beforeEach(() => freezeClock(NOW));
  afterEach(() => jest.useRealTimers());

  it.each(["이번달", "이번 달", "202611", "2026-11", "11월"])("year_month=%s — 11월이 없으면 10월 지급 건과 안내", async (ym) => {
    const { calls, output } = await runHandler("hr-salary", { query_type: "pay_periods", year_month: ym }, periodsBy({ "2026-10": true }));
    expect(calls.map((c) => c.form.searchYm)).toEqual(["2026-11", "2026-10"]);
    expect(output).toContain("2026-10-25 정기급여");
    expect(output).toContain("이번 달(2026-11) 급여는 아직 지급(마감) 전이라 지난달(2026-10) 지급 건을 보여드려요.");
    // 이 목록 표는 상세 표가 붙으면 답변에서 빠진다 — 모델이 첫 문장에서 밝히도록 지침도 준다
    expect(output).toMatch(/> \[답변 지침\][^\n]*이번 달이 아니라 지난달\(2026-10\)[^\n]*첫 문장/);
  });

  it("이번 달이 지급됐으면 이번 달 건만, 안내 없음", async () => {
    const { calls, output } = await runHandler("hr-salary", { query_type: "pay_periods", year_month: "이번달" }, periodsBy({ "2026-11": true, "2026-10": true }));
    expect(calls.map((c) => c.form.searchYm)).toEqual(["2026-11"]);
    expect(output).toContain("2026-11-25 정기급여");
    expect(output).not.toContain("아직 지급(마감) 전");
  });

  it("지난달 같은 과거 달을 콕 집으면 그 달만 조회(다른 달로 바꾸지 않음)", async () => {
    const { calls } = await runHandler("hr-salary", { query_type: "pay_periods", year_month: "202609" }, periodsBy({}));
    expect(calls.map((c) => c.form.searchYm)).toEqual(["2026-09"]);
  });
});
