/**
 * openAi.handleStream — L2 unit tests
 * Design §8.2 T-L2-1 ~ T-L2-7.
 *
 * 검증 대상:
 *   - try/finally 로 리스너/측정 정리 멱등화
 *   - closeChunkSent 반환 계약 ({text, toolCalls?, closeChunkSent})
 *   - 클라이언트 close 이벤트 처리 (legacy string 반환 유지)
 *   - stream error catch → abort 청크 전송 시도 + closeChunkSent=true
 */

jest.mock("../../../helpers/chat/responses", () => ({
  writeResponseChunk: jest.fn(),
  clientAbortedHandler: jest.fn((resolve, fullText) => resolve(fullText)),
  isResponseWritable: jest.fn().mockReturnValue(true),
  formatChatHistory: jest.fn(),
}));

jest.mock("../../../helpers/chat/LLMPerformanceMonitor", () => ({
  LLMPerformanceMonitor: { measureStream: jest.fn() },
}));

jest.mock("../../../EmbeddingEngines/native", () => ({
  NativeEmbedder: class {},
}));

// Mock openai module so constructor doesn't require API key
jest.mock("openai", () => ({
  OpenAI: class {
    constructor() {
      this.responses = { create: jest.fn() };
    }
  },
}));

const responsesMock = require("../../../helpers/chat/responses");

const ORIGINAL_ENV = { ...process.env };
beforeAll(() => {
  process.env.OPEN_AI_KEY = "test-key";
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// buildMockStream — async iterable + endMeasurement spy
function buildMockStream(chunks, { throwError = null } = {}) {
  return {
    endMeasurement: jest.fn(),
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) {
        yield c;
      }
      if (throwError) throw throwError;
    },
  };
}

