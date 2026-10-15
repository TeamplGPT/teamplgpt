/**
 * toolCallingLoop — tool_choice 주입 단위 테스트 (embed-tool-choice-required 피처)
 *
 * 검증 대상:
 *   - injectToolChoice (순수 함수, 4분기 decision matrix)
 *   - toolCallingLoop 통합 — caller 파라미터가 LLMConnector에 tool_choice로 forward 되는지
 *
 * Design §8.2 TC-1 ~ TC-8.
 */

jest.mock("../../../helpers/chat/responses", () => ({
  writeResponseChunk: jest.fn(),
  isResponseWritable: jest.fn().mockReturnValue(true),
}));

jest.mock("../executor", () => ({
  ToolExecutor: {
    execute: jest.fn().mockResolvedValue('{"ok":true}'),
  },
}));

const {
  toolCallingLoop,
  injectToolChoice,
} = require("../loop");

const ENV_KEY = "EMBED_TOOL_CHOICE_REQUIRED";

describe("injectToolChoice — 4분기 decision matrix", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  test("TC-1: caller='workspace' → tool_choice 미주입", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "workspace",
      tools: [{ type: "function", name: "x" }],
    });
    expect(out).not.toHaveProperty("tool_choice");
    expect(out).toEqual({ temperature: 0.7 });
  });

  test("TC-2: caller='embed' + tools=[] → tool_choice 미주입 (edge guard 1)", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [],
    });
    expect(out).not.toHaveProperty("tool_choice");
  });

  test("TC-3: caller='embed' + tools=null → tool_choice 미주입", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: null,
    });
    expect(out).not.toHaveProperty("tool_choice");
  });

  test("TC-3b: caller='embed' + tools=undefined → tool_choice 미주입", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: undefined,
    });
    expect(out).not.toHaveProperty("tool_choice");
  });

  test("TC-4: caller='embed' + tools.length≥1 + env unset → tool_choice='required'", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
    });
    expect(out.tool_choice).toBe("required");
    expect(out.temperature).toBe(0.7);
  });

  test("TC-5: caller='embed' + tools.length≥1 + env='false' → tool_choice 미주입 (kill-switch)", () => {
    process.env[ENV_KEY] = "false";
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
    });
    expect(out).not.toHaveProperty("tool_choice");
  });

  test("TC-5b: forceToolChoiceRequired=false면 embed여도 tool_choice 미주입", () => {
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
      forceToolChoiceRequired: false,
    });
    expect(out).not.toHaveProperty("tool_choice");
  });

  test("TC-6: caller='embed' + tools.length≥1 + env='FALSE' (대문자) → tool_choice='required' (엄격 equality, Q-C)", () => {
    process.env[ENV_KEY] = "FALSE";
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
    });
    expect(out.tool_choice).toBe("required");
  });

  test("TC-6b: caller='embed' + env='0' → tool_choice='required' (엄격 equality, '0' ≠ 'false')", () => {
    process.env[ENV_KEY] = "0";
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
    });
    expect(out.tool_choice).toBe("required");
  });

  test("TC-6c: caller='embed' + env='true' → tool_choice='required'", () => {
    process.env[ENV_KEY] = "true";
    const out = injectToolChoice({
      llmOptions: { temperature: 0.7 },
      caller: "embed",
      tools: [{ type: "function", name: "hr-attendance" }],
    });
    expect(out.tool_choice).toBe("required");
  });

  test("TC-7: llmOptions 원본 mutation 금지 (불변성)", () => {
    const input = { temperature: 0.7 };
    const out = injectToolChoice({
      llmOptions: input,
      caller: "embed",
      tools: [{ name: "x" }],
    });
    expect(input).not.toHaveProperty("tool_choice");
    expect(out).not.toBe(input);
  });

  test("TC-7b: 주입 미발생 시 원본 객체 그대로 반환 (동일 참조)", () => {
    const input = { temperature: 0.7 };
    const out = injectToolChoice({
      llmOptions: input,
      caller: "workspace",
      tools: [{ name: "x" }],
    });
    expect(out).toBe(input);
  });
});

