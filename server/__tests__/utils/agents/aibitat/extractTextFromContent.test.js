/* eslint-env jest, node */
process.env.NODE_ENV = "test";

const {
  extractTextFromContent,
} = require("../../../../utils/agents/aibitat/index");

describe("extractTextFromContent", () => {
  // UT-6: array content → extract text
  describe("UT-6: multimodal array → text extraction", () => {
    it("should extract text from input_text items", () => {
      const content = [
        { type: "input_text", text: "Extract text from this image" },
        { type: "input_image", image_url: "data:image/png;base64,abc..." },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("Extract text from this image");
    });

    it("should extract text from 'text' type items", () => {
      const content = [
        { type: "text", text: "Hello world" },
        { type: "input_image", image_url: "data:image/png;base64,xyz..." },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("Hello world");
    });

    it("should join multiple text items with space", () => {
      const content = [
        { type: "input_text", text: "First part" },
        { type: "input_image", image_url: "data:image/png;base64,abc..." },
        { type: "input_text", text: "Second part" },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("First part Second part");
    });

    it("should return empty string when no text items exist", () => {
      const content = [
        { type: "input_image", image_url: "data:image/png;base64,abc..." },
        { type: "input_image", image_url: "data:image/png;base64,xyz..." },
      ];
      const result = extractTextFromContent(content);
      expect(result).toBe("");
    });

    it("should handle empty array", () => {
      const result = extractTextFromContent([]);
      expect(result).toBe("");
    });
  });

  // UT-7: string input → pass through
  describe("UT-7: string input → return as-is", () => {
    it("should return plain string unchanged", () => {
      const result = extractTextFromContent("Hello, I need help");
      expect(result).toBe("Hello, I need help");
    });

    it("should return empty string unchanged", () => {
      const result = extractTextFromContent("");
      expect(result).toBe("");
    });

    it("should handle string with special characters", () => {
      const input = "@agent 이 이미지에서 글자를 추출해줘";
      const result = extractTextFromContent(input);
      expect(result).toBe(input);
    });
  });

  // Edge cases
  describe("edge cases", () => {
    it("should convert non-string, non-array to string", () => {
      const result = extractTextFromContent(42);
      expect(result).toBe("42");
    });

    it("should convert null to string", () => {
      const result = extractTextFromContent(null);
      expect(result).toBe("null");
    });

    it("should convert undefined to string", () => {
      const result = extractTextFromContent(undefined);
      expect(result).toBe("undefined");
    });

    it("should convert object to string", () => {
      const result = extractTextFromContent({ foo: "bar" });
      expect(result).toBe("[object Object]");
    });
  });
});
