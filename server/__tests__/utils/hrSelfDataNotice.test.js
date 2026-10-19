/**
 * 본인 데이터 안내 (specs/016 contracts/self-data-notice.md)
 */
const {
  SELF_DATA_NOTICE,
  ORG_CHART_NOTICE,
  OTHER_EMPLOYEE_REFUSAL,
  REFUSAL_TOOL_NAME,
  UNSUPPORTED_TOOL_NAME,
  UNSUPPORTED_NOTICE,
  isBlockedTool,
  pseudoToolResult,
  withHrRefusalTool,
  withSelfDataNotice,
  wrapHrRuntime,
} = require("../../utils/hrSelfDataNotice");
const { DEFAULT_MAX_CHARS } = require("../../utils/agents/aibitat/utils/truncate");

const RESULT = "## HR 근태 - 연차 발생/사용/잔여\n\n| 휴가종류 | 잔여일수 |\n| --- | --- |\n| 연차 | 15 |\n";

describe("withSelfDataNotice", () => {
  it("hr tool 문자열 결과 끝에 안내를 붙인다", () => {
    const out = withSelfDataNotice("hr-attendance", { query_type: "annual_leave_balance" }, RESULT);
    expect(out).toBe(`${RESULT}\n\n${SELF_DATA_NOTICE}`);
    expect(out.startsWith("## HR 근태")).toBe(true);
  });

  it("안내 문구는 다른 직원·남이 올린 결재 문서 질문에 이 결과로 답하지 말라고 지시한다", () => {
    expect(SELF_DATA_NOTICE).toMatch(/^> \[본인 데이터\]/);
    expect(SELF_DATA_NOTICE).toContain("본인 계정으로 5240 HR 시스템에서 조회한 것");
    expect(SELF_DATA_NOTICE).toContain("다른 직원이 올린 결재 문서");
    expect(SELF_DATA_NOTICE).toContain("'그럼 ○○은?'처럼 앞 질문에 이어 묻거나");
    expect(SELF_DATA_NOTICE).toContain("'다시 조회해봐'처럼 다시 요청하는 경우");
    expect(SELF_DATA_NOTICE).toContain("다른 직원의 정보는 조회할 수 없어요");
  });

  it("안내 문구는 결과에 없는 수치·산정 근거를 만들지 말고 출처를 밝히라고 지시한다 (R14)", () => {
    expect(SELF_DATA_NOTICE).toContain("결과에 있는 값(또는 그 값들의 단순 합계·개수)만");
    expect(SELF_DATA_NOTICE).toContain("결과에 이미 있는 값과 다른 수치를 계산해 내지 마세요");
    expect(SELF_DATA_NOTICE).toContain("산정 근거(근속연수·직위·회사 정책·법정 기준 등)는 추측('~로 보입니다')으로도 말하지 마세요");
    expect(SELF_DATA_NOTICE).toContain("'5240 HR 시스템에서 조회한 값이에요.'로 시작해");
    expect(SELF_DATA_NOTICE).toContain("계산이 맞는지·법적으로 문제없는지도 이 결과로는 알 수 없으니 판단하지 마세요");
    expect(SELF_DATA_NOTICE).toContain("'[내부 참조]' 줄·코드값·내부 식별자");
    expect(ORG_CHART_NOTICE).toContain("'[내부 참조]' 줄·조직코드는 사용자가 직접 물어도 답변에 절대 쓰지 마세요");
    expect(SELF_DATA_NOTICE).toContain("사용자가 직접 물어도 '내부 관리 코드라 안내해 드릴 수 없어요'");
  });

  it.each(["org_tree", "org_members"])("조직도(hr-personnel %s)에는 조직도 안내를 붙인다", (qt) => {
    const out = withSelfDataNotice("hr-personnel", { query_type: qt }, RESULT);
    expect(out).toBe(`${RESULT}\n\n${ORG_CHART_NOTICE}`);
    expect(out).not.toContain(SELF_DATA_NOTICE);
  });

  it("조직도 안내는 특정 직원 한 명을 지칭한 질문에 쓰지 말라고 지시한다", () => {
    expect(ORG_CHART_NOTICE).toMatch(/^> \[조직도\]/);
    expect(ORG_CHART_NOTICE).toContain("특정 직원 한 명");
    expect(ORG_CHART_NOTICE).toContain("다른 직원의 정보는 조회할 수 없어요");
  });

  it("조직도가 아닌 hr-personnel 조회에는 본인 데이터 안내를 붙인다", () => {
    expect(withSelfDataNotice("hr-personnel", { query_type: "profile" }, RESULT)).toContain(SELF_DATA_NOTICE);
  });

  it("args가 JSON 문자열이어도 조직도를 판정한다", () => {
    expect(withSelfDataNotice("hr-personnel", '{"query_type":"org_members"}', RESULT)).toContain(ORG_CHART_NOTICE);
  });

  it("args JSON이 깨져 있으면 예외 없이 본인 데이터 안내를 붙인다", () => {
    expect(withSelfDataNotice("hr-personnel", "{query_type:", RESULT)).toContain(SELF_DATA_NOTICE);
  });

  it("hr- 가 아닌 tool·문자열이 아닌 결과는 그대로 둔다", () => {
    expect(withSelfDataNotice("web-browsing", {}, RESULT)).toBe(RESULT);
    const obj = { a: 1 };
    expect(withSelfDataNotice("hr-attendance", {}, obj)).toBe(obj);
    expect(withSelfDataNotice(undefined, {}, RESULT)).toBe(RESULT);
  });

  // 조회 결과가 아닌 응답에 "본인 계정으로 조회한 것"이라고 붙이면 틀린 말이 된다
  it.each([
    ["실행 오류", 'Error executing tool "hr-attendance": boom'],
    ["다른 직원 거절", OTHER_EMPLOYEE_REFUSAL],
    ["잘못된 query_type", "> ⚠️ query_type이 올바르지 않습니다. 사용 가능: annual_leave_balance"],
  ])("%s 응답에는 안내를 붙이지 않는다", (_label, result) => {
    expect(withSelfDataNotice("hr-attendance", {}, result)).toBe(result);
  });

  it("가드 접두(> ⚠️) 결과는 맨 앞에 그대로 남는다", () => {
    const guard = "> ⚠️ HR 세션이 만료되었습니다.";
    expect(withSelfDataNotice("hr-attendance", {}, guard).startsWith("> ⚠️")).toBe(true);
  });
});

