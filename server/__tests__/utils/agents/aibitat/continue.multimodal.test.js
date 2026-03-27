/* eslint-env jest, node */
process.env.NODE_ENV = "test";

/**
 * Unit tests for AIbitat.continue() multimodal support.
 * Feature: agent-multimodal-frontend (Step 5 — continue() backward compat + multimodal content)
 */

// Minimal mock setup for AIbitat class
jest.mock("../../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

const AIbitat = require("../../../../utils/agents/aibitat/index");

function createAibitatWithInterrupt() {
  const aibitat = new AIbitat({
    provider: "openai",
    model: "gpt-4o",
    maxRounds: 10,
  });

  // Simulate an interrupted chat state
  aibitat._chats = [
    {
      from: "USER",
      to: "AGENT",
      content: "previous message",
      state: "interrupt",
    },
  ];

  // Stub chat() and newMessage() to capture calls
  aibitat.chat = jest.fn().mockResolvedValue(undefined);
  aibitat.newMessage = jest.fn((message) => {
    aibitat._chats.push({ ...message, state: "success" });
  });

  return aibitat;
}

describe("AIbitat.continue() multimodal support", () => {
  // --- Backward Compatibility ---
  describe("backward compatibility: string argument", () => {
    it("should handle plain string feedback (existing behavior)", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue("Hello, this is text only");

      expect(aibitat.newMessage).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
        content: "Hello, this is text only",
      });
      expect(aibitat.chat).toHaveBeenCalledWith({
        to: "USER",
        from: "AGENT",
      });
    });

    it("should handle empty string feedback — falls through to else branch", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue("");

      // Empty string is falsy, so should go to else branch
      expect(aibitat.newMessage).not.toHaveBeenCalled();
      expect(aibitat.chat).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
      });
    });
  });

  // --- Object argument with empty attachments ---
  describe("object argument: { feedback, attachments: [] }", () => {
    it("should treat as plain text when attachments is empty", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({ feedback: "Text with no images", attachments: [] });

      expect(aibitat.newMessage).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
        content: "Text with no images",
      });
    });

    it("should default attachments to [] when not provided in object", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({ feedback: "Just feedback" });

      expect(aibitat.newMessage).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
        content: "Just feedback",
      });
    });
  });

  // --- Object argument with attachments (NEW multimodal) ---
  describe("object argument: { feedback, attachments: [...] } — multimodal", () => {
    const mockAttachments = [
      {
        name: "screenshot.png",
        mime: "image/png",
        contentString: "data:image/png;base64,iVBORw0KGgo...",
      },
    ];

    it("should build multimodal content array with input_text + input_image", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({
        feedback: "Extract text from this image",
        attachments: mockAttachments,
      });

      expect(aibitat.newMessage).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
        content: [
          { type: "input_text", text: "Extract text from this image" },
          { type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo..." },
        ],
      });
    });

    it("should handle multiple attachments", async () => {
      const multiAttachments = [
        { name: "img1.png", mime: "image/png", contentString: "data:image/png;base64,AAA" },
        { name: "img2.jpg", mime: "image/jpeg", contentString: "data:image/jpeg;base64,BBB" },
      ];

      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({
        feedback: "Compare these two images",
        attachments: multiAttachments,
      });

      const calledContent = aibitat.newMessage.mock.calls[0][0].content;
      expect(calledContent).toHaveLength(3); // 1 text + 2 images
      expect(calledContent[0]).toEqual({ type: "input_text", text: "Compare these two images" });
      expect(calledContent[1]).toEqual({ type: "input_image", image_url: "data:image/png;base64,AAA" });
      expect(calledContent[2]).toEqual({ type: "input_image", image_url: "data:image/jpeg;base64,BBB" });
    });

    it("should call chat() after newMessage with swapped from/to", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({
        feedback: "With image",
        attachments: mockAttachments,
      });

      expect(aibitat.chat).toHaveBeenCalledWith({
        to: "USER",
        from: "AGENT",
      });
    });
  });

  // --- Null / undefined handling ---
  describe("null and undefined handling", () => {
    it("should handle null argument — goes to else branch", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue(null);

      expect(aibitat.newMessage).not.toHaveBeenCalled();
      expect(aibitat.chat).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
      });
    });

    it("should handle undefined argument — goes to else branch", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue(undefined);

      expect(aibitat.newMessage).not.toHaveBeenCalled();
      expect(aibitat.chat).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
      });
    });

    it("should handle { feedback: null } — goes to else branch", async () => {
      const aibitat = createAibitatWithInterrupt();
      await aibitat.continue({ feedback: null, attachments: [] });

      expect(aibitat.newMessage).not.toHaveBeenCalled();
      expect(aibitat.chat).toHaveBeenCalledWith({
        from: "USER",
        to: "AGENT",
      });
    });
  });

  // --- Error conditions ---
  describe("error conditions", () => {
    it("should throw when no interrupted chat exists", async () => {
      const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
      aibitat._chats = [];

      await expect(aibitat.continue("test")).rejects.toThrow("No chat to continue");
    });

    it("should throw when last chat is not interrupted", async () => {
      const aibitat = new AIbitat({ provider: "openai", model: "gpt-4o" });
      aibitat._chats = [
        { from: "USER", to: "AGENT", content: "test", state: "success" },
      ];

      await expect(aibitat.continue("test")).rejects.toThrow("No chat to continue");
    });
  });

  // --- Interrupt state cleanup ---
  describe("interrupt state cleanup", () => {
    it("should remove the interrupt chat entry before processing", async () => {
      const aibitat = createAibitatWithInterrupt();
      expect(aibitat._chats).toHaveLength(1);
      expect(aibitat._chats[0].state).toBe("interrupt");

      await aibitat.continue("test");

      // Interrupt entry removed, new success entry added
      const states = aibitat._chats.map((c) => c.state);
      expect(states).not.toContain("interrupt");
    });
  });
});
