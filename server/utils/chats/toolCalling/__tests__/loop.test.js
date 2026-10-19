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
          expect.objectContaining({ type: "function", name: "hr-unsupported-info" }),
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
    expect(toolNames).toEqual(["hr-attendance", "hr-other-employee-refusal", "hr-unsupported-info"]);
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
      expect(toolNames).toEqual(["hr-attendance", "hr-other-employee-refusal", "hr-unsupported-info"]);
    } finally {
      if (prev === undefined) delete process.env.EMBED_TOOL_CHOICE_REQUIRED;
      else process.env.EMBED_TOOL_CHOICE_REQUIRED = prev;
    }
  });

  test("조회 불가 선택지를 고르면 HR을 실행하지 않고 조회 없음 안내를 전달한다(본인 데이터 안내 없음)", async () => {
    const { UNSUPPORTED_NOTICE } = require("../../../hrSelfDataNotice");
    const { output } = await runEmbed(
      { name: "hr-unsupported-info", call_id: "c9", arguments: "{}" },
      { tools: [{ type: "function", name: "hr-attendance" }] }
    );
    expect(ToolExecutor.execute).not.toHaveBeenCalled();
    expect(output).toBe(UNSUPPORTED_NOTICE);
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

describe("toolCallingLoop — HR 표 직접 출력 (018)", () => {
  const { ToolExecutor } = require("../executor");
  const { writeResponseChunk } = require("../../../helpers/chat/responses");
  const { TABLE_NOTICE } = require("../../../hrTableBlocks");

  const LIMIT_TABLE = [
    "| 구분 | 한도 | 사용 | 잔여 |",
    "| --- | --- | --- | --- |",
    "| 이번 달(10월) | 52.0 | 10.0 | 42.0 |",
  ].join("\n");
  const ENTRY_TABLE = [
    "| 일자 | 사유 |",
    "| --- | --- |",
    "| 10/15(목) | — |",
  ].join("\n");
  const HR_RESULT = `## HR 근태 - 연장근무 현황\n\n${LIMIT_TABLE}\n\n> [응답 형식] 표 그대로 보여주세요. 이 줄은 답변에 포함하지 마세요.`;

  // handleStream은 받은 response에 글자를 흘리는 공급자처럼 동작한다
  function streamingLLM(rounds) {
    const handleStream = jest.fn();
    for (const r of rounds) {
      handleStream.mockImplementationOnce(async (response) => {
        if (r.text) response.write(`data: ${JSON.stringify({ type: "textResponseChunk", textResponse: r.text, close: false })}\n\n`);
        return { text: r.text || "", toolCalls: r.toolCalls, closeChunkSent: !r.toolCalls };
      });
    }
    return {
      streamingEnabled: () => true,
      streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: { m: 1 } }),
      handleStream,
      toolCallingFormat: () => "openai-responses",
    };
  }

  function realResponse() {
    return { write: jest.fn(), on: jest.fn(), removeListener: jest.fn(), writable: true, writableEnded: false };
  }

  async function run(LLMConnector, response = realResponse()) {
    writeResponseChunk.mockClear();
    const out = await toolCallingLoop({
      response,
      LLMConnector,
      messages: [{ role: "user", content: "연장근무 알려줘" }],
      tools: [{ type: "function", name: "hr-attendance" }],
      llmOptions: {},
      uuid: "u-018",
      sources: [],
      logger: {},
      caller: "embed",
    });
    return { out, response };
  }

  const hrCall = (id) => ({ name: "hr-attendance", call_id: id, arguments: '{"query_type":"overtime"}' });
  const textChunks = () => writeResponseChunk.mock.calls.map((c) => c[1]).filter((d) => d.type === "textResponseChunk");

  test("(a) 표가 있으면 최종 라운드 글자를 흘리지 않고 문장+표를 한 번에 보낸다 — completeText와 같다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(HR_RESULT);
    const LLM = streamingLLM([{ toolCalls: [hrCall("t1")] }, { text: "이번 달 42시간 남았어요." }]);
    const { out, response } = await run(LLM);
    expect(response.write).not.toHaveBeenCalled();
    const chunks = textChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ close: true, error: false, metrics: { m: 1 } });
    expect(chunks[0].textResponse).toBe(`이번 달 42시간 남았어요.\n\n${LIMIT_TABLE}`);
    expect(out.completeText).toBe(chunks[0].textResponse);
  });

  test("(b) 모델이 쓴 표·수치 목록은 지워지고 시스템 표는 그대로", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(HR_RESULT);
    const modelText = "이번 달 42시간 남았어요.\n\n- 이번 달: 한도 52.0시간, 사용 10.0시간\n| 구분 | 한도 |\n| --- | --- |";
    const { out } = await run(streamingLLM([{ toolCalls: [hrCall("t2")] }, { text: modelText }]));
    expect(out.completeText).toBe(`이번 달 42시간 남았어요.\n\n${LIMIT_TABLE}`);
  });

  test("(c) HR 조회 결과에 표가 없으면 표 없이 문장만 — 연도 검사를 위해 한 번에 보낸다(2026-10-19)", async () => {
    ToolExecutor.execute.mockResolvedValueOnce("> ⚠️ HR 세션이 만료되었습니다.");
    const { out, response } = await run(streamingLLM([{ toolCalls: [hrCall("t3")] }, { text: "다시 로그인해 주세요." }]));
    expect(response.write).not.toHaveBeenCalled();
    expect(textChunks()).toHaveLength(1);
    expect(out.completeText).toBe("다시 로그인해 주세요.");
  });

  test("(d) 비스트리밍 경로도 문장+표 한 번", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(HR_RESULT);
    const LLM = {
      streamingEnabled: () => false,
      getChatCompletion: jest
        .fn()
        .mockResolvedValueOnce({ textResponse: "", toolCalls: [hrCall("t4")] })
        .mockResolvedValueOnce({ textResponse: "- 사용 10.0시간\n42시간 남았어요.", metrics: {} }),
      toolCallingFormat: () => "openai-responses",
    };
    const { out } = await run(LLM);
    const chunks = textChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].textResponse).toBe(`42시간 남았어요.\n\n${LIMIT_TABLE}`);
    expect(out.completeText).toBe(chunks[0].textResponse);
  });

  test("(e) 모델에 넘기는 결과 — [응답 형식] 줄은 빠지고 [표 표시] 줄이 들어간다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(HR_RESULT);
    const LLM = streamingLLM([{ toolCalls: [hrCall("t5")] }, { text: "요약" }]);
    await run(LLM);
    const output = LLM.streamGetChatCompletion.mock.calls[1][0].find((m) => m.type === "function_call_output").output;
    expect(output).not.toMatch(/\[응답 형식\]/);
    expect(output).toContain(TABLE_NOTICE);
  });

  test("(f) 한 라운드에 HR 조회 여러 번 — 블록이 호출 순서대로, 같은 블록은 한 번", async () => {
    ToolExecutor.execute
      .mockResolvedValueOnce(HR_RESULT)
      .mockResolvedValueOnce(`## HR 근태 - 연장근무 현황\n\n${ENTRY_TABLE}`)
      .mockResolvedValueOnce(HR_RESULT);
    const LLM = streamingLLM([
      { toolCalls: [hrCall("t6"), hrCall("t7"), hrCall("t8")] },
      { text: "요약" },
    ]);
    const { out } = await run(LLM);
    expect(out.completeText).toBe(`요약\n\n${LIMIT_TABLE}\n\n${ENTRY_TABLE}`);
  });

  test("(g) 표가 모인 뒤 tool 호출 라운드 — 텍스트는 흘리지 않고 tool 호출 알림은 실제 응답으로", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(HR_RESULT).mockResolvedValueOnce(HR_RESULT);
    const LLM = streamingLLM([
      { toolCalls: [hrCall("t9")] },
      { text: "잠시만요", toolCalls: [hrCall("t10")] },
      { text: "요약" },
    ]);
    const { response } = await run(LLM);
    const invocations = writeResponseChunk.mock.calls.map((c) => c[1]).filter((d) => d.type === "toolCallInvocation");
    expect(invocations).toHaveLength(2);
    expect(response.write).not.toHaveBeenCalled();
  });
});

