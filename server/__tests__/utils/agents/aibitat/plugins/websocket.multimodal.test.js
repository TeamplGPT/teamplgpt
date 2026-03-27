/* eslint-env jest, node */
process.env.NODE_ENV = "test";

/**
 * Unit tests for WebSocket plugin multimodal support.
 * Feature: agent-multimodal-frontend (Steps 3-4 — handleFeedback + onInterrupt)
 */

jest.mock("../../../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

const { websocket, WEBSOCKET_BAIL_COMMANDS } = require("../../../../../utils/agents/aibitat/plugins/websocket");

/**
 * Create a mock socket with basic send/close capabilities.
 */
function createMockSocket() {
  return {
    send: jest.fn(),
    close: jest.fn(),
  };
}

/**
 * Create a mock AIbitat object for the websocket plugin setup.
 */
function createMockAibitat() {
  const handlers = {};
  return {
    onError: jest.fn((fn) => { handlers.onError = fn; }),
    onMessage: jest.fn((fn) => { handlers.onMessage = fn; }),
    onTerminate: jest.fn((fn) => { handlers.onTerminate = fn; }),
    onInterrupt: jest.fn((fn) => { handlers.onInterrupt = fn; }),
    continue: jest.fn().mockResolvedValue(undefined),
    terminate: jest.fn(),
    introspect: jest.fn(),
    _handlers: handlers,
  };
}

describe("WebSocket plugin — handleFeedback multimodal", () => {
  let mockSocket;
  let mockAibitat;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockAibitat = createMockAibitat();

    // Run the plugin setup
    const pluginInstance = websocket.plugin({
      socket: mockSocket,
      muteUserReply: true,
      introspection: false,
    });
    pluginInstance.setup(mockAibitat);
  });

  describe("handleFeedback resolves { feedback, attachments } object", () => {
    it("should resolve with feedback text and attachments array", async () => {
      // Start askForFeedback — this sets up handleFeedback
      const feedbackPromise = mockSocket.askForFeedback(mockSocket, {
        from: "USER",
        to: "AGENT",
      });

      // Simulate WebSocket message from frontend with attachments
      const wsMessage = JSON.stringify({
        type: "awaitingFeedback",
        feedback: "Extract text from this image",
        attachments: [
          {
            name: "screenshot.png",
            mime: "image/png",
            contentString: "data:image/png;base64,iVBORw0KGgo...",
          },
        ],
      });
      mockSocket.handleFeedback(wsMessage);

      const result = await feedbackPromise;
      expect(result).toEqual({
        feedback: "Extract text from this image",
        attachments: [
          {
            name: "screenshot.png",
            mime: "image/png",
            contentString: "data:image/png;base64,iVBORw0KGgo...",
          },
        ],
      });
    });

    it("should default attachments to [] when not in WebSocket message", async () => {
      const feedbackPromise = mockSocket.askForFeedback(mockSocket, {
        from: "USER",
        to: "AGENT",
      });

      // Simulate legacy message without attachments field
      const wsMessage = JSON.stringify({
        type: "awaitingFeedback",
        feedback: "Just text, no images",
      });
      mockSocket.handleFeedback(wsMessage);

      const result = await feedbackPromise;
      expect(result).toEqual({
        feedback: "Just text, no images",
        attachments: [],
      });
    });

    it("should ignore non-awaitingFeedback messages", async () => {
      const feedbackPromise = mockSocket.askForFeedback(mockSocket, {
        from: "USER",
        to: "AGENT",
      });

      // Send wrong type — should be ignored
      const wrongMessage = JSON.stringify({
        type: "someOtherType",
        feedback: "wrong",
      });
      mockSocket.handleFeedback(wrongMessage);

      // handleFeedback should still be set (not deleted)
      expect(mockSocket.handleFeedback).toBeDefined();

      // Now send correct message
      const correctMessage = JSON.stringify({
        type: "awaitingFeedback",
        feedback: "correct",
      });
      mockSocket.handleFeedback(correctMessage);

      const result = await feedbackPromise;
      expect(result.feedback).toBe("correct");
    });

    it("should clean up handleFeedback after resolving", async () => {
      const feedbackPromise = mockSocket.askForFeedback(mockSocket, {
        from: "USER",
        to: "AGENT",
      });

      mockSocket.handleFeedback(
        JSON.stringify({ type: "awaitingFeedback", feedback: "test" })
      );

      await feedbackPromise;
      expect(mockSocket.handleFeedback).toBeUndefined();
    });

    it("should handle empty attachments array", async () => {
      const feedbackPromise = mockSocket.askForFeedback(mockSocket, {
        from: "USER",
        to: "AGENT",
      });

      const wsMessage = JSON.stringify({
        type: "awaitingFeedback",
        feedback: "no images",
        attachments: [],
      });
      mockSocket.handleFeedback(wsMessage);

      const result = await feedbackPromise;
      expect(result.attachments).toEqual([]);
    });
  });
});

