const { ToolExecutor } = require("./executor");
const { appendToolResult } = require("./appendToolResult");
const { writeResponseChunk } = require("../../helpers/chat/responses");

const MAX_TOOL_ROUNDS = 5;

/**
 * @typedef {Object} ToolCallingLoopLogger
 * @property {Function} [llmStart]      ({ messageCount, streaming }) => void
 * @property {Function} [llmEnd]        ({ responseLength, isEmpty }) => void
 * @property {Function} [toolCall]      ({ name, arguments, round }) => void
 * @property {Function} [toolCallEnd]   ({ name, durationMs, isError }) => void
 * @property {Function} [toolCallMax]   ({ rounds }) => void
 */

/**
 * @typedef {Object} ToolCallingLoopOptions
 * @property {import("express").Response} response  writeResponseChunk 대상
 * @property {Object} LLMConnector                   supportsToolCalling, streamingEnabled 등
 * @property {Array}  messages                       초기 message 배열 (LLM 포맷 완료)
 * @property {Array|null} tools                      post-filter까지 끝난 tool 정의 (null이면 텍스트 전용)
 * @property {Object} llmOptions                     LLM 호출 파라미터
 *   @property {number} llmOptions.temperature       필수
 *   @property {Object} [llmOptions.user]            optional — workspace 경로만 사용, embed는 생략
 *   @property {any}    [llmOptions.*]               provider-specific 추가 옵션 전달 가능
 * @property {string} uuid                            응답 chunk id
 * @property {Array}  sources                         응답 citation
 * @property {ToolCallingLoopLogger} logger
 * @property {number} [maxRounds=MAX_TOOL_ROUNDS]    override용
 * @property {'workspace'|'embed'} [caller='workspace']  tool_choice 주입 분기 (embed + tools≥1 + env≠'false' 시 'required' 주입)
 * @property {Object<string,string>} [toolRuntimeOverrides]  call-site별 runtimeArgs 덮어쓰기 (e.g., {HR_API_BASE_URL: "http://localhost:8001"}).
 *   plugin.json의 setup_args.value는 변경되지 않고, ToolExecutor 호출 시에만 merge됨.
 */

/**
 * Decide tool_choice based on caller context, tools list, and env kill-switch.
 * Pure function — returns a new llmOptions object when injection applies, otherwise the original reference.
 *
 * Injection conditions (all must be true):
 *   - caller === 'embed'
 *   - Array.isArray(tools) && tools.length >= 1
 *   - process.env.EMBED_TOOL_CHOICE_REQUIRED !== 'false' (strict equality)
 *
 * Env is evaluated per-call (no module-load freeze) so kill-switch takes effect on the next request.
 *
 * @param {Object} params
 * @param {Object} params.llmOptions
 * @param {'workspace'|'embed'} params.caller
 * @param {Array|null|undefined} params.tools
 * @returns {Object} llmOptions (possibly with tool_choice='required' added)
 */
function injectToolChoice({ llmOptions, caller, tools }) {
  const envDisabled = process.env.EMBED_TOOL_CHOICE_REQUIRED === "false";
  const hasTools = Array.isArray(tools) && tools.length >= 1;
  if (caller === "embed" && hasTools && !envDisabled) {
    return { ...llmOptions, tool_choice: "required" };
  }
  return llmOptions;
}

/**
 * Shared tool calling loop — streams text chunks to response and executes tools as needed.
 * Returns final text + metrics + toolTrace for caller to persist.
 *
 * @param {ToolCallingLoopOptions} opts
 * @returns {Promise<{completeText: string, metrics: Object, toolTrace: Array}>}
 */
