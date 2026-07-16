const { ToolExecutor } = require("./executor");
const { appendToolResult } = require("./appendToolResult");
const {
  writeResponseChunk,
  isResponseWritable,
} = require("../../helpers/chat/responses");

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
 * @property {boolean} [forceToolChoiceRequired=true]  embed에서 tool_choice='required' 강제 여부
 * @property {Object<string,string>} [toolRuntimeOverrides]  call-site별 runtimeArgs 덮어쓰기 (e.g., {HR_API_BASE_URL: "http://localhost:8001"}).
 *   plugin.json의 setup_args.value는 변경되지 않고, ToolExecutor 호출 시에만 merge됨.
 * @property {import('./clientToolBroker').ClientToolBroker} [clientToolBroker]  R1 클라이언트 실행 위임
 *   브로커 (embed 전용, specs/003). 존재 시 skill handler에 clientToolTransport가 주입된다.
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
function injectToolChoice({ llmOptions, caller, tools, forceToolChoiceRequired = true }) {
  const envDisabled = process.env.EMBED_TOOL_CHOICE_REQUIRED === "false";
  const hasTools = Array.isArray(tools) && tools.length >= 1;
  if (caller === "embed" && hasTools && !envDisabled && forceToolChoiceRequired) {
    return { ...llmOptions, tool_choice: "required" };
  }
  return llmOptions;
}

function omitToolChoice(llmOptions) {
  if (
    !llmOptions ||
    !Object.prototype.hasOwnProperty.call(llmOptions, "tool_choice")
  ) {
    return llmOptions;
  }
  const { tool_choice: _toolChoice, ...rest } = llmOptions;
  return rest;
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
    forceToolChoiceRequired = true,
    toolRuntimeOverrides,
    clientToolBroker = null,
  } = opts;

  // AbortController: propagate client disconnect to upstream fetch (best-effort).
  // Provider must support `signal` in streamGetChatCompletion for this to take effect.
  const abortController =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const abortOnClose = () => abortController?.abort();
  if (abortController && response && typeof response.on === "function") {
    response.on("close", abortOnClose);
  }

  let currentMessages = [...opts.messages];
  let completeText = "";
  let metrics = {};
  const toolTrace = [];
  let closeChunkSent = false;

  try {
    for (let round = 0; round <= maxRounds; round++) {
      // L1 Guard: client already disconnected — don't waste another LLM round.
      if (!isResponseWritable(response)) {
        logger.streamGuard?.({ round, reason: "client-disconnected" });
        break;
      }

      const roundLlmOptions =
        round === 0
          ? injectToolChoice({
              llmOptions,
              caller,
              tools,
              forceToolChoiceRequired,
            })
          : omitToolChoice(llmOptions);

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
          isEmpty: !result?.textResponse && !result?.toolCalls?.length,
        });

        if (result?.toolCalls?.length > 0 && round < maxRounds) {
          for (const tc of result.toolCalls) {
            // Non-streaming path: also emit toolCallInvocation for runner parity.
            if (isResponseWritable(response)) {
              writeResponseChunk(response, {
                uuid,
                sources,
                type: "toolCallInvocation",
                content: `Assembling Tool Call: ${tc.name}(${tc.arguments ?? ""})`,
                close: false,
                error: false,
              });
            }
            currentMessages = await executeAndAppend({
              tc,
              round,
              currentMessages,
              LLMConnector,
              toolTrace,
              logger,
              toolRuntimeOverrides,
              clientToolBroker,
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
        closeChunkSent = true;
        break;
      } else {
        // --- Streaming path ---
        logger.llmStart?.({
          messageCount: currentMessages.length,
          streaming: true,
        });
        const stream = await LLMConnector.streamGetChatCompletion(
          currentMessages,
          {
            ...roundLlmOptions,
            tools,
            ...(abortController ? { signal: abortController.signal } : {}),
          }
        );
        const streamResult = await LLMConnector.handleStream(response, stream, {
          uuid,
          sources,
        });

        // Hybrid contract: providers may return a string (legacy) or
        // { text, toolCalls?, closeChunkSent } (extended — openAi Responses).
        const resultText =
          typeof streamResult === "string"
            ? streamResult
            : streamResult?.text ?? "";
        const resultToolCalls =
          typeof streamResult === "object" && streamResult !== null
            ? streamResult?.toolCalls
            : null;
        const resultCloseChunkSent =
          typeof streamResult === "string"
            ? true
            : streamResult?.closeChunkSent === true;
        if (resultCloseChunkSent) closeChunkSent = true;

        if (resultToolCalls?.length > 0 && round < maxRounds) {
          logger.llmEnd?.({
            responseLength: resultText.length,
            isEmpty: false,
          });
          for (const tc of resultToolCalls) {
            // DX + E2E runner visibility: emit a dedicated `toolCallInvocation`
            // SSE event (parallel to aibitat's @agent-path "Assembling Tool Call").
            // Frontend ignores unknown types, so textResponseChunk aggregation is
            // unaffected. Runner (scripts/e2e-hr-skill/runner.js) detects tool calls
            // by matching `type === "toolCallInvocation"` + content prefix.
            if (isResponseWritable(response)) {
              writeResponseChunk(response, {
                uuid,
                sources,
                type: "toolCallInvocation",
                content: `Assembling Tool Call: ${tc.name}(${tc.arguments ?? ""})`,
                close: false,
                error: false,
              });
            }
            currentMessages = await executeAndAppend({
              tc,
              round,
              currentMessages,
              LLMConnector,
              toolTrace,
              logger,
              toolRuntimeOverrides,
              clientToolBroker,
            });
          }
          metrics = stream.metrics || {};
          continue;
        }

        // Max rounds reached but tool calls still present → flush close chunk (idempotent).
        if (resultToolCalls?.length > 0) {
          logger.toolCallMax?.({ rounds: maxRounds });
          if (!closeChunkSent) {
            writeResponseChunk(response, {
              uuid,
              sources,
              type: "textResponseChunk",
              textResponse: "",
              close: true,
              error: false,
            });
            closeChunkSent = true;
          }
        }

        completeText = resultText;
        logger.llmEnd?.({
          responseLength: completeText?.length || 0,
          isEmpty: !completeText,
        });
        metrics = stream.metrics || {};
        break;
      }
    }

    // Safety net: if no close chunk was sent along any path (e.g., tool-only
    // termination, early break, legacy provider abort), emit a single final close.
    if (!closeChunkSent && isResponseWritable(response)) {
      logger.streamGuard?.({ round: -1, reason: "final-close-fallback" });
      writeResponseChunk(response, {
        uuid,
        sources,
        type: "textResponseChunk",
        textResponse: "",
        close: true,
        error: false,
      });
      closeChunkSent = true;
    }
  } finally {
    if (abortController && response && typeof response.removeListener === "function") {
      response.removeListener("close", abortOnClose);
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
  clientToolBroker,
}) {
  logger.toolCall?.({ name: tc.name, arguments: tc.arguments, round });
  const tcStart = Date.now();
  const toolResult = await ToolExecutor.execute(tc, {
    runtimeOverrides: toolRuntimeOverrides,
    clientToolTransport: clientToolBroker
      ? (spec) => clientToolBroker.request(spec)
      : null,
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
