/**
 * 급여명세서(payslip)를 5240 급여명세서 화면 구성으로 (specs/024, contracts/payslip-answer.md).
 * 합계(Map)·지급내역(List)·공제내역(List2)·기재사항(List3)을 한 답으로 묶는다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");
const tb = require("../../../../utils/hrTableBlocks");

const PAY = [
  { salItemNm: "기본급", salTypeNm: "지급", salYm: "202610", salAmt: 3000000, resalAmt: 0 },
  { salItemNm: "식대", salTypeNm: "비과세", salYm: "202610", salAmt: 200000, resalAmt: 0 },
  { salItemNm: "연장근로수당", salTypeNm: "지급", salYm: "202610", salAmt: 150000, resalAmt: 0 },
  { salItemNm: "교통비", salTypeNm: "지급", salYm: "202610", salAmt: 100000, resalAmt: 0 },
];
const DED = [
  { salItemNm: "국민연금", salYm: "202610", salAmt: 139500 },
  { salItemNm: "건강보험", salYm: "202610", salAmt: 109900 },
  { salItemNm: "장기요양보험", salYm: "202610", salAmt: 14230 },
  { salItemNm: "고용보험", salYm: "202610", salAmt: 29250 },
  { salItemNm: "소득세", salYm: "202610", salAmt: 84850 },
  { salItemNm: "지방소득세", salYm: "202610", salAmt: 8480 },
];
const NOTE = [
  { salItemNm: "연장근로시간", salEntrCd: "T", salYm: "202610", salAmt: "10.00" },
  { salItemNm: "통상시급", salEntrCd: "E", salYm: "202610", salAmt: "14,354" },
];
const MAP = { staffNm: "테스트", salYmd: "20261025", jtotAmt: "3,450,000", gtotAmt: "386,210", ctotAmt: "3,063,790", notice: "<p>고지</p>" };

const D = (rows) => ({ Message: "", DATA: rows });
const respondWith = (over = {}) => (req) => {
  const table = {
    getSALSalaryDtstmnMgrMap: { Map: MAP },
    getSALSalaryDtstmnMgrList: D(PAY),
    getSALSalaryDtstmnMgrList2: D(DED),
    getSALSalaryDtstmnMgrList3: D(NOTE),
    ...over,
  };
  const v = table[req.form.cmd];
  if (typeof v === "function") return v(req);
  return v ?? D([]);
};
const run = (over) => runHandler("hr-salary", { query_type: "payslip", pay_item: "20261025P" }, respondWith(over));

describe("payslip — 5240 급여명세서 구성", () => {
  beforeEach(() => freezeClock(new Date("2026-11-18T10:00:00+09:00")));
  afterEach(() => jest.useRealTimers());

  it("네 조회를 같은 지급 건·본인 사번으로 부른다", async () => {
    const { calls } = await run();
    expect(calls.map((c) => c.form.cmd).sort()).toEqual([
      "getSALSalaryDtstmnMgrList", "getSALSalaryDtstmnMgrList2", "getSALSalaryDtstmnMgrList3", "getSALSalaryDtstmnMgrMap",
    ]);
    for (const c of calls) {
      expect(c.path).toBe("/SALSalaryDtstmnMgr.do");
      expect(c.form).toMatchObject({ searchItem: "20261025P", searchYm: "2026-10", searchType: "web" });
      expect(c.form.cmmSearchStaffId).toBeTruthy();
    }
  });

  it("합계 → 지급내역 → 공제내역 → 기재사항 순서, 지침은 맨 끝 한 번", async () => {
    const { output } = await run();
    const order = ["> **합계**", "> **지급내역** 4건", "> **공제내역** 6건", "> **기재사항** 2건", "[응답 지침]"].map((s) => output.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(output.match(/\[응답 지침\]/g)).toHaveLength(1);
  });

  it("합계 표는 5240 합계 값 그대로", async () => {
    const { output } = await run();
    expect(output).toContain("| 지급금액 | 공제금액 | 실지급액 |");
    expect(output).toContain("| 3,450,000 | 386,210 | 3,063,790 |");
  });

  it("지급·공제 표에 항목과 합계 줄, 지급구분·급여연월 칸은 없다", async () => {
    const { output } = await run();
    expect(output).toContain("| 지급항목 | 지급금액 |");
    expect(output).toContain("| 기본급 | 3,000,000 |");
    expect(output).toContain("| 합계 | 3,450,000 |");
    expect(output).toContain("| 공제항목 | 공제금액 |");
    expect(output).toContain("| 합계 | 386,210 |");
    expect(output).not.toMatch(/지급구분|급여연월/);
  });

  it("소급금액은 합이 0이면 칸이 없고, 있으면 칸과 합계가 나온다", async () => {
    expect((await run()).output).not.toContain("소급금액");
    const withRetro = PAY.map((r, i) => (i === 0 ? { ...r, resalAmt: 50000 } : r));
    const { output } = await run({ getSALSalaryDtstmnMgrList: D(withRetro) });
    expect(output).toContain("| 지급항목 | 지급금액 | 소급금액 |");
    expect(output).toContain("| 합계 | 3,450,000 | 50,000 |");
  });

  it("기재사항: 기재구분 이름(E 기준항목·T 근태항목), 금액/시간은 5240 글자 그대로", async () => {
    const { output } = await run();
    expect(output).toContain("| 기재구분 | 기재항목 | 금액/시간등 |");
    expect(output).toContain("| 근태항목 | 연장근로시간 | 10.00 |");
    expect(output).toContain("| 기준항목 | 통상시급 | 14,354 |");
  });

  it("기재사항이 0건이면 영역을 생략한다", async () => {
    const { output } = await run({ getSALSalaryDtstmnMgrList3: D([]) });
    expect(output).not.toContain("> **기재사항**");
    expect(output).not.toContain("| 기재구분 |");
    expect(output).toContain("> **공제내역** 6건");
  });

  it("고지사항은 나오지 않는다", async () => {
    expect((await run()).output).not.toMatch(/고지|<p>/);
  });

  it("한 영역 조회가 막히면 그 영역만 실패로 표시하고 나머지는 보여준다", async () => {
    const blocked = { __raw: { ok: false, status: 403, body: "bridge: cmd not allowed" } };
    const { output } = await run({ getSALSalaryDtstmnMgrList3: () => blocked });
    expect(output).toContain("> **기재사항**은 조회하지 못했어요");
    expect(output).toContain("> **지급내역** 4건");
    expect(output).toContain("| 3,450,000 | 386,210 | 3,063,790 |");
  });

  it("합계 조회가 실패해도 실지급액을 계산해 넣지 않는다", async () => {
    const { output } = await run({ getSALSalaryDtstmnMgrMap: () => ({ __raw: { ok: false, status: 500, body: "err" } }) });
    expect(output).toContain("> **합계**는 조회하지 못했어요");
    expect(output).not.toContain("3,063,790");
  });

  it("지급·공제가 0건이면 0건으로 보여주고 지어내지 않는다", async () => {
    const { output } = await run({ getSALSalaryDtstmnMgrList: D([]), getSALSalaryDtstmnMgrList2: D([]) });
    expect(output).toContain("> **지급내역** 0건");
    expect(output).toContain("> **공제내역** 0건");
  });

  it("사용자 표 블록에 영역 제목·표가 모두 남는다(## 제목·지침은 빠짐)", async () => {
    const { output } = await run();
    const block = tb.extractTableBlock("hr-salary", output);
    for (const s of ["> **합계**", "> **지급내역** 4건", "> **공제내역** 6건", "> **기재사항** 2건", "| 합계 | 386,210 |"]) {
      expect(block).toContain(s);
    }
    expect(block).not.toContain("[응답 지침]");
  });

  it("모델에게 영역 제목·표를 다시 쓰지 말고 첫 문장에 실지급액만 쓰라는 지침을 준다(사용자 블록에는 안 보임)", async () => {
    const { output } = await run();
    expect(output).toMatch(/> \[답변 지침\][^\n]*영역 제목[^\n]*다시 쓰지 마세요[^\n]*실지급액/);
    expect(output.indexOf("[답변 지침]")).toBeLessThan(output.indexOf("[응답 지침]"));
    expect(tb.extractTableBlock("hr-salary", output)).not.toContain("[답변 지침]");
    expect(tb.toModelResult(output, true)).toContain("[답변 지침]");
  });

  // 코드 리뷰 HIGH — "> 제목\n| 표" 는 markdown-it에서 인용문에 흡수돼 표가 안 그려진다
  it("영역 제목과 표 사이에 빈 줄이 있다(인용문에 표가 흡수되지 않게)", async () => {
    const { output } = await run();
    expect(output).toMatch(/> \*\*합계\*\*\n\n\| 지급금액 \|/);
    expect(output).toMatch(/> \*\*지급내역\*\* 4건\n\n\| 지급항목 \|/);
    expect(output).toMatch(/> \*\*공제내역\*\* 6건\n\n\| 공제항목 \|/);
    expect(output).toMatch(/> \*\*기재사항\*\* 2건\n\n\| 기재구분 \|/);
    expect(output).not.toMatch(/^>[^\n]*\n\|/m);
  });

  it("일부 영역만 실패하면 실패 원인을 한 번 알린다", async () => {
    const blocked = { __raw: { ok: false, status: 403, body: "bridge: cmd not allowed" } };
    const { output } = await run({ getSALSalaryDtstmnMgrList3: () => blocked });
    expect(output).toContain("HTTP 403");
    expect(output).not.toContain("getSALSalaryDtstmnMgrList3");
  });

  it("표가 하나도 없으면 '표를 붙인다' 지침 대신 결과를 그대로 알리라고 한다", async () => {
    const { output } = await run({
      getSALSalaryDtstmnMgrMap: () => ({ __raw: { ok: false, status: 500, body: "err" } }),
      getSALSalaryDtstmnMgrList: D([]),
      getSALSalaryDtstmnMgrList2: D([]),
      getSALSalaryDtstmnMgrList3: D([]),
    });
    expect(output).not.toContain("표를 답변 아래에 그대로 붙입니다");
    expect(output).toMatch(/\[답변 지침\][^\n]*그대로 짧게 알려/);
  });

  it("항목 금액은 5240 글자 그대로 — 숫자로 못 바꾸는 값을 0으로 바꾸지 않는다", async () => {
    const pay = [{ salItemNm: "기본급", salAmt: "3,000,000", resalAmt: "0" }, { salItemNm: "조정", salAmt: "별도", resalAmt: "0" }];
    const { output } = await run({ getSALSalaryDtstmnMgrList: D(pay) });
    expect(output).toContain("| 기본급 | 3,000,000 |");
    expect(output).toContain("| 조정 | 별도 |");
    expect(output).toContain("| 합계 | 3,000,000 |");
  });

  it("공제만(deductions)·합계만(payslip_summary)은 그대로 한 영역", async () => {
    const d = await runHandler("hr-salary", { query_type: "deductions", pay_item: "20261025P" }, respondWith());
    expect(d.calls.map((c) => c.form.cmd)).toEqual(["getSALSalaryDtstmnMgrList2"]);
    const s = await runHandler("hr-salary", { query_type: "payslip_summary", pay_item: "20261025P" }, respondWith());
    expect(s.calls.map((c) => c.form.cmd)).toEqual(["getSALSalaryDtstmnMgrMap"]);
  });
});