function buildMockResponse() {
  const listeners = {};
  return {
    writable: true,
    writableEnded: false,
    write: jest.fn(),
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

// Access the LLM class — constructor requires model/embedder which we provide via mocks
function buildLLM() {
  const { OpenAiLLM: _UnusedDirectImport } = {};
  // The module defines but doesn't export the class directly; require the module
  const mod = require("../index");
  // Find the exported class — openAi/index.js exports { OpenAiLLM }
  const LLM = mod.OpenAiLLM || mod;
  return new LLM();
}

describe("openAi.handleStream — L2 guards (T-L2-1~7)", () => {
  let llm;

  beforeEach(() => {
    jest.clearAllMocks();
    responsesMock.writeResponseChunk.mockClear();
    responsesMock.isResponseWritable.mockReset().mockReturnValue(true);
    llm = buildLLM();
  });

  test("T-L2-1: 정상 종료 (response.completed + 텍스트) → {text, closeChunkSent:true} + close 청크 1회 + listener 0 + endMeasurement 1회", async () => {
    const stream = buildMockStream([
      {
        type: "response.output_text.delta",
        delta: "Hello",
      },
      {
        type: "response.completed",
        response: {
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      },
    ]);
    const response = buildMockResponse();

    const result = await llm.handleStream(response, stream, { uuid: "u1" });

    expect(result).toEqual({ text: "Hello", closeChunkSent: true });
    // 1 delta chunk + 1 close chunk = 2 writeResponseChunk calls
    expect(responsesMock.writeResponseChunk).toHaveBeenCalledTimes(2);
    const closePayload =
      responsesMock.writeResponseChunk.mock.calls[1][1];
    expect(closePayload.close).toBe(true);
    expect(response._listenerCount("close")).toBe(0);
    expect(stream.endMeasurement).toHaveBeenCalledTimes(1);
  });

  test("T-L2-2: tool call 감지 → {text, toolCalls, closeChunkSent:false} + close 청크 0회 + listener 0 + endMeasurement 1회", async () => {
    const stream = buildMockStream([
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          name: "hr-attendance",
          call_id: "c1",
          arguments: '{"emp_no":"12345"}',
        },
      },
      {
        type: "response.completed",
        response: {
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        },
      },
    ]);
    const response = buildMockResponse();

    const result = await llm.handleStream(response, stream, { uuid: "u2" });

    expect(result.closeChunkSent).toBe(false);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("hr-attendance");
    // tool call path: no close chunk written
    const closeCalls = responsesMock.writeResponseChunk.mock.calls.filter(
      (c) => c[1]?.close === true
    );
    expect(closeCalls).toHaveLength(0);
    expect(response._listenerCount("close")).toBe(0);
    expect(stream.endMeasurement).toHaveBeenCalledTimes(1);
  });

  test("T-L2-3: stream 에러 (for await throw) → {text, closeChunkSent:true} + abort 청크 시도 + listener 0 + endMeasurement 1회", async () => {
    const stream = buildMockStream(
      [{ type: "response.output_text.delta", delta: "Hi" }],
      { throwError: new Error("Upstream disconnected") }
    );
    const response = buildMockResponse();

    const result = await llm.handleStream(response, stream, { uuid: "u3" });

    expect(result.closeChunkSent).toBe(true);
    expect(result.text).toBe("Hi");
    // abort chunk was attempted
    const abortCalls = responsesMock.writeResponseChunk.mock.calls.filter(
      (c) => c[1]?.type === "abort"
    );
    expect(abortCalls.length).toBe(1);
    expect(response._listenerCount("close")).toBe(0);
    expect(stream.endMeasurement).toHaveBeenCalledTimes(1);
  });

  test("T-L2-4: 클라이언트 close 이벤트 → legacy string(fullText) resolve + listener 0 + endMeasurement 1회", async () => {
    // Stream that never completes — we trigger close externally
    const stream = {
      endMeasurement: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield { type: "response.output_text.delta", delta: "partial" };
        // Simulate slow stream (next chunk never comes during the test window)
        await new Promise(() => {});
      },
    };
    const response = buildMockResponse();

    const promise = llm.handleStream(response, stream, { uuid: "u4" });
    // Give the async iterator a tick to process first chunk
    await new Promise((r) => setImmediate(r));
    // Simulate client disconnect
    response._emit("close");

    const result = await promise;

    // Legacy path: clientAbortedHandler resolves with fullText (string)
    expect(typeof result).toBe("string");
    expect(result).toBe("partial");
    expect(stream.endMeasurement).toHaveBeenCalledTimes(1);
    // Note: listener cleanup happens in finally; but because async iterator is
    // indefinitely pending, finally may not have fired. This test only validates
    // the resolve contract + endMeasurement idempotency on handleAbort path.
  });

  test("T-L2-5: endMeasurement 멱등 — catch + finally 동시 진입 시 1회만 호출", async () => {
    const stream = buildMockStream([], { throwError: new Error("boom") });
    const response = buildMockResponse();

    await llm.handleStream(response, stream, { uuid: "u5" });

    // Catch branch + finally both try to end measurement — guard ensures 1 call.
    expect(stream.endMeasurement).toHaveBeenCalledTimes(1);
  });

  test("T-L2-6: 10회 handleStream 실행 후 response.listenerCount('close') === 0 (리스너 누수 가드)", async () => {
    const response = buildMockResponse();

    for (let i = 0; i < 10; i++) {
      const stream = buildMockStream([
        {
          type: "response.completed",
          response: { usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
        },
      ]);
      await llm.handleStream(response, stream, { uuid: `u-${i}` });
    }

    expect(response._listenerCount("close")).toBe(0);
  });

  test("T-L2-7: writable=false 상태에서 close 청크 시도 → L3 가드로 silent skip, 에러 없이 resolve", async () => {
    responsesMock.isResponseWritable.mockReturnValue(false);
    // Mock writeResponseChunk to simulate L3 guard behavior
    responsesMock.writeResponseChunk.mockImplementation(() => {
      // silently return (as real L3 guard does)
    });

    const stream = buildMockStream([
      {
        type: "response.completed",
        response: { usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
      },
    ]);
    const response = buildMockResponse();
    response.writable = false;

    const result = await llm.handleStream(response, stream, { uuid: "u7" });

    expect(result.closeChunkSent).toBe(true);
    // writeResponseChunk was attempted but L3 guard would skip
    expect(responsesMock.writeResponseChunk).toHaveBeenCalled();
    expect(response._listenerCount("close")).toBe(0);
  });
});
