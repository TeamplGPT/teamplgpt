/**
 * appendToolResult — tool 실행 결과를 provider format에 맞게 messages에 추가.
 *
 * @param {Array} messages - 현재 메시지 배열
 * @param {object} toolCall - { name, call_id|id, arguments }
 * @param {string} result - tool 실행 결과 문자열
 * @param {string} format - "openai-responses"|"anthropic"|"chat-completions"
 * @returns {Array} 업데이트된 메시지 배열
 */
function appendToolResult(messages, toolCall, result, format) {
  const args =
    typeof toolCall.arguments === "object"
      ? JSON.stringify(toolCall.arguments)
      : toolCall.arguments;

  switch (format) {
    case "openai-responses":
      return [
        ...messages,
        {
          type: "function_call",
          name: toolCall.name,
          call_id: toolCall.call_id,
          arguments: args,
        },
        {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: result,
        },
      ];

    case "anthropic":
      return [
        ...messages,
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.name,
              input:
                typeof toolCall.arguments === "string"
                  ? JSON.parse(toolCall.arguments)
                  : toolCall.arguments,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: result,
            },
          ],
        },
      ];

    case "chat-completions":
      return [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCall.id,
              type: "function",
              function: {
                name: toolCall.name,
                arguments: args,
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        },
      ];

    default:
      console.warn(`[appendToolResult] Unknown format: ${format}`);
      return messages;
  }
}

module.exports = { appendToolResult };
