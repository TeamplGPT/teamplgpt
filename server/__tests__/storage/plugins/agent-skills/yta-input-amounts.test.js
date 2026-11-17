/**
 * 연말정산 공제 자료 표 — 금액은 공제액이 아니라 지출·사용·납입액(2026-11-18).
 * 근거: kiwibox spec-docs ytaInDctMgr(소득공제신청 탭 = 사용액·납입액 입력), ytaYndMedDtlMgr(의료비 지급액),
 * ytaYndGivPayDtlMgr(DON_AMT1=공제대상 기부금액(14)·DON_APPL_AMT=기부장려금 신청금액(15)·DON_SUM=합계(13)),
 * spec-db YTAT_APPL_CARD/INSUR/EDU(*_ETC_AMT = 국세청 외 그 밖의 자료 금액).
 * 챗봇이 "의료비 공제로 404,000원 받았습니다"처럼 지출액을 공제액이라고 답했다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const run = (query_type, row) =>
  runHandler("hr-year-end-tax", { query_type, cal_yy: "2025" }, () => ({ Message: "", DATA: [row] }));

const USER_NOTE = "> 이 금액은 공제 대상으로 신고한 금액이에요. 실제로 줄어든 세금은 연말정산 결과(결정세액)에서 확인할 수 있어요.";

describe("연말정산 공제 자료 표 칸 이름·안내", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  it.each([
    ["medical", { staffNm: "테스트", mediBzplceNm: "서울내과의원", mediCnt: 4, sumAmt: 320000 }, ["의료비 지출액"]],
    ["credit_card", { famNm: "본인", cardAmt: 12000000, cardEtcAmt: 3000000, firstHelfAmt: 7000000, secondHelfAmt: 8000000 },
      ["카드 사용액(국세청)", "카드 사용액(그 밖의 자료)", "상반기 사용액(추가공제율)", "하반기 사용액(추가공제율)"]],
    ["insurance", { famNm: "본인", insuAmt: 960000, insuEtcAmt: 0 }, ["보험료(국세청)", "보험료(그 밖의 자료)"]],
    ["education", { famNm: "본인", eduAmt: 1200000, eduEtcAmt: 0 }, ["교육비(국세청)", "교육비(그 밖의 자료)"]],
    ["donation", { donTypeCdNm: "법정기부금", donBzplceNm: "대한적십자사", donAmt1: 100000, donApplAmt: 0, donSum: 100000 },
      ["공제대상 기부금액", "기부장려금 신청금액", "기부금 합계"]],
  ])("%s — 금액 칸이 실제 뜻으로 보이고, 공제액이 아니라는 안내가 붙는다", async (qt, row, labels) => {
    const { output } = await run(qt, row);
    for (const label of labels) expect(output).toContain(label);
    expect(output).not.toMatch(/\| (합계금액|신용카드|기타카드|보험료|기타보험료|교육비|기타교육비|기부금액|공제적용액|합계) \|/);
    expect(output).toContain(USER_NOTE);
    expect(output).toMatch(/> \[답변 지침\][^\n]*공제받은 금액[^\n]*말하지 말/);
  });

  it("연금저축(구 개인연금저축 납입액)에도 안내가 붙는다 — 조회 대상은 그대로(사용자 결정 B)", async () => {
    const { output, calls } = await run("savings", { payCnt: 12, payAmt: 3000000 });
    expect(calls[0].form.cmd).toBe("getYTAInDctMgrTab06List");
    expect(output).toContain("납입금액");
    expect(output).toContain(USER_NOTE);
  });

  it("연말정산 결과(summary)는 실제 세금이라 안내를 붙이지 않는다", async () => {
    const { output } = await run("summary", { txDiv: "근로소득", calYm: "202602", totAmt: 44100000, pIncomeTaxAmt: 1020000 });
    expect(output).toContain("결정소득세");
    expect(output).not.toContain(USER_NOTE);
  });
});

describe("안내·건수 줄이 공통 응답 지침보다 앞에 온다 — 지침 뒤는 표 블록·모델 입력에서 잘린다", () => {
  const tb = require("../../../../utils/hrTableBlocks");
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  it("사용자 표 블록에 건수·안내 줄이 남고, 모델 입력에는 답변 지침이 남는다", async () => {
    const { output } = await run("medical", { staffNm: "테스트", mediBzplceNm: "A", mediCnt: 1, sumAmt: 1000 });
    const guideAt = output.indexOf("\n---\n[응답 지침]");
    expect(guideAt).toBeGreaterThan(output.indexOf(USER_NOTE));
    const block = tb.extractTableBlock("hr-year-end-tax", output);
    expect(block).toContain("> 총 **1건** 조회됨");
    expect(block).toContain(USER_NOTE);
    expect(block).not.toContain("[답변 지침]");
    expect(tb.toModelResult(output, true)).toContain("[답변 지침]");
  });
});
