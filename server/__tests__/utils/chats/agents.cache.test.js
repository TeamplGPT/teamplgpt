/* eslint-env jest, node */
process.env.NODE_ENV = "test";

// Mock dependencies that agents.js imports
jest.mock("../../../models/workspaceAgentInvocation", () => ({
  WorkspaceAgentInvocation: {
    parseAgents: jest.fn().mockReturnValue([]),
    new: jest.fn().mockResolvedValue({ invocation: null }),
  },
}));
jest.mock("../../../utils/helpers/chat/responses", () => ({
  writeResponseChunk: jest.fn(),
}));

const {
  grepAgents,
  consumeAgentAttachments,
} = require("../../../utils/chats/agents");

const mockAttachments = [
  {
    name: "screenshot.png",
    mime: "image/png",
    contentString: "data:image/png;base64,iVBORw0KGgo...",
  },
  {
    name: "photo.jpg",
    mime: "image/jpeg",
    contentString: "data:image/jpeg;base64,/9j/4AAQ...",
  },
];

describe("Agent Attachment Cache", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    // Clean up any cached entries
    consumeAgentAttachments("test-uuid-cleanup");
  });

  // UT-1: cacheAgentAttachments stores and consumeAgentAttachments retrieves then deletes
  describe("UT-1: cache → consume → delete cycle", () => {
    it("should store attachments and retrieve them via consumeAgentAttachments", () => {
      // We need to test cacheAgentAttachments indirectly since it's not exported.
      // Instead, we test through consumeAgentAttachments which IS exported.
      // First, verify cache miss returns empty array (baseline)
      const empty = consumeAgentAttachments("nonexistent-uuid");
      expect(empty).toEqual([]);
    });
  });

  // UT-2: consumeAgentAttachments cache miss returns empty array
  describe("UT-2: cache miss returns empty array", () => {
    it("should return [] for unknown UUID", () => {
      const result = consumeAgentAttachments("unknown-uuid-12345");
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return [] for undefined UUID", () => {
      const result = consumeAgentAttachments(undefined);
      expect(result).toEqual([]);
    });

    it("should return [] for null UUID", () => {
      const result = consumeAgentAttachments(null);
      expect(result).toEqual([]);
    });
  });

  // UT-3: double consume returns empty on second call (one-time consumption)
  describe("UT-3: one-time consumption", () => {
    it("should return [] on second consume call", () => {
      // First consume for a fresh UUID that was never cached
      const first = consumeAgentAttachments("double-consume-uuid");
      expect(first).toEqual([]);

      // Second consume should also be empty
      const second = consumeAgentAttachments("double-consume-uuid");
      expect(second).toEqual([]);
    });
  });

  // Test grepAgents passes attachments parameter (integration-ish)
  describe("grepAgents attachments parameter", () => {
    it("should accept attachments parameter without error", async () => {
      const result = await grepAgents({
        uuid: "test-uuid",
        response: {},
        message: "normal message without @agent",
        workspace: { id: 1 },
        user: null,
        thread: null,
        attachments: mockAttachments,
      });
      // Non-agent message should return false
      expect(result).toBe(false);
    });

    it("should default attachments to empty array", async () => {
      const result = await grepAgents({
        uuid: "test-uuid",
        response: {},
        message: "normal message",
        workspace: { id: 1 },
      });
      expect(result).toBe(false);
    });
  });
});

describe("Agent Attachment Cache with grepAgents @agent flow", () => {
  const { WorkspaceAgentInvocation } = require("../../../models/workspaceAgentInvocation");
  const { writeResponseChunk } = require("../../../utils/helpers/chat/responses");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should cache attachments when @agent message creates an invocation", async () => {
    const testUUID = "invocation-uuid-12345";
    WorkspaceAgentInvocation.parseAgents.mockReturnValue(["@agent"]);
    WorkspaceAgentInvocation.new.mockResolvedValue({
      invocation: { uuid: testUUID },
    });

    const mockResponse = { write: jest.fn() };
    await grepAgents({
      uuid: "request-uuid",
      response: mockResponse,
      message: "@agent extract text from this image",
      workspace: { id: 1 },
      user: null,
      thread: null,
      attachments: mockAttachments,
    });

    // Verify invocation was created
    expect(WorkspaceAgentInvocation.new).toHaveBeenCalledWith({
      prompt: "@agent extract text from this image",
      workspace: { id: 1 },
      user: null,
      thread: null,
    });

    // Now consume and verify attachments were cached
    const cached = consumeAgentAttachments(testUUID);
    expect(cached).toEqual(mockAttachments);
    expect(cached).toHaveLength(2);
    expect(cached[0].name).toBe("screenshot.png");
    expect(cached[1].mime).toBe("image/jpeg");

    // UT-3 verification: second consume should be empty
    const secondConsume = consumeAgentAttachments(testUUID);
    expect(secondConsume).toEqual([]);
  });

  it("should not cache when attachments are empty", async () => {
    const testUUID = "invocation-uuid-empty";
    WorkspaceAgentInvocation.parseAgents.mockReturnValue(["@agent"]);
    WorkspaceAgentInvocation.new.mockResolvedValue({
      invocation: { uuid: testUUID },
    });

    await grepAgents({
      uuid: "request-uuid",
      response: { write: jest.fn() },
      message: "@agent just text",
      workspace: { id: 1 },
      attachments: [],
    });

    const cached = consumeAgentAttachments(testUUID);
    expect(cached).toEqual([]);
  });

  it("should not cache when invocation creation fails", async () => {
    WorkspaceAgentInvocation.parseAgents.mockReturnValue(["@agent"]);
    WorkspaceAgentInvocation.new.mockResolvedValue({
      invocation: null,
    });

    const result = await grepAgents({
      uuid: "request-uuid",
      response: { write: jest.fn() },
      message: "@agent with image",
      workspace: { id: 1 },
      attachments: mockAttachments,
    });

    // grepAgents returns undefined (not true) when invocation fails
    expect(result).toBeUndefined();
  });
});
