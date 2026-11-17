/**
 * 표 날짜를 급여처럼 하이픈 형식으로(사용자 결정 2026-11-18) — 결재·증명서·교육·대출·휴가·연말정산 표의
 * 20261116 / 202602 가 숫자 그대로 보였다. 공용 렌더(renderTable/renderWhitelisted)에서 칸 이름이 날짜인 칸만 바꾼다.
 */
const path = require("path");
const { renderTable, renderWhitelisted } = require(path.resolve(
  __dirname, "../../../../storage/plugins/agent-skills/_shared/formatTable.js"
));

describe("표 날짜 표시 형식", () => {
  it("칸 이름이 날짜(…일·…일자)인 8자리 값은 YYYY-MM-DD로", () => {
    const md = renderTable([{ 문서명: "휴가신청서", 신청일: "20261116", 최종결재일: "20261021", 급여일자: "20261025" }]);
    expect(md).toContain("| 휴가신청서 | 2026-11-16 | 2026-10-21 | 2026-10-25 |");
  });

  it("칸 이름에 '연월'이 든 6자리 값은 YYYY-MM으로", () => {
    expect(renderTable([{ 정산연월: "202602" }])).toContain("| 2026-02 |");
  });

  it("날짜가 아닌 칸·날짜가 아닌 값은 그대로", () => {
    const md = renderTable([{ 경과일: "2", 발급번호: "20261102", 신청일: "2026-11-02 10:21", 근무일자: "11-18", 시작일: "20261399" }]);
    expect(md).toContain("| 2 | 20261102 | 2026-11-02 10:21 | 11-18 | 20261399 |");
  });

  it("renderWhitelisted 경로도 같다", () => {
    const md = renderWhitelisted([{ issueYmd: "20261102", title: "재직" }], { issueYmd: "발급일", title: "종류" });
    expect(md).toContain("| 2026-11-02 | 재직 |");
  });
});