describe("toolCallingLoop — 단계 조회는 마지막 단계 표만 (018 E2E 회귀)", () => {
  const { ToolExecutor } = require("../executor");
  const { writeResponseChunk } = require("../../../helpers/chat/responses");
  const PERIODS = "## HR 급여 - 지급 건\n\n| 급여 건 |\n|---|\n| 2026-06-19 급여 |";
  const PAYSLIP = "## HR 급여 - 명세\n\n| 항목 | 금액 |\n| --- | --- |\n| 기본급 | 3000000 |";
  const call = (id, q) => ({ name: "hr-salary", call_id: id, arguments: JSON.stringify({ query_type: q }) });

  function llm(rounds) {
    const handleStream = jest.fn();
    rounds.forEach((r) => handleStream.mockImplementationOnce(async () => ({ text: r.text || "", toolCalls: r.toolCalls, closeChunkSent: !r.toolCalls })));
    return { streamingEnabled: () => true, streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }), handleStream, toolCallingFormat: () => "openai-responses" };
  }

  async function run(LLMConnector) {
    writeResponseChunk.mockClear();
    return toolCallingLoop({
      response: { write: jest.fn(), on: jest.fn(), removeListener: jest.fn(), writable: true },
      LLMConnector, messages: [{ role: "user", content: "6월 급여명세서 보여줘" }],
      tools: [{ type: "function", name: "hr-salary" }], llmOptions: {}, uuid: "u", sources: [], logger: {}, caller: "embed",
    });
  }

  test("지급 건 목록 → 명세: 명세 표만 붙는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(PERIODS).mockResolvedValueOnce(PAYSLIP);
    const out = await run(llm([{ toolCalls: [call("p1", "pay_periods")] }, { toolCalls: [call("p2", "payslip")] }, { text: "6월 급여명세서예요." }]));
    expect(out.completeText).toBe("6월 급여명세서예요.\n\n| 항목 | 금액 |\n| --- | --- |\n| 기본급 | 3000000 |");
  });

  test("지급 건 목록만 조회하고 끝나면(목록 질문) 목록 표가 붙는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(PERIODS);
    const out = await run(llm([{ toolCalls: [call("p3", "pay_periods")] }, { text: "6월 지급 건이에요." }]));
    expect(out.completeText).toBe("6월 지급 건이에요.\n\n| 급여 건 |\n|---|\n| 2026-06-19 급여 |");
  });

  test("[표 표시] 지시는 더 필요한 조회를 먼저 하라고 알린다", () => {
    const { TABLE_NOTICE } = require("../../../hrTableBlocks");
    expect(TABLE_NOTICE).toMatch(/조회가 더 필요하면 먼저/);
  });
});