describe("toolCallingLoop — caller → LLMConnector forward 통합", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  function buildMockLLMConnector() {
    return {
      streamingEnabled: () => true,
      streamGetChatCompletion: jest.fn().mockResolvedValue({
        metrics: {},
      }),
      handleStream: jest.fn().mockResolvedValue({ text: "mock response" }),
      toolCallingFormat: () => "openai-responses",
    };
  }

  function buildMockResponse() {
    return {
      on: jest.fn(),
      removeListener: jest.fn(),
    };
  }

  test("TC-8: caller='embed' + tools.length≥1 → streamGetChatCompletion에 tool_choice='required' forward", async () => {
    const LLMConnector = buildMockLLMConnector();
    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      caller: "embed",
    });
    // 강제 호출이면 HR tool 뒤에 다른 직원 질문 거절 선택지가 붙는다(specs/016 research R14)
    expect(LLMConnector.streamGetChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        temperature: 0.7,
        tool_choice: "required",
        tools: [
          { type: "function", name: "hr-attendance" },
          expect.objectContaining({ type: "function", name: "hr-other-employee-refusal" }),
        ],
      })
    );
  });

  test("TC-8b: caller 생략 (기본 'workspace') → tool_choice 미전달 (회귀 가드)", async () => {
    const LLMConnector = buildMockLLMConnector();
    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      // caller 생략
    });
    const callArgs = LLMConnector.streamGetChatCompletion.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty("tool_choice");
    expect(callArgs.temperature).toBe(0.7);
  });

  test("TC-8c: caller='embed' + env='false' → tool_choice 미전달 (kill-switch runtime)", async () => {
    process.env[ENV_KEY] = "false";
    const LLMConnector = buildMockLLMConnector();
    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      caller: "embed",
    });
    const callArgs = LLMConnector.streamGetChatCompletion.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty("tool_choice");
  });

  test("TC-8d: embed에서는 첫 호출만 tool_choice='required', tool 결과 재호출부터는 미전달", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [
          {
            name: "hr-attendance",
            call_id: "call-1",
            arguments: '{"emp_no":"12345"}',
          },
        ],
      })
      .mockResolvedValueOnce({ text: "final answer" });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      caller: "embed",
    });

    expect(LLMConnector.streamGetChatCompletion).toHaveBeenCalledTimes(2);
    expect(LLMConnector.streamGetChatCompletion.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        temperature: 0.7,
        tool_choice: "required",
      })
    );
    expect(LLMConnector.streamGetChatCompletion.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        temperature: 0.7,
      })
    );
    expect(
      LLMConnector.streamGetChatCompletion.mock.calls[1][1]
    ).not.toHaveProperty("tool_choice");
  });

  test("TC-8d-2: workspace 라우팅으로 전달된 tool_choice도 tool 결과 재호출부터는 제거", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [
          {
            name: "hr-personnel-search",
            call_id: "call-1",
            arguments:
              '{"query_type":"graduates_by_region","university_names":["서울대학교"],"region":"수도권"}',
          },
        ],
      })
      .mockResolvedValueOnce({ text: "final answer" });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "수도권 대학 졸업자" }],
      tools: [{ type: "function", name: "hr-personnel-search" }],
      llmOptions: { temperature: 0.7, tool_choice: "required" },
      uuid: "u-1",
      sources: [],
      logger: {},
      caller: "workspace",
    });

    expect(LLMConnector.streamGetChatCompletion).toHaveBeenCalledTimes(2);
    expect(LLMConnector.streamGetChatCompletion.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        temperature: 0.7,
        tool_choice: "required",
      })
    );
    expect(LLMConnector.streamGetChatCompletion.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        temperature: 0.7,
      })
    );
    expect(
      LLMConnector.streamGetChatCompletion.mock.calls[1][1]
    ).not.toHaveProperty("tool_choice");
  });

  test("TC-8e: forceToolChoiceRequired=false면 첫 호출에도 tool_choice를 전달하지 않는다", async () => {
    const LLMConnector = buildMockLLMConnector();

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      caller: "embed",
      forceToolChoiceRequired: false,
    });

    const callArgs = LLMConnector.streamGetChatCompletion.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty("tool_choice");
  });
});

