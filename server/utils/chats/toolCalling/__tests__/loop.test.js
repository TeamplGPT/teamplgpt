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
    expect(LLMConnector.streamGetChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        temperature: 0.7,
        tool_choice: "required",
        tools: [{ type: "function", name: "hr-attendance" }],
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