describe("toolCallingLoop — 018 리뷰 반영", () => {
  const { ToolExecutor } = require("../executor");
  const { writeResponseChunk } = require("../../../helpers/chat/responses");
  const OT = "## HR 근태 - 연장근무 현황\n\n| 구분 | 한도 |\n| --- | --- |\n| 이번 달(10월) | 52.0 |";
  const LEAVE = "## HR 근태 - 연차\n\n| 휴가종류 | 잔여일수 |\n| --- | --- |\n| 연차 | 22 |";
  const att = (id, q) => ({ name: "hr-attendance", call_id: id, arguments: JSON.stringify({ query_type: q }) });
  const refusal = (id) => ({ name: "hr-other-employee-refusal", call_id: id, arguments: "{}" });

  function llm(rounds) {
    const handleStream = jest.fn();
    rounds.forEach((r) =>
      handleStream.mockImplementationOnce(async (response) => {
        if (r.text) response.write(`data: ${JSON.stringify({ type: "textResponseChunk", textResponse: r.text })}\n\n`);
        if (r.abort) response.write(`data: ${JSON.stringify({ type: "abort", close: true, error: "stream failed" })}\n\n`);
        return { text: r.text || "", toolCalls: r.toolCalls, closeChunkSent: !r.toolCalls };
      })
    );
    return { streamingEnabled: () => true, streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }), handleStream, toolCallingFormat: () => "openai-responses" };
  }
  const realResponse = () => ({ write: jest.fn(), on: jest.fn(), removeListener: jest.fn(), writable: true, writableEnded: false });
  async function run(LLMConnector, response = realResponse()) {
    writeResponseChunk.mockClear();
    const out = await toolCallingLoop({
      response, LLMConnector, messages: [{ role: "user", content: "q" }],
      tools: [{ type: "function", name: "hr-attendance" }], llmOptions: {}, uuid: "u", sources: [], logger: {}, caller: "embed",
    });
    return { out, response };
  }
  const finalChunks = () => writeResponseChunk.mock.calls.map((c) => c[1]).filter((d) => d.type === "textResponseChunk");

  test("H2: 본인 조회 뒤 모델이 다른 직원이라며 거절하면 표를 붙이지 않는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT);
    const { out } = await run(llm([{ toolCalls: [att("a1", "overtime")] }, { text: "다른 직원의 정보는 조회할 수 없어요." }]));
    expect(out.completeText).toBe("다른 직원의 정보는 조회할 수 없어요.");
  });

  test("H2: 같은 답변에 거절 선택지가 호출되면 본인 표를 붙이지 않는다(섞인 질문)", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT);
    const { out } = await run(llm([{ toolCalls: [att("a2", "overtime"), refusal("r1")] }, { text: "내 몫은 42시간이고, 다른 분은 조회할 수 없어요." }]));
    expect(out.completeText).not.toMatch(/\|/);
  });

  test("D6: 라운드를 나눠 조회한 표는 모두 순서대로 붙는다(준비 단계가 아니면)", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT).mockResolvedValueOnce(LEAVE);
    const { out } = await run(llm([{ toolCalls: [att("a3", "overtime")] }, { toolCalls: [att("a4", "annual_leave_balance")] }, { text: "요약" }]));
    expect(out.completeText).toBe("요약\n\n| 구분 | 한도 |\n| --- | --- |\n| 이번 달(10월) | 52.0 |\n\n| 휴가종류 | 잔여일수 |\n| --- | --- |\n| 연차 | 22 |");
  });

  test("D6: 뒤 라운드 결과에 표가 없어도(오류) 앞 표는 남는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT).mockResolvedValueOnce("> ⚠️ HR 시스템 호출 실패 (HTTP 500).");
    const { out } = await run(llm([{ toolCalls: [att("a5", "overtime")] }, { toolCalls: [att("a6", "annual_leave_balance")] }, { text: "연차는 조회하지 못했어요." }]));
    expect(out.completeText).toBe("연차는 조회하지 못했어요.\n\n| 구분 | 한도 |\n| --- | --- |\n| 이번 달(10월) | 52.0 |");
  });

  test("M-4: 캡처 중 공급자 abort는 실제 응답으로 그대로 전달하고 표 답변을 보내지 않는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT);
    const { out, response } = await run(llm([{ toolCalls: [att("a7", "overtime")] }, { text: "이번 달", abort: true }]));
    const writes = response.write.mock.calls.map((c) => String(c[0]));
    expect(writes.some((w) => w.includes("\"type\":\"abort\""))).toBe(true);
    expect(finalChunks()).toHaveLength(0);
    expect(out.completeText).toBe("");
  });

  test("L-2: tool 호출 전에 흘린 문장이 있으면 표 답변은 줄을 띄워 이어진다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(OT);
    const { out } = await run(llm([{ text: "확인해 볼게요.", toolCalls: [att("a8", "overtime")] }, { text: "42시간 남았어요." }]));
    expect(finalChunks()[0].textResponse.startsWith("\n\n42시간 남았어요.")).toBe(true);
    expect(out.completeText).toBe("확인해 볼게요.\n\n42시간 남았어요.\n\n| 구분 | 한도 |\n| --- | --- |\n| 이번 달(10월) | 52.0 |");
  });

  test("M-5: 표가 있으면 모델에 공통 응답 지침([응답 지침])도 넘기지 않는다", async () => {
    const { ANSWER_GUIDE } = require("../../../../storage/plugins/agent-skills/_shared/formatTable");
    ToolExecutor.execute.mockResolvedValueOnce(OT + ANSWER_GUIDE);
    const L = llm([{ toolCalls: [att("a9", "overtime")] }, { text: "요약" }]);
    await run(L);
    const output = L.streamGetChatCompletion.mock.calls[1][0].find((m) => m.type === "function_call_output").output;
    expect(output).not.toContain("[응답 지침]");
  });
});