// specs/016 — HR tool 결과에 "본인 데이터" 안내를 붙여 모델에 넘긴다(contracts/self-data-notice.md)
describe("toolCallingLoop — HR 결과 본인 데이터 안내 (016)", () => {
  const { ToolExecutor } = require("../executor");
  const { SELF_DATA_NOTICE, ORG_CHART_NOTICE, OTHER_EMPLOYEE_REFUSAL } = require("../../../hrSelfDataNotice");

  function buildLLM(toolCall) {
    const LLMConnector = {
      streamingEnabled: () => true,
      streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }),
      handleStream: jest
        .fn()
        .mockResolvedValueOnce({ text: "", toolCalls: [toolCall] })
        .mockResolvedValueOnce({ text: "final" }),
      toolCallingFormat: () => "openai-responses",
    };
    return LLMConnector;
  }

  async function run(toolCall, toolResult) {
    ToolExecutor.execute.mockResolvedValueOnce(toolResult);
    const LLMConnector = buildLLM(toolCall);
    const out = await toolCallingLoop({
      response: { on: jest.fn(), removeListener: jest.fn() },
      LLMConnector,
      messages: [{ role: "user", content: "김기현 연차 알려줘" }],
      tools: [{ type: "function", name: toolCall.name }],
      llmOptions: {},
      uuid: "u-016",
      sources: [],
      logger: {},
      caller: "workspace",
    });
    const secondMessages = LLMConnector.streamGetChatCompletion.mock.calls[1][0];
    const output = secondMessages.find((m) => m.type === "function_call_output").output;
    return { output, toolTrace: out.toolTrace };
  }

  test("hr tool 결과 끝에 안내가 붙어 모델에 전달된다", async () => {
    const { output } = await run(
      { name: "hr-attendance", call_id: "c1", arguments: '{"query_type":"annual_leave_balance"}' },
      "## HR 근태 - 연차\n\n| 잔여 | 15 |"
    );
    expect(output).toBe(`## HR 근태 - 연차\n\n| 잔여 | 15 |\n\n${SELF_DATA_NOTICE}`);
  });

  test("가드 판정(resultIsGuardrail)은 안내를 붙이기 전 원래 결과로 계산한다", async () => {
    const { output, toolTrace } = await run(
      { name: "hr-attendance", call_id: "c2", arguments: "{}" },
      "> ⚠️ HR 세션이 만료되었습니다."
    );
    expect(toolTrace[0].resultIsGuardrail).toBe(true);
    expect(toolTrace[0].resultLength).toBe("> ⚠️ HR 세션이 만료되었습니다.".length);
    expect(output.endsWith(SELF_DATA_NOTICE)).toBe(true);
  });

  test("조직도(hr-personnel org_members)에는 조직도 안내가, hr가 아닌 tool은 그대로 전달된다", async () => {
    const org = await run(
      { name: "hr-personnel", call_id: "c3", arguments: '{"query_type":"org_members"}' },
      "## HR 인사기록 - 조직원 목록"
    );
    expect(org.output).toBe(`## HR 인사기록 - 조직원 목록\n\n${ORG_CHART_NOTICE}`);
    const web = await run({ name: "web-browsing", call_id: "c4", arguments: "{}" }, "search result");
    expect(web.output).toBe("search result");
  });

  function buildForcedLLM(toolCall) {
    return { ...buildLLM(toolCall), toolCallingFormat: () => "openai-responses" };
  }

  async function runEmbed(toolCall, { tools, forceToolChoiceRequired = true } = {}) {
    ToolExecutor.execute.mockClear();
    const LLMConnector = buildForcedLLM(toolCall);
    await toolCallingLoop({
      response: { on: jest.fn(), removeListener: jest.fn() },
      LLMConnector,
      messages: [{ role: "user", content: "그럼 노지용은?" }],
      tools,
      llmOptions: {},
      uuid: "u-016c",
      sources: [],
      logger: {},
      caller: "embed",
      forceToolChoiceRequired,
    });
    const [firstMessages, firstOptions] = LLMConnector.streamGetChatCompletion.mock.calls[0];
    const secondMessages = LLMConnector.streamGetChatCompletion.mock.calls[1]?.[0] ?? firstMessages;
    const output = secondMessages.find((m) => m.type === "function_call_output")?.output;
    return { toolNames: firstOptions.tools.map((t) => t.name), output };
  }

  test("강제 호출 위젯에서 거절 선택지를 고르면 HR을 실행하지 않고 거절 문구를 전달한다", async () => {
    const hrTools = [{ type: "function", name: "hr-attendance" }];
    const { toolNames, output } = await runEmbed(
      { name: "hr-other-employee-refusal", call_id: "c6", arguments: "{}" },
      { tools: hrTools }
    );
    expect(toolNames).toEqual(["hr-attendance", "hr-other-employee-refusal"]);
    expect(ToolExecutor.execute).not.toHaveBeenCalled();
    expect(output).toBe(OTHER_EMPLOYEE_REFUSAL);
    expect(hrTools).toHaveLength(1); // 입력 배열은 그대로
  });

  test("같은 라운드에 본인 조회와 거절 선택지를 함께 부르면 본인 조회만 실행된다 (섞인 질문)", async () => {
    ToolExecutor.execute.mockClear();
    ToolExecutor.execute.mockResolvedValueOnce("## HR 근태 - 연차\n\n| 잔여 | 22 |");
    const LLMConnector = {
      streamingEnabled: () => true,
      streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }),
      handleStream: jest
        .fn()
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            { name: "hr-attendance", call_id: "m1", arguments: '{"query_type":"annual_leave_balance"}' },
            { name: "hr-other-employee-refusal", call_id: "m2", arguments: "{}" },
          ],
        })
        .mockResolvedValueOnce({ text: "final" }),
      toolCallingFormat: () => "openai-responses",
    };
    await toolCallingLoop({
      response: { on: jest.fn(), removeListener: jest.fn() },
      LLMConnector,
      messages: [{ role: "user", content: "내 연차랑 김기현 연차" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: {},
      uuid: "u-016d",
      sources: [],
      logger: {},
      caller: "embed",
    });
    expect(ToolExecutor.execute).toHaveBeenCalledTimes(1);
    expect(ToolExecutor.execute.mock.calls[0][0].name).toBe("hr-attendance");
    const outputs = LLMConnector.streamGetChatCompletion.mock.calls[1][0]
      .filter((m) => m.type === "function_call_output")
      .map((m) => m.output);
    expect(outputs[0].endsWith(SELF_DATA_NOTICE)).toBe(true);
    expect(outputs[1]).toBe(OTHER_EMPLOYEE_REFUSAL);
  });

  // 강제 여부와 무관하게 HR tool이 있으면 붙는다 — 필터 위젯에서도 다른 직원 질문에 본인 조회를 불렀다(R15)
  test.each([
    ["kill-switch(EMBED_TOOL_CHOICE_REQUIRED=false)", { forceToolChoiceRequired: true }, "false"],
    ["강제 없는 필터 위젯", { forceToolChoiceRequired: false }, undefined],
  ])("%s 에도 HR tool이 있으면 거절 선택지를 붙인다", async (_label, opts, env) => {
    const prev = process.env.EMBED_TOOL_CHOICE_REQUIRED;
    if (env === undefined) delete process.env.EMBED_TOOL_CHOICE_REQUIRED;
    else process.env.EMBED_TOOL_CHOICE_REQUIRED = env;
    try {
      ToolExecutor.execute.mockResolvedValueOnce("r");
      const { toolNames } = await runEmbed(
        { name: "hr-attendance", call_id: "c8", arguments: "{}" },
        { tools: [{ type: "function", name: "hr-attendance" }], ...opts }
      );
      expect(toolNames).toEqual(["hr-attendance", "hr-other-employee-refusal"]);
    } finally {
      if (prev === undefined) delete process.env.EMBED_TOOL_CHOICE_REQUIRED;
      else process.env.EMBED_TOOL_CHOICE_REQUIRED = prev;
    }
  });

  test("HR tool이 없는 목록에는 거절 선택지를 붙이지 않는다", async () => {
    const call = { name: "web-browsing", call_id: "c7", arguments: "{}" };
    ToolExecutor.execute.mockResolvedValueOnce("r");
    const noHr = await runEmbed(call, { tools: [{ type: "function", name: "web-browsing" }] });
    expect(noHr.toolNames).toEqual(["web-browsing"]);
  });

  test.each(["hr-personnel-search", "./hr-personnel-search/"])("차단 skill(%s)은 실행하지 않고 거절 문구를 전달한다", async (name) => {
    ToolExecutor.execute.mockClear();
    const LLMConnector = buildLLM({ name, call_id: "c5", arguments: '{"query":"김기현"}' });
    const out = await toolCallingLoop({
      response: { on: jest.fn(), removeListener: jest.fn() },
      LLMConnector,
      messages: [{ role: "user", content: "김기현 어디 살아?" }],
      tools: [{ type: "function", name: "hr-personnel-search" }],
      llmOptions: {},
      uuid: "u-016b",
      sources: [],
      logger: {},
      caller: "workspace",
    });
    const secondMessages = LLMConnector.streamGetChatCompletion.mock.calls[1][0];
    const output = secondMessages.find((m) => m.type === "function_call_output").output;
    expect(ToolExecutor.execute).not.toHaveBeenCalled();
    expect(output).toBe(OTHER_EMPLOYEE_REFUSAL);
    expect(out.toolTrace[0].resultIsGuardrail).toBe(true);
  });
});