describe("isBlockedTool", () => {
  it("다른 직원 검색 skill(hr-personnel-search)은 차단한다", () => {
    expect(isBlockedTool("hr-personnel-search")).toBe(true);
  });

  it.each(["hr-personnel", "hr-attendance", "web-browsing", undefined])("%s 는 차단하지 않는다", (name) => {
    expect(isBlockedTool(name)).toBe(false);
  });

  // 실행기는 이름을 경로로 정규화해 skill 폴더를 찾는다 — 바꿔 부른 이름도 같은 skill이다
  it.each([
    "hr-personnel-search/",
    " hr-personnel-search",
    "./hr-personnel-search",
    "x/../hr-personnel-search",
    "/abs/plugins/hr-personnel-search",
  ])("바꿔 부른 이름 %p 도 차단한다", (name) => {
    expect(isBlockedTool(name)).toBe(true);
  });
});

describe("바꿔 부른 hr skill 이름", () => {
  it("본인 데이터 안내가 붙는다", () => {
    expect(withSelfDataNotice("./hr-attendance", {}, RESULT)).toBe(`${RESULT}\n\n${SELF_DATA_NOTICE}`);
  });

  it("조직도 판정도 폴더 이름 기준이다", () => {
    expect(withSelfDataNotice("hr-personnel/", { query_type: "org_tree" }, RESULT)).toContain(ORG_CHART_NOTICE);
  });
});