describe("toolCallingLoop — 준비 단계 표는 본 조회를 시도했으면 붙이지 않는다 (018 최종 E2E)", () => {
  const { ToolExecutor } = require("../executor");
  const { writeResponseChunk } = require("../../../helpers/chat/responses");
  const PERIODS = "## HR 급여 - 지급 건\n\n| 급여 건 |\n|---|\n| 2026-06-19 급여 |";
  const call = (id, q) => ({ name: "hr-salary", call_id: id, arguments: JSON.stringify({ query_type: q }) });
  function llm(rounds) {
    const handleStream = jest.fn();
    rounds.forEach((r) => handleStream.mockImplementationOnce(async () => ({ text: r.text || "", toolCalls: r.toolCalls, closeChunkSent: !r.toolCalls })));
    return { streamingEnabled: () => true, streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }), handleStream, toolCallingFormat: () => "openai-responses" };
  }
  test("지급 건 목록 → 명세 조회 결과 없음: 목록 표를 붙이지 않는다", async () => {
    writeResponseChunk.mockClear();
    ToolExecutor.execute.mockResolvedValueOnce(PERIODS).mockResolvedValueOnce("> ⚠️ **급여 명세 요약** 조회 결과가 존재하지 않습니다.");
    const out = await toolCallingLoop({
      response: { write: jest.fn(), on: jest.fn(), removeListener: jest.fn(), writable: true },
      LLMConnector: llm([{ toolCalls: [call("q1", "pay_periods")] }, { toolCalls: [call("q2", "payslip_summary")] }, { text: "1월 실수령액은 조회되지 않았어요." }]),
      messages: [{ role: "user", content: "1월 실수령액" }], tools: [{ type: "function", name: "hr-salary" }],
      llmOptions: {}, uuid: "u", sources: [], logger: {}, caller: "embed",
    });
    expect(out.completeText).toBe("1월 실수령액은 조회되지 않았어요.");
  });
});

