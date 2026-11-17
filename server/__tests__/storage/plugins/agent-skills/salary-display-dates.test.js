/**
 * 급여 표 날짜 형식 (2026-11-18 사용자 결정) — 급여연월 202606 → 2026-06, 급여일자 20260625 → 2026-06-25.
 * 숫자처럼 보이는 날짜를 위젯 표가 금액으로 보고 값 막대를 붙였다. 사람이 읽기에도 하이픈 형식이 낫다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const respond = (req) => {
  const f = req.form || {};
  if (f.cmd === "getSALSalaryDtstmnMgrList") {
    return { DATA: [
      { salItemNm: "기본급", salTypeNm: "지급", salYm: "202606", salAmt: 3200000, resalAmt: 0 },
      { salItemNm: "식대", salTypeNm: "비과세", salYm: 202606, salAmt: 200000, resalAmt: 0 },
    ] };
  }
  if (f.cmd === "getSALSalaryDtstmnMgrList2") {
    return { DATA: [{ salItemNm: "국민연금", salYm: "202606", salAmt: 153000 }] };
  }
  if (f.cmd === "getSALSalaryDtstmnMgrMap") {
    return { Map: { staffNm: "홍길동", orgNm: "고객관리팀", posNm: "대리", resNm: "-", empYmd: "20230301", salYmd: "20260625", jtotAmt: 3785000, gtotAmt: 460600, ctotAmt: 3324400 } };
  }
  if (f.cmd === "getSALSalaryBassMgrTab110List") {
    return { DATA: [
      { salYmd: "20260525", orgNm: "고객관리팀", posNm: "대리", jtotAmt: 3700000, gtotAmt: 450000, ctotAmt: 3250000 },
      { salYmd: "20260625", orgNm: "고객관리팀", posNm: "대리", jtotAmt: 3785000, gtotAmt: 460600, ctotAmt: 3324400 },
    ] };
  }
  if (f.cmd === "getSALDaylabMgrList") {
    return { DATA: [{ workYmd: "20260610", salYmd: "20260625", staffNm: "홍길동", dailyAmt: 120000, payAmt: 120000 }] };
  }
  return { DATA: [] };
};

const run = async (params) => (await runHandler("hr-salary", params, respond)).output;

describe("급여 표 날짜 형식", () => {
  beforeAll(() => freezeClock(new Date("2026-07-10T12:00:00+09:00")));
  afterAll(() => jest.useRealTimers());

  it("명세·공제의 급여연월은 YYYY-MM (숫자로 와도)", async () => {
    const payslip = await run({ query_type: "payslip", pay_item: "20260625P" });
    expect(payslip).toMatch(/\| 기본급 \| 지급 \| 2026-06 \| 3,200,000 \|/);
    expect(payslip).toMatch(/\| 식대 \| 비과세 \| 2026-06 \|/);
    expect(payslip).not.toMatch(/\| 202606 \|/);
    const deductions = await run({ query_type: "deductions", pay_item: "20260625P" });
    expect(deductions).toMatch(/\| 국민연금 \| 2026-06 \| 153,000 \|/);
  });

  it("요약의 입사일·급여일자는 YYYY-MM-DD", async () => {
    const out = await run({ query_type: "payslip_summary", pay_item: "20260625P" });
    expect(out).toMatch(/\| 2023-03-01 \| 2026-06-25 \| 3,785,000 \|/);
  });

  it("월별 지급내역의 지급일, 일용직의 근무일자·급여일자도 YYYY-MM-DD", async () => {
    const statement = await run({ query_type: "salary_statement", year_month: "2026" });
    expect(statement).toMatch(/\| 2026-05-25 \|/);
    expect(statement).toMatch(/\| 2026-06-25 \|/);
    const daylabor = await run({ query_type: "daylabor", year_month: "6월" });
    expect(daylabor).toMatch(/\| 2026-06-10 \| 2026-06-25 \|/);
  });

  it("날짜 모양이 아닌 값은 그대로 둔다", async () => {
    const out = await run({ query_type: "payslip", pay_item: "20260625P" });
    expect(out).toMatch(/\| 3,200,000 \|/);
  });
});
