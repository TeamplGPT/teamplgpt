/**
 * appendToolResult 단위테스트
 *
 * 테스트 범위:
 * - openai-responses format: function_call + function_call_output
 * - anthropic format: tool_use + tool_result
 * - chat-completions format: assistant.tool_calls + tool role
 * - unknown format: messages 그대로 반환
 * - arguments object/string 양방향 처리
 */

const {
  appendToolResult,
} = require("../../../../utils/chats/toolCalling/appendToolResult");

const BASE_MESSAGES = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "내 학력 조회해줘" },
];

const TOOL_RESULT = "> 학력: 서울대학교 컴퓨터공학과 (2015 졸업)";

describe("appendToolResult", () => {
  describe("openai-responses format", () => {
    const toolCall = {
      name: "hr-personnel",
      call_id: "call_abc123",
      arguments: { emp_no: "12345", query_type: "education" },
    };

    it("function_call + function_call_output 메시지를 추가해야 한다", () => {
      const result = appendToolResult(
        BASE_MESSAGES,
        toolCall,
        TOOL_RESULT,
        "openai-responses"
      );

      expect(result).toHaveLength(4); // 기존 2 + 신규 2
      expect(result[2]).toEqual({
        type: "function_call",
        name: "hr-personnel",
        call_id: "call_abc123",
        arguments: '{"emp_no":"12345","query_type":"education"}',
      });
      expect(result[3]).toEqual({
        type: "function_call_output",
        call_id: "call_abc123",
        output: TOOL_RESULT,
      });
    });

    it("arguments가 string이면 그대로 전달해야 한다", () => {
      const stringArgsCall = {
        ...toolCall,
        arguments: '{"emp_no":"12345"}',
      };
      const result = appendToolResult(
        BASE_MESSAGES,
        stringArgsCall,
        TOOL_RESULT,
        "openai-responses"
      );

      expect(result[2].arguments).toBe('{"emp_no":"12345"}');
    });
  });

  describe("anthropic format", () => {
    const toolCall = {
      id: "toolu_abc123",
      name: "hr-personnel",
      arguments: { emp_no: "12345", query_type: "education" },
    };

    it("assistant(tool_use) + user(tool_result) 메시지를 추가해야 한다", () => {
      const result = appendToolResult(
        BASE_MESSAGES,
        toolCall,
        TOOL_RESULT,
        "anthropic"
      );

      expect(result).toHaveLength(4);

      // Assistant message with tool_use
      expect(result[2].role).toBe("assistant");
      expect(result[2].content[0]).toEqual({
        type: "tool_use",
        id: "toolu_abc123",
        name: "hr-personnel",
        input: { emp_no: "12345", query_type: "education" },
      });

      // User message with tool_result
      expect(result[3].role).toBe("user");
      expect(result[3].content[0]).toEqual({
        type: "tool_result",
        tool_use_id: "toolu_abc123",
        content: TOOL_RESULT,
      });
    });
  });

  describe("chat-completions format", () => {
    const toolCall = {
      id: "call_abc123",
      name: "hr-personnel",
      arguments: { emp_no: "12345", query_type: "education" },
    };

    it("assistant(tool_calls) + tool role 메시지를 추가해야 한다", () => {
      const result = appendToolResult(
        BASE_MESSAGES,
        toolCall,
        TOOL_RESULT,
        "chat-completions"
      );

      expect(result).toHaveLength(4);

      // Assistant message with tool_calls
      expect(result[2]).toEqual({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: {
              name: "hr-personnel",
              arguments: '{"emp_no":"12345","query_type":"education"}',
            },
          },
        ],
      });

      // Tool role message
      expect(result[3]).toEqual({
        role: "tool",
        tool_call_id: "call_abc123",
        content: TOOL_RESULT,
      });
    });
  });

  describe("unknown format", () => {
    it("messages를 변경하지 않고 그대로 반환해야 한다", () => {
      const result = appendToolResult(
        BASE_MESSAGES,
        { name: "test", id: "1", arguments: {} },
        "result",
        "unknown-format"
      );

      expect(result).toEqual(BASE_MESSAGES);
      expect(result).toHaveLength(2);
    });
  });

  describe("원본 messages 불변성", () => {
    it("원본 messages 배열을 수정하지 않아야 한다", () => {
      const original = [...BASE_MESSAGES];
      appendToolResult(
        BASE_MESSAGES,
        { name: "test", call_id: "1", arguments: {} },
        "result",
        "openai-responses"
      );

      expect(BASE_MESSAGES).toEqual(original);
    });
  });
});