describe("toolCallingLoop — 지어낸 연도 막기 (2026-10-19 사용자 결정)", () => {
  const { ToolExecutor } = require("../executor");
  const { writeResponseChunk } = require("../../../helpers/chat/responses");
  const NO_DATA = "> ⚠️ **급여 지급 건** 조회 결과가 존재하지 않습니다.";
  function llm(rounds) {
    const handleStream = jest.fn();
    rounds.forEach((r) =>
      handleStream.mockImplementationOnce(async (response) => {
        if (r.text) response.write(`data: ${JSON.stringify({ type: "textResponseChunk", textResponse: r.text })}\n\n`);
        return { text: r.text || "", toolCalls: r.toolCalls, closeChunkSent: !r.toolCalls };
      })
    );
    return { streamingEnabled: () => true, streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }), handleStream, toolCallingFormat: () => "openai-responses" };
  }
  async function run(L, question) {
    writeResponseChunk.mockClear();
    ToolExecutor.execute.mockClear();
    const response = { write: jest.fn(), on: jest.fn(), removeListener: jest.fn(), writable: true };
    const out = await toolCallingLoop({
      response, LLMConnector: L, messages: [{ role: "user", content: question }],
      tools: [{ type: "function", name: "hr-salary" }], llmOptions: {}, uuid: "u", sources: [], logger: {}, caller: "embed",
    });
    return { out, response };
  }
  const salary = (id, args) => ({ name: "hr-salary", call_id: id, arguments: JSON.stringify(args) });

  test("말하지 않은 연도 인자는 떼고 실행하고, 대화 기록에도 고친 인자가 남는다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(NO_DATA);
    const L = llm([{ toolCalls: [salary("y1", { query_type: "pay_periods", year_month: "2023-06" })] }, { text: "6월 지급 건은 없어요." }]);
    await run(L, "6월 급여 지급 건 목록 알려줘");
    expect(JSON.parse(ToolExecutor.execute.mock.calls[0][0].arguments)).toEqual({ query_type: "pay_periods", year_month: "6월" });
    const call = L.streamGetChatCompletion.mock.calls[1][0].find((m) => m.type === "function_call");
    expect(JSON.parse(call.arguments).year_month).toBe("6월");
  });

  test("표가 없는 HR 답변도 근거 없는 'YYYY년'을 지우고 한 번에 보낸다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce(NO_DATA);
    const { out, response } = await run(llm([{ toolCalls: [salary("y2", { query_type: "pay_periods" })] }, { text: "2023년 6월 지급 건은 없어요." }]), "6월 급여 지급 건");
    expect(out.completeText).toBe("6월 지급 건은 없어요.");
    expect(response.write).not.toHaveBeenCalled();
  });

  test("사용자가 말했거나 조회 결과에 나온 연도는 남긴다", async () => {
    ToolExecutor.execute.mockResolvedValueOnce("> 조회 기간: 2025-01 ~ 2025-12 (2025년 전체)\n> ⚠️ 조회 결과가 없습니다.");
    const { out } = await run(llm([{ toolCalls: [salary("y3", { query_type: "salary_statement", year_month: "작년" })] }, { text: "2025년 지급 내역은 없어요." }]), "작년 급여 내역");
    expect(out.completeText).toBe("2025년 지급 내역은 없어요.");
  });

  test("HR tool이 없는 대화는 지금처럼 실시간 스트리밍(연도 검사 없음)", async () => {
    const L = llm([{ text: "2023년은 토끼해예요." }]);
    const { out, response } = await run(L, "2023년은 무슨 해야?");
    expect(response.write).toHaveBeenCalledTimes(1);
    expect(out.completeText).toBe("2023년은 토끼해예요.");
  });
});