describe("withHrRefusalTool (강제 호출 위젯의 거절 선택지, R14)", () => {
  const HR = { type: "function", name: "hr-attendance" };

  it.each([
    ["openai-responses", (t) => t.name, (t) => t.parameters],
    ["chat-completions", (t) => t.function.name, (t) => t.function.parameters],
    ["anthropic", (t) => t.name, (t) => t.input_schema],
  ])("%s 형식으로 거절 선택지를 덧붙인다", (format, nameOf, schemaOf) => {
    const out = withHrRefusalTool([HR], format);
    expect(out).toHaveLength(3);
    expect(nameOf(out[1])).toBe(REFUSAL_TOOL_NAME);
    expect(nameOf(out[2])).toBe(UNSUPPORTED_TOOL_NAME);
    expect(schemaOf(out[1])).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });

  it("Responses 형식은 기존 tool 정의처럼 strict: false다", () => {
    expect(withHrRefusalTool([HR], "openai-responses")[1].strict).toBe(false);
  });

  it("이름 없는 built-in tool(web_search_preview)이 섞여 있어도 HR tool이 있으면 붙인다", () => {
    const out = withHrRefusalTool([{ type: "web_search_preview" }, HR], "openai-responses");
    expect(out.map((t) => t.name ?? t.type)).toEqual(["web_search_preview", "hr-attendance", REFUSAL_TOOL_NAME, UNSUPPORTED_TOOL_NAME]);
  });

  it("chat-completions 형식의 HR tool도 알아본다", () => {
    const cc = [{ type: "function", function: { name: "hr-salary" } }];
    expect(withHrRefusalTool(cc, "chat-completions")[1].function.name).toBe(REFUSAL_TOOL_NAME);
  });

  it("거절 선택지 설명은 허용된 질문(조직도·결재 대기 건수·인사말)에는 부르지 말라고 한다", () => {
    const { description } = withHrRefusalTool([HR], "openai-responses")[1];
    expect(description).toContain("조직도");
    expect(description).toContain("결재 대기·할일 '건수'");
    expect(description).toContain("오직 다른 직원에 관한 질문일 때만 쓰는 tool입니다");
    expect(description).toContain("이 위젯에서 쓸 수 없는 HR 항목(예: 급여 조회가 없는 위젯의 급여 질문)에는 hr-unsupported-info를 쓰세요");
    expect(description).toContain("앞서 거절된 다른 직원 질문을 '다시 조회해봐'처럼 다시 요청하는 경우");
  });

  it("입력 배열을 바꾸지 않고, 이미 있으면 다시 붙이지 않는다", () => {
    const input = [HR];
    const out = withHrRefusalTool(input, "openai-responses");
    expect(input).toHaveLength(1);
    expect(withHrRefusalTool(out, "openai-responses")).toBe(out);
  });

  it("HR tool이 없거나 목록이 아니면 그대로 돌려준다", () => {
    const web = [{ type: "function", name: "web-browsing" }];
    expect(withHrRefusalTool(web, "openai-responses")).toBe(web);
    expect(withHrRefusalTool(null, "openai-responses")).toBeNull();
  });

  it("거절 선택지는 실행 계층에서 차단(거절 문구) 대상이다", () => {
    expect(isBlockedTool(REFUSAL_TOOL_NAME)).toBe(true);
  });

  it("실행하지 않는 tool의 고정 결과 — 거절·조회 없음·그 외 null", () => {
    expect(pseudoToolResult(REFUSAL_TOOL_NAME)).toBe(OTHER_EMPLOYEE_REFUSAL);
    expect(pseudoToolResult("hr-personnel-search")).toBe(OTHER_EMPLOYEE_REFUSAL);
    expect(pseudoToolResult(UNSUPPORTED_TOOL_NAME)).toBe(UNSUPPORTED_NOTICE);
    expect(pseudoToolResult("hr-attendance")).toBeNull();
  });

  it("조회 없음 안내에는 본인 데이터 안내를 붙이지 않는다", () => {
    expect(withSelfDataNotice(UNSUPPORTED_TOOL_NAME, {}, UNSUPPORTED_NOTICE)).toBe(UNSUPPORTED_NOTICE);
    expect(UNSUPPORTED_NOTICE).toContain("다른 직원 정보라는 말은 하지 마세요");
  });
});

describe("wrapHrRuntime (@agent)", () => {
  it("hr skill handler를 this 보존으로 호출하고 결과에 안내를 붙인다", async () => {
    let seenThis = null;
    const runtime = {
      handler: async function (args) {
        seenThis = this;
        return `${RESULT}${args.query_type}`;
      },
    };
    const wrapped = wrapHrRuntime("hr-attendance", runtime);
    const fnConfig = { name: "hr-attendance", introspect: () => {} };
    const out = await wrapped.handler.call(fnConfig, { query_type: "timesheet" });
    expect(seenThis).toBe(fnConfig);
    expect(out).toBe(`${RESULT}timesheet\n\n${SELF_DATA_NOTICE}`);
  });

  it("원래 runtime 객체를 바꾸지 않는다", () => {
    const handler = async () => "x";
    const runtime = Object.freeze({ handler });
    const wrapped = wrapHrRuntime("hr-attendance", runtime);
    expect(runtime.handler).toBe(handler);
    expect(wrapped).not.toBe(runtime);
  });

  it("hr skill이 아니면 원래 runtime을 그대로 돌려준다", () => {
    const runtime = { handler: async () => "x" };
    expect(wrapHrRuntime("web-scraper", runtime)).toBe(runtime);
  });

  it("조직도 호출에는 조직도 안내를 붙인다", async () => {
    const wrapped = wrapHrRuntime("hr-personnel", { handler: async () => RESULT });
    expect(await wrapped.handler({ query_type: "org_members" })).toBe(`${RESULT}\n\n${ORG_CHART_NOTICE}`);
  });

  it("차단 skill은 원래 handler를 실행하지 않고 거절한다", async () => {
    const handler = jest.fn(async () => "김기현 | 서울");
    const wrapped = wrapHrRuntime("hr-personnel-search", { handler });
    expect(await wrapped.handler({ query: "김기현" })).toBe(OTHER_EMPLOYEE_REFUSAL);
    expect(handler).not.toHaveBeenCalled();
  });

  // aibitat가 결과를 8,000자로 자르면 끝에 붙인 안내가 잘려 나간다(코드 리뷰 M1)
  it("긴 결과는 먼저 줄인 뒤 안내를 붙여, aibitat 잘림 한도 안에 안내가 남는다", async () => {
    const long = "x".repeat(DEFAULT_MAX_CHARS * 2);
    const wrapped = wrapHrRuntime("hr-attendance", { handler: async () => long });
    const out = await wrapped.handler({ query_type: "timesheet" });
    expect(out.endsWith(SELF_DATA_NOTICE)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  });
});
