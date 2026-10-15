/**
 * E2E 러너 판정 모듈 (scripts/e2e-hr-skill/helpers/expectations.js)
 */
const fs = require("fs");
const path = require("path");
const {
  compileExpectations,
  judgeRun,
} = require("../../scripts/e2e-hr-skill/helpers/expectations");

function scenario(expect) {
  const s = { id: "T1", message: "m", expect: { tool_call: true, ...expect } };
  return { ...s, ...compileExpectations(s) };
}

const OK = {
  errorMsg: null,
  rawStreamText: "",
  toolCall: "hr-attendance",
  finalText: "연차 15일 남았어요",
  mockUrl: "http://127.0.0.1:8000/TAAVctnSttus.do",
  mockBody: "staffId=1&searchYear=2026",
  bodies: ["staffId=1&searchYear=2026"],
};

describe("compileExpectations", () => {
  it("없는 키는 undefined로 둔다", () => {
    const c = compileExpectations({ id: "A", expect: { tool_call: false } });
    expect(Object.values(c).every((v) => v === undefined)).toBe(true);
  });

  it.each([
    [{ mock_body_pattern: "x" }, /mock_body_pattern must be string\[\]/],
    [{ answer_pattern: ["("] }, /invalid answer_pattern regex/],
    [{ mock_url_pattern: 3 }, /mock_url_pattern must be string or null/],
    [{ mock_url_pattern: "[" }, /invalid regex/],
  ])("잘못된 기대값 %p 은 Error를 던진다", (bad, msg) => {
    expect(() => compileExpectations({ id: "A", expect: bad })).toThrow(msg);
  });

  // embed 러너는 판정 코드가 따로 있다(이 모듈을 쓰지 않음) — @agent 시나리오만 확인한다
  it("현행 e2e-hr-skill 시나리오가 모두 컴파일된다", () => {
    const file = path.resolve(__dirname, "../../scripts/e2e-hr-skill/scenarios.json");
    const { scenarios } = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const s of scenarios) {
      expect(() => compileExpectations(s)).not.toThrow();
    }
  });
});

describe("judgeRun", () => {
  it("모든 기대가 맞으면 null", () => {
    const s = scenario({
      mock_url_pattern: "TAAVctnSttus",
      mock_body_pattern: ["searchYear=2026"],
      answer_pattern: ["15일"],
      answer_not_pattern: ["김기현"],
      max_hr_calls: 1,
    });
    expect(judgeRun(s, OK)).toBeNull();
  });

  it("요청 오류가 가장 먼저 판정된다", () => {
    expect(judgeRun(scenario({}), { ...OK, errorMsg: "ECONNREFUSED", toolCall: null })).toBe(
      "request error: ECONNREFUSED"
    );
  });

  it("tool_call 기대와 실제가 다르면 실패", () => {
    expect(judgeRun(scenario({}), { ...OK, toolCall: null })).toMatch(/expected tool_call/);
    const noTool = scenario({ tool_call: false });
    expect(judgeRun(noTool, OK)).toMatch(/expected no tool_call/);
  });

  it("tool_call: null 이면 호출 여부를 보지 않고 답변으로 판정한다", () => {
    const s = scenario({ tool_call: null, answer_pattern: ["조회할 수 없"] });
    const refusal = "다른 직원의 정보는 조회할 수 없어요.";
    expect(judgeRun(s, { ...OK, finalText: refusal })).toBeNull();
    expect(judgeRun(s, { ...OK, toolCall: null, finalText: refusal })).toBeNull();
    expect(judgeRun(s, OK)).toMatch(/answer missing pattern/);
  });

  it("tool-call 모양 JSON이 스트림에 새면 실패", () => {
    const leaked = { ...OK, rawStreamText: '{"name":"work_status","arguments":{}}' };
    expect(judgeRun(scenario({}), leaked)).toMatch(/leaked a tool-call-shaped/);
  });

  it("mock_body_pattern 은 마지막 요청 body에 모든 패턴이 있어야 한다", () => {
    const s = scenario({ mock_body_pattern: ["staffId=1", "searchYear=2025"] });
    expect(judgeRun(s, { ...OK, mockBody: null })).toBe("no mock body captured");
    expect(judgeRun(s, OK)).toBe("mock body missing pattern(s): searchYear=2025");
  });

  it("mock_body_pattern_none 에 걸리는 요청이 하나라도 있으면 실패", () => {
    const s = scenario({ mock_body_pattern_none: ["selectGubun=(3|4|5|6)(&|$)"] });
    const bodies = ["cmd=getTodoIconCnt", "selectGubun=3&staffId=1"];
    expect(judgeRun(s, { ...OK, bodies })).toBe(
      "forbidden mock body pattern(s) requested: selectGubun=(3|4|5|6)(&|$)"
    );
    expect(judgeRun(s, { ...OK, bodies: ["selectGubun=2&staffId=1"] })).toBeNull();
  });

  it("mock_body_pattern_any 는 기록된 요청 중 하나만 맞아도 충족", () => {
    const s = scenario({ mock_body_pattern_any: ["searchYm=202601", "searchYm=202612"] });
    expect(judgeRun(s, { ...OK, bodies: ["searchYm=202601", "searchYm=202612"] })).toBeNull();
    expect(judgeRun(s, { ...OK, bodies: ["searchYm=202601"] })).toBe(
      "no mock body (of 1) matched pattern(s): searchYm=202612"
    );
  });

  it("답변 금지 패턴이 보이면 실패, 답변이 없으면 별도 사유", () => {
    const s = scenario({ answer_not_pattern: ["김기현\\s*님의"] });
    expect(judgeRun(s, { ...OK, finalText: "김기현 님의 연차는" })).toMatch(/forbidden pattern/);
    expect(judgeRun(s, { ...OK, finalText: null })).toBe("no final answer captured");
  });

  it("HR 호출 건수 한도를 넘거나 모자라면 실패", () => {
    expect(judgeRun(scenario({ max_hr_calls: 1 }), { ...OK, bodies: ["a", "b"] })).toBe(
      "hr calls 2 exceeded max 1"
    );
    expect(judgeRun(scenario({ min_hr_calls: 3 }), OK)).toBe("hr calls 1 below min 3");
  });

  it("mock URL이 없거나 패턴이 다르면 실패", () => {
    const s = scenario({ mock_url_pattern: "EAPRequestMgr" });
    expect(judgeRun(s, { ...OK, mockUrl: null })).toMatch(/no mock URL captured/);
    expect(judgeRun(s, OK)).toBe("mock URL did not match pattern EAPRequestMgr");
  });
});
