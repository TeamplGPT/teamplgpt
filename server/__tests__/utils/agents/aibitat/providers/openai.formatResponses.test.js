/* eslint-env jest, node */
process.env.NODE_ENV = "test";
process.env.OPEN_AI_KEY = "sk-test-key-for-unit-test";

// Mock the OpenAI client so we don't make real API calls
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn(),
    },
  }));
});

const OpenAIProvider = require("../../../../../utils/agents/aibitat/providers/openai");

describe("OpenAIProvider #formatToResponsesInput", () => {
  let provider;

  beforeEach(() => {
    provider = new OpenAIProvider({
      options: { apiKey: "sk-test-key" },
      model: "gpt-4o",
    });
  });

  // Access the private method through complete() by intercepting the client call
  // We capture the `input` parameter passed to responses.create
  async function captureFormattedInput(messages) {
    let capturedInput = null;

    provider.client.responses.create = jest.fn().mockImplementation((params) => {
      capturedInput = params.input;
      // Return a minimal valid response
      return { output: [{ type: "message", content: [{ type: "output_text", text: "test" }] }] };
    });

    try {
      await provider.complete(messages);
    } catch {
      // Ignore errors from incomplete mock
    }

    return capturedInput;
  }

  // UT-8: multimodal array content pass-through
  describe("UT-8: multimodal array content pass-through", () => {
    it("should pass array content as-is without wrapping", async () => {
      const multimodalContent = [
        { type: "input_text", text: "Describe this image" },
        { type: "input_image", image_url: "data:image/png;base64,iVBOR..." },
      ];

      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: multimodalContent },
      ];

      const formatted = await captureFormattedInput(messages);

      // System message should be wrapped in standard format
      expect(formatted[0]).toEqual({
        role: "system",
        content: [{ type: "input_text", text: "You are a helpful assistant" }],
      });

      // User message with array content should pass through as-is
      expect(formatted[1]).toEqual({
        role: "user",
        content: multimodalContent,
      });
    });

    it("should handle multiple images in content array", async () => {
      const multiImageContent = [
        { type: "input_text", text: "Compare these images" },
        { type: "input_image", image_url: "data:image/png;base64,first..." },
        { type: "input_image", image_url: "data:image/png;base64,second..." },
      ];

      const messages = [
        { role: "system", content: "You are a vision assistant" },
        { role: "user", content: multiImageContent },
      ];

      const formatted = await captureFormattedInput(messages);

      expect(formatted[1].content).toHaveLength(3);
      expect(formatted[1].content[0].type).toBe("input_text");
      expect(formatted[1].content[1].type).toBe("input_image");
      expect(formatted[1].content[2].type).toBe("input_image");
    });
  });

  // UT-9: string content wrapping (regression)
  describe("UT-9: string content wrapping — regression", () => {
    it("should wrap user string content in input_text", async () => {
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Hello, help me" },
      ];

      const formatted = await captureFormattedInput(messages);

      expect(formatted[0]).toEqual({
        role: "system",
        content: [{ type: "input_text", text: "System prompt" }],
      });

      expect(formatted[1]).toEqual({
        role: "user",
        content: [{ type: "input_text", text: "Hello, help me" }],
      });
    });

    it("should wrap assistant string content in output_text", async () => {
      const messages = [
        { role: "system", content: "System" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello! How can I help?" },
      ];

      const formatted = await captureFormattedInput(messages);

      expect(formatted[2]).toEqual({
        role: "assistant",
        content: [{ type: "output_text", text: "Hello! How can I help?" }],
      });
    });

    it("should handle function messages with originalFunctionCall", async () => {
      const messages = [
        { role: "system", content: "System" },
        {
          role: "function",
          content: '{"result": "success"}',
          name: "search_documents",
          originalFunctionCall: {
            name: "search_documents",
            id: "call_abc123",
            arguments: { query: "test" },
          },
        },
      ];

      const formatted = await captureFormattedInput(messages);

      // System message
      expect(formatted[0].role).toBe("system");

      // Function call should be expanded to function_call + function_call_output
      expect(formatted[1]).toEqual({
        type: "function_call",
        name: "search_documents",
        call_id: "call_abc123",
        arguments: JSON.stringify({ query: "test" }),
      });

      expect(formatted[2]).toEqual({
        type: "function_call_output",
        call_id: "call_abc123",
        output: '{"result": "success"}',
      });
    });
  });

  // Mixed scenario: string and array content in same conversation
  describe("mixed content types in conversation", () => {
    it("should handle first message as multimodal and rest as text", async () => {
      const messages = [
        { role: "system", content: "You are an agent" },
        {
          role: "user",
          content: [
            { type: "input_text", text: "What is in this image?" },
            { type: "input_image", image_url: "data:image/png;base64,abc..." },
          ],
        },
        { role: "assistant", content: "I can see a document with text..." },
        { role: "user", content: "Can you extract the text?" },
      ];

      const formatted = await captureFormattedInput(messages);

      // System - wrapped
      expect(formatted[0].content[0].type).toBe("input_text");

      // First user - multimodal array pass-through
      expect(Array.isArray(formatted[1].content)).toBe(true);
      expect(formatted[1].content).toHaveLength(2);
      expect(formatted[1].content[0].type).toBe("input_text");
      expect(formatted[1].content[1].type).toBe("input_image");

      // Assistant - wrapped in output_text
      expect(formatted[2].content[0].type).toBe("output_text");

      // Second user - wrapped in input_text
      expect(formatted[3].content[0].type).toBe("input_text");
      expect(formatted[3].content[0].text).toBe("Can you extract the text?");
    });
  });
});
