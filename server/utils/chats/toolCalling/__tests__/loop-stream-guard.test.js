/**
 * toolCallingLoop — L1 stream guard unit tests
 * Design §8.3 T-L1-1 ~ T-L1-9 (기존 loop.test.js TC-1~TC-8e는 loop.test.js에서 별도 가드).
 *
 * 대상:
 *   - 라운드 진입 전 isResponseWritable 가드 (T-L1-1, T-L1-8)
 *   - 안전망 close 청크 (T-L1-2)
 *   - 이중 close 방지 (T-L1-3)
 *   - 레거시 string 반환 하위 호환 (T-L1-4)
 *   - maxRounds 도달 경로 (T-L1-5)
 *   - AbortController 전파 (T-L1-6, T-L1-7)
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

const responsesMock = require("../../../helpers/chat/responses");
const { toolCallingLoop } = require("../loop");

function buildMockLLMConnector() {
  return {
    streamingEnabled: () => true,
    streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }),
    handleStream: jest.fn().mockResolvedValue({
      text: "final",
      closeChunkSent: true,
    }),
    toolCallingFormat: () => "openai-responses",
  };
}

function buildMockResponse() {
  const listeners = {};
  return {
    on: jest.fn((evt, cb) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(cb);
    }),
    removeListener: jest.fn((evt, cb) => {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter((fn) => fn !== cb);
    }),
    _emit: (evt) => (listeners[evt] || []).forEach((fn) => fn()),
    _listenerCount: (evt) => (listeners[evt] || []).length,
  };
}

describe("toolCallingLoop — L1 stream guard", () => {
  beforeEach(() => {
    responsesMock.writeResponseChunk.mockClear();
    responsesMock.isResponseWritable.mockReset().mockReturnValue(true);
  });

  test("T-L1-1: round 2 진입 시점에 writable=false → round 0,1만 LLM 호출 후 break", async () => {
    const LLMConnector = buildMockLLMConnector();
    // Each round returns toolCalls to force continuation
    LLMConnector.handleStream
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [{ name: "x", call_id: "c1", arguments: "{}" }],
        closeChunkSent: false,
      })
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [{ name: "x", call_id: "c2", arguments: "{}" }],
        closeChunkSent: false,
      });

    // writable matrix: round 0 → true, round 1 → true, round 2 → false (break)
    responsesMock.isResponseWritable
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      // subsequent calls (safety-net check) return false as well
      .mockReturnValue(false);

    const logger = { streamGuard: jest.fn() };
    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger,
    });

    expect(LLMConnector.streamGetChatCompletion).toHaveBeenCalledTimes(2);
    expect(logger.streamGuard).toHaveBeenCalledWith({
      round: 2,
      reason: "client-disconnected",
    });
  });

  test("T-L1-2: handleStream closeChunkSent=false → 안전망 close 청크 발송", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream.mockResolvedValueOnce({
      text: "tool result acknowledged",
      closeChunkSent: false,
    });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    // last writeResponseChunk is the safety-net close
    const calls = responsesMock.writeResponseChunk.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastPayload = calls[calls.length - 1][1];
    expect(lastPayload.close).toBe(true);
    expect(lastPayload.textResponse).toBe("");
  });

  test("T-L1-3: handleStream closeChunkSent=true → 안전망 skip (이중 close 차단)", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream.mockResolvedValueOnce({
      text: "done",
      closeChunkSent: true,
    });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    // no safety-net write
    expect(responsesMock.writeResponseChunk).not.toHaveBeenCalled();
  });

  test("T-L1-4: handleStream 레거시 string 반환 → closeChunkSent=true로 간주, 안전망 skip", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream.mockResolvedValueOnce("legacy plain text");

    const result = await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    expect(responsesMock.writeResponseChunk).not.toHaveBeenCalled();
    expect(result.completeText).toBe("legacy plain text");
  });

  test("T-L1-5: maxRounds 도달 + toolCalls 지속 → close 청크 1회 (중복 방지)", async () => {
    const LLMConnector = buildMockLLMConnector();
    // Always return toolCalls (never resolves to final text)
    LLMConnector.handleStream.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "x", call_id: "c", arguments: "{}" }],
      closeChunkSent: false,
    });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
      maxRounds: 2,
    });

    // Should write close chunk exactly once (maxRounds path, safety-net skipped)
    const closeCalls = responsesMock.writeResponseChunk.mock.calls.filter(
      (c) => c[1]?.close === true
    );
    expect(closeCalls.length).toBe(1);
  });

  test("T-L1-6: streamGetChatCompletion 에 AbortSignal 전달됨", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream.mockResolvedValueOnce({
      text: "ok",
      closeChunkSent: true,
    });

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    const opts = LLMConnector.streamGetChatCompletion.mock.calls[0][1];
    expect(opts.signal).toBeDefined();
    expect(typeof opts.signal.aborted).toBe("boolean");
  });

  test("T-L1-7: response close 이벤트 → AbortController signal.aborted=true", async () => {
    const LLMConnector = buildMockLLMConnector();
    const response = buildMockResponse();
    let capturedSignal = null;
    LLMConnector.streamGetChatCompletion.mockImplementation(async (_, opts) => {
      capturedSignal = opts.signal;
      return { metrics: {} };
    });
    LLMConnector.handleStream.mockImplementationOnce(async () => {
      // Simulate client close DURING stream processing
      response._emit("close");
      return { text: "", closeChunkSent: true };
    });

    await toolCallingLoop({
      response,
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal.aborted).toBe(true);
  });

  test("T-L1-8: round 0 진입 전 writable=false → streamGuard({round:0}) + LLM 호출 0회", async () => {
    responsesMock.isResponseWritable.mockReturnValue(false);
    const LLMConnector = buildMockLLMConnector();
    const logger = { streamGuard: jest.fn() };

    await toolCallingLoop({
      response: buildMockResponse(),
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger,
    });

    expect(LLMConnector.streamGetChatCompletion).not.toHaveBeenCalled();
    expect(logger.streamGuard).toHaveBeenCalledWith({
      round: 0,
      reason: "client-disconnected",
    });
  });

  test("T-L1-9: close 리스너 cleanup — loop 종료 후 removeListener 호출", async () => {
    const LLMConnector = buildMockLLMConnector();
    LLMConnector.handleStream.mockResolvedValueOnce({
      text: "ok",
      closeChunkSent: true,
    });
    const response = buildMockResponse();

    await toolCallingLoop({
      response,
      LLMConnector,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "x" }],
      llmOptions: { temperature: 0.7 },
      uuid: "u-1",
      sources: [],
      logger: {},
    });

    expect(response.removeListener).toHaveBeenCalledWith(
      "close",
      expect.any(Function)
    );
    // After cleanup, no close listeners remain
    expect(response._listenerCount("close")).toBe(0);
  });
});