describe("WebSocket plugin — onInterrupt typeof branching", () => {
  let mockSocket;
  let mockAibitat;
  let interruptHandler;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockAibitat = createMockAibitat();

    const pluginInstance = websocket.plugin({
      socket: mockSocket,
      muteUserReply: true,
      introspection: false,
    });
    pluginInstance.setup(mockAibitat);

    // Capture the onInterrupt handler
    interruptHandler = mockAibitat.onInterrupt.mock.calls[0][0];
  });

  describe("bail command detection with object result", () => {
    for (const bailCmd of WEBSOCKET_BAIL_COMMANDS) {
      it(`should detect bail command "${bailCmd}" from object result`, async () => {
        // Mock askForFeedback to return an object with bail command
        mockSocket.askForFeedback = jest.fn().mockResolvedValue({
          feedback: bailCmd,
          attachments: [],
        });

        await interruptHandler({ from: "USER", to: "AGENT" });

        expect(mockSocket.close).toHaveBeenCalled();
        expect(mockAibitat.continue).not.toHaveBeenCalled();
      });
    }
  });

  describe("bail command detection with string result (timeout fallback)", () => {
    it('should detect "exit" string from timeout fallback', async () => {
      // Timeout resolves with plain string "exit"
      mockSocket.askForFeedback = jest.fn().mockResolvedValue("exit");

      await interruptHandler({ from: "USER", to: "AGENT" });

      expect(mockSocket.close).toHaveBeenCalled();
      expect(mockAibitat.continue).not.toHaveBeenCalled();
    });

    it('should detect "/exit" string', async () => {
      mockSocket.askForFeedback = jest.fn().mockResolvedValue("/exit");

      await interruptHandler({ from: "USER", to: "AGENT" });

      expect(mockSocket.close).toHaveBeenCalled();
    });
  });

  describe("normal feedback passthrough", () => {
    it("should pass object result to aibitat.continue()", async () => {
      const feedbackObj = {
        feedback: "Here is my response",
        attachments: [
          { name: "img.png", mime: "image/png", contentString: "data:image/png;base64,ABC" },
        ],
      };
      mockSocket.askForFeedback = jest.fn().mockResolvedValue(feedbackObj);

      await interruptHandler({ from: "USER", to: "AGENT" });

      expect(mockSocket.close).not.toHaveBeenCalled();
      expect(mockAibitat.continue).toHaveBeenCalledWith(feedbackObj);
    });

    it("should pass string result to aibitat.continue() for non-bail text", async () => {
      mockSocket.askForFeedback = jest.fn().mockResolvedValue("normal text");

      await interruptHandler({ from: "USER", to: "AGENT" });

      expect(mockSocket.close).not.toHaveBeenCalled();
      expect(mockAibitat.continue).toHaveBeenCalledWith("normal text");
    });

    it("should pass object with empty attachments to aibitat.continue()", async () => {
      const feedbackObj = { feedback: "just text", attachments: [] };
      mockSocket.askForFeedback = jest.fn().mockResolvedValue(feedbackObj);

      await interruptHandler({ from: "USER", to: "AGENT" });

      expect(mockAibitat.continue).toHaveBeenCalledWith(feedbackObj);
    });
  });
});

describe("WEBSOCKET_BAIL_COMMANDS", () => {
  it("should include all expected bail commands", () => {
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("exit");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("/exit");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("stop");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("/stop");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("halt");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("/halt");
    expect(WEBSOCKET_BAIL_COMMANDS).toContain("/reset");
  });
});