async function toolCallingLoop(opts) {
  const {
    response,
    LLMConnector,
    tools,
    llmOptions,
    uuid,
    sources,
    logger,
    maxRounds = MAX_TOOL_ROUNDS,
    caller = "workspace",
    toolRuntimeOverrides,
  } = opts;

  let currentMessages = [...opts.messages];
  let completeText = "";
  let metrics = {};
  const toolTrace = [];

  for (let round = 0; round <= maxRounds; round++) {
    const roundLlmOptions =
      round === 0
        ? injectToolChoice({ llmOptions, caller, tools })
        : llmOptions;

    if (LLMConnector.streamingEnabled() !== true) {
      // --- Non-streaming path ---
      logger.llmStart?.({
        messageCount: currentMessages.length,
        streaming: false,
      });
      const result = await LLMConnector.getChatCompletion(currentMessages, {
        ...roundLlmOptions,
        tools,
      });
      logger.llmEnd?.({
        responseLength: result?.textResponse?.length || 0,
        isEmpty: !result?.textResponse,
      });

      if (result?.toolCalls?.length > 0 && round < maxRounds) {
        for (const tc of result.toolCalls) {
          currentMessages = await executeAndAppend({
            tc,
            round,
            currentMessages,
            LLMConnector,
            toolTrace,
            logger,
            toolRuntimeOverrides,
          });
        }
        metrics = result.metrics || {};
        continue;
      }

      completeText = result?.textResponse ?? "";
      metrics = result?.metrics || {};
      writeResponseChunk(response, {
        uuid,
        sources,
        type: "textResponseChunk",
        textResponse: completeText,
        close: true,
        error: false,
        metrics,
      });
      break;
    } else {
      // --- Streaming path ---
      logger.llmStart?.({
        messageCount: currentMessages.length,
        streaming: true,
      });
      const stream = await LLMConnector.streamGetChatCompletion(
        currentMessages,
        { ...roundLlmOptions, tools }
      );
      const streamResult = await LLMConnector.handleStream(response, stream, {
        uuid,
        sources,
      });

      if (
        typeof streamResult === "object" &&
        streamResult?.toolCalls?.length > 0 &&
        round < maxRounds
      ) {
        logger.llmEnd?.({
          responseLength: streamResult.text?.length || 0,
          isEmpty: !streamResult.text,
        });
        for (const tc of streamResult.toolCalls) {
          currentMessages = await executeAndAppend({
            tc,
            round,
            currentMessages,
            LLMConnector,
            toolTrace,
            logger,
            toolRuntimeOverrides,
          });
        }
        metrics = stream.metrics || {};
        continue;
      }

      // Max rounds reached but tool calls still present → flush close chunk
      if (
        typeof streamResult === "object" &&
        streamResult?.toolCalls?.length > 0
      ) {
        logger.toolCallMax?.({ rounds: maxRounds });
        writeResponseChunk(response, {
          uuid,
          sources,
          type: "textResponseChunk",
          textResponse: "",
          close: true,
          error: false,
        });
      }

      completeText =
        typeof streamResult === "string"
          ? streamResult
          : streamResult?.text ?? "";
      logger.llmEnd?.({
        responseLength: completeText?.length || 0,
        isEmpty: !completeText,
      });
      metrics = stream.metrics || {};
      break;
    }
  }

  return { completeText, metrics, toolTrace };
}

/**
 * 공통 tool 실행 + 메시지 append + trace 수집.
 * 새 배열을 반환하여 호출측이 재할당하는 패턴 (참조 변이 회피).
 *
 * tc.arguments 타입 주의:
 *  - OpenAI Responses:   string (JSON 직렬화됨)
 *  - Anthropic:          object (input_json_delta 누적 결과)
 *  - Chat Completions:   string (JSON 직렬화됨)
 *  → ToolExecutor.execute() 내부에서 string이면 JSON.parse() 처리 (executor.js:33-36)
 *  → toolTrace에는 원본 그대로 저장 (소비자가 format 컨텍스트로 해석)
 *
 * @returns {Promise<Array>} tool 결과가 추가된 새 메시지 배열
 */
async function executeAndAppend({
  tc,
  round,
  currentMessages,
  LLMConnector,
  toolTrace,
  logger,
  toolRuntimeOverrides,
}) {
  logger.toolCall?.({ name: tc.name, arguments: tc.arguments, round });
  const tcStart = Date.now();
  const toolResult = await ToolExecutor.execute(tc, {
    runtimeOverrides: toolRuntimeOverrides,
  });
  const durationMs = Date.now() - tcStart;
  const isError =
    typeof toolResult === "string" && toolResult.startsWith("Error");
  logger.toolCallEnd?.({ name: tc.name, durationMs, isError });
  toolTrace.push({
    round,
    name: tc.name,
    arguments: tc.arguments,
    resultLength: toolResult?.length || 0,
    durationMs,
    isError,
  });
  return appendToolResult(
    currentMessages,
    tc,
    toolResult,
    LLMConnector.toolCallingFormat()
  );
}

module.exports = { toolCallingLoop, injectToolChoice, MAX_TOOL_ROUNDS };
