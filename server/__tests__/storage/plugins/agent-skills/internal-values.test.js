/**
 * 내부값이 사용자에게 보이는 표에 나오지 않는다 (사용자 결정 2026-10-19 — 내부값 절대 노출 금지)
 * - 증명서: 종류·용도·결재상태 코드 → 명칭, 신청번호(REQ_NO) 숨김
 * - 급여 지급 건 코드·조직코드: 표에서 빼고 "[내부 참조]" 줄로만(다음 조회용)
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const INTERNAL_REF = "[내부 참조 — 다음 조회에만 쓰고 답변에 절대 쓰지 마세요.";

// 표(| 로 시작하는 줄)만 모은 텍스트 — 내부 참조 줄은 제외
const tableText = (output) => output.split("\n").filter((l) => l.startsWith("|")).join("\n");

beforeEach(() => freezeClock());
afterEach(() => jest.useRealTimers());

describe("hr-certificate 신청내역", () => {
  const respond = ({ path }) =>
    path === "/getMBLPrtEmpCard.do"
      ? { DATA: [{ STAFF_ID: "S1" }] }
      : {
          DATA: [
            { STAFF_ID: "S1", TYPE_CD: "10", USE_CD: "05", REQ_STATUS_CD: "30", REQ_NO: "98765", ISSUE_NO: "2026-0001", COPY_NUM: "1" },
            { STAFF_ID: "S1", TYPE_CD: "77", USE_CD: "01", REQ_STATUS_CD: "40", REQ_NO: "98766", COPY_NUM: "2" },
          ],
        };

  it("코드 대신 명칭을 보이고 신청번호를 숨긴다", async () => {
    const { output } = await runHandler("hr-certificate", { query_type: "requests" }, respond);
    expect(output).toContain("| 증명서종류 |");
    for (const name of ["재직증명서", "금융기관제출용", "결재완료", "공공기관제출용", "반려"]) {
      expect(output).toContain(name);
    }
    expect(output).toContain("기타"); // 목록에 없는 종류 코드 77
    for (const hidden of ["98765", "98766", "신청번호", "코드", "| 10 |", "| 05 |", "| 30 |", "| 77 |"]) {
      expect(output).not.toContain(hidden);
    }
  });
});

describe("hr-salary 지급 건 목록", () => {
  const respond = ({ path }) =>
    path === "/CommonCode.do"
      ? { codeList: [{ CODE: "20260325NN", CODE_NM: "2026-03-25 정기급여" }] }
      : { DATA: [] };

  it("지급 건 코드는 표에 없고 내부 참조 줄에만 있다", async () => {
    const { output } = await runHandler("hr-salary", { query_type: "pay_periods", year_month: "3월" }, respond);
    expect(tableText(output)).toContain("2026-03-25 정기급여");
    expect(tableText(output)).not.toContain("20260325NN");
    const ref = output.split("\n").find((l) => l.includes(INTERNAL_REF));
    expect(ref).toContain("2026-03-25 정기급여=20260325NN");
  });
});

describe("hr-personnel 조직도(org_tree)", () => {
  const respond = () => ({
    DATA: [
      { ORG_NM: "개발본부", ORG_CD: "0300", PRIOR_ORG_CD: "", CHIEF_INFO: "김본부", STAFF_CNT: "12" },
      { ORG_NM: "개발1팀", ORG_CD: "0303", PRIOR_ORG_CD: "0300", CHIEF_INFO: "홍길동", STAFF_CNT: "5" },
    ],
  });

  it("상위조직은 이름으로, 조직코드는 내부 참조 줄에만", async () => {
    const { output } = await runHandler("hr-personnel", { query_type: "org_tree" }, respond);
    const table = tableText(output);
    expect(table).toContain("| 상위조직 |");
    expect(table).toMatch(/개발1팀 \|.*개발본부/);
    expect(table).not.toMatch(/0300|0303|조직코드/);
    const ref = output.split("\n").find((l) => l.includes(INTERNAL_REF));
    expect(ref).toContain("개발1팀=0303");
    expect(ref).toContain("개발본부=0300");
  });
});

describe("hr-salary 연 단위 지급 건 목록 (018 보안 리뷰 C1)", () => {
  const respond = ({ path, form }) =>
    path === "/CommonCode.do"
      ? { codeList: [{ CODE: `${String(form.searchYm).replace("-", "")}25NN`, CODE_NM: `${form.searchYm}-25 정기급여` }] }
      : { DATA: [] };

  it("연도 질의도 코드는 표에 없고 내부 참조 줄에만", async () => {
    const { output } = await runHandler("hr-salary", { query_type: "pay_periods", year_month: "올해" }, respond);
    expect(tableText(output)).not.toMatch(/\d{6}25NN|pay_item|코드/);
    expect(output.split("\n").find((l) => l.includes(INTERNAL_REF))).toMatch(/=2026\d{2}25NN/);
    expect(output).not.toContain("선택해 상세를 조회");
  });
});

describe("hr-approval 기안함 (018 보안 리뷰 H1)", () => {
  it("신청번호(REQ_NO)는 표에 없다", async () => {
    const { output } = await runHandler("hr-approval", { query_type: "drafted" }, () => ({
      DATA: [{ APPL_NM: "휴가신청", TITLE: "연차 신청", REQ_STATUS_NM: "완료", APPL_YMD: "20260305", REQ_NO: "R20260305001" }],
    }));
    expect(output).toContain("연차 신청");
    expect(output).not.toMatch(/R20260305001|문서번호/);
  });
});
