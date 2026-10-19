const { ToolExecutor } = require("./executor");
const { appendToolResult } = require("./appendToolResult");
const {
  withHrRefusalTool,
  withSelfDataNotice,
  pseudoToolResult,
  isBlockedTool,
  isHrTool,
} = require("../../hrSelfDataNotice");
const {
  writeResponseChunk,
  isResponseWritable,
} = require("../../helpers/chat/responses");
const {
  extractTableBlock,
  toModelResult,
  sanitizeModelText,
  joinFinalAnswer,
  isPrepLookup,
  isRefusalText,
  selectBlocks,
} = require("../../hrTableBlocks");
const {
  allowedYears,
  correctToolArgs,
  stripUnknownYears,
  yearsIn,
} = require("../../hrYearGuard");

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
  if (isToolChoiceForced({ caller, tools, forceToolChoiceRequired })) {
    return { ...llmOptions, tool_choice: "required" };
  }
  return llmOptions;
}

function isToolChoiceForced({ caller, tools, forceToolChoiceRequired = true }) {
  const envDisabled = process.env.EMBED_TOOL_CHOICE_REQUIRED === "false";
  const hasTools = Array.isArray(tools) && tools.length >= 1;
  return caller === "embed" && hasTools && !envDisabled && forceToolChoiceRequired;
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
    tools: inputTools,
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

  // HR tool이 있으면 다른 직원 질문을 거절할 선택지를 함께 준다(specs/016 research R14·R15).
  // 강제 호출 여부와 무관하다 — 강제가 없는 필터 위젯에서도 다른 직원 질문에 본인 조회를 불렀다(R15).
  const tools = withHrRefusalTool(inputTools, LLMConnector.toolCallingFormat?.());

  // AbortController: propagate client disconnect to upstream fetch (best-effort).
  // Provider must support `signal` in streamGetChatCompletion for this to take effect.
  const abortController =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const abortOnClose = () => abortController?.abort();
  if (abortController && response && typeof response.on === "function") {
    response.on("close", abortOnClose);
  }

  let currentMessages = [...opts.messages];
  // HR 표 블록(specs/018) — 모이면 이후 텍스트 라운드는 실시간으로 흘리지 않고 문장+표를 한 번에 보낸다.
  // entries는 조회 순서대로 쌓고(D6), 붙일 때 준비 단계(지급 건 목록·조직 코드 찾기) 표는 다른 표가
  // 있으면 뺀다. 거절 선택지가 호출된 답변에는 표를 붙이지 않는다(018 보안 리뷰 H2).
  // hrCalled: HR 조회를 한 번이라도 했는가 — 그 뒤 텍스트 라운드는 캡처해 근거 없는 연도를 지운다(2026-10-19)
  // years: 쓸 수 있는 연도 — 사용자가 말한 연도·상대 표현·올해 + 조회 결과에 나온 연도
  let tables = {
    entries: [],
    refused: false,
    mainAttempted: false,
    hrCalled: false,
    years: allowedYears(opts.messages),
  };
  // 캡처하지 않고 이미 흘려보낸 앞 라운드 문장(예: tool 호출 전 "확인해 볼게요.")
  let streamedText = "";
  let completeText = "";
  let metrics = {};
  const toolTrace = [];
  let closeChunkSent = false;

  const debugIO = process.env.HR_DEBUG_TOOL_IO === "true";
  try {
    for (let round = 0; round <= maxRounds; round++) {
      // L1 Guard: client already disconnected — don't waste another LLM round.
      if (!isResponseWritable(response)) {
        logger.streamGuard?.({ round, reason: "client-disconnected" });
        break;
      }

      // 관측성 — LLM에 전달되는 전체 메시지. 한 줄 JSON으로 찍어 `grep tool-io` 한 줄에
      // 모두 잡히게 한다(개행 X). content는 문자열/객체/tool_calls 모두 직렬화. role이
      // 없으면(tool 결과 등) name/tool_call_id로 폴백. 기본은 전체 content, 너무 길면
      // HR_DEBUG_TOOL_IO_MAX(기본 8000)자로 절단.
      if (debugIO) {
        const cap = Number(process.env.HR_DEBUG_TOOL_IO_MAX) || 8000;
        const serialize = (m) => {
          let c =
            typeof m.content === "string"
              ? m.content
              : m.content != null
                ? JSON.stringify(m.content)
                : "";
          // tool_calls(assistant가 tool 호출 결정)도 내용에 포함
          if (m.tool_calls) c += " tool_calls=" + JSON.stringify(m.tool_calls);
          if (c.length > cap) c = c.slice(0, cap) + `…(+${c.length - cap})`;
          return {
            role: m.role || m.name || (m.tool_call_id ? "tool" : "unknown"),
            content: c,
          };
        };
        console.log(
          `[tool-io] round=${round} LLM_INPUT ` +
            JSON.stringify({
              count: currentMessages.length,
              messages: currentMessages.map(serialize),
            })
        );
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
          const executed = await runToolCalls(result.toolCalls, {
            round, currentMessages, tables, response, uuid, sources,
            LLMConnector, toolTrace, logger, toolRuntimeOverrides, clientToolBroker,
          });
          currentMessages = executed.messages;
          tables = executed.tables;
          metrics = result.metrics || {};
          continue;
        }

        completeText = finalizeText(result?.textResponse ?? "", tables);
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
        // 표 블록이 모였으면 이 라운드 글자는 캡처만 한다 — 모델 문장을 거른 뒤 표와 함께 보낸다(D10)
        const capture = tables.hrCalled ? createCaptureResponse(response) : null;
        const streamResult = await LLMConnector.handleStream(capture ?? response, stream, {
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
        // 캡처한 라운드의 close는 실제로 나가지 않았다
        if (resultCloseChunkSent && !capture) closeChunkSent = true;

        if (resultToolCalls?.length > 0 && round < maxRounds) {
          logger.llmEnd?.({
            responseLength: resultText.length,
            isEmpty: false,
          });
          if (capture) capture.flushNonText();
          else streamedText += resultText;
          const executed = await runToolCalls(resultToolCalls, {
            round, currentMessages, tables, response, uuid, sources,
            LLMConnector, toolTrace, logger, toolRuntimeOverrides, clientToolBroker,
          });
          currentMessages = executed.messages;
          tables = executed.tables;
          metrics = stream.metrics || {};
          continue;
        }

        if (capture) {
          if (resultToolCalls?.length > 0) logger.toolCallMax?.({ rounds: maxRounds });
          metrics = stream.metrics || {};
          // 공급자 스트림 오류(abort)는 삼키지 않고 그대로 전달한다 — 잘린 문장+표를 정상 답변으로 보내지 않는다
          if (capture.flushAbort()) {
            completeText = "";
            closeChunkSent = true;
            break;
          }
          const answer = finalizeText(resultText, tables);
          // 앞서 흘린 문장이 있으면 줄을 띄워 잇는다 — 화면(이어 붙임)과 기록이 같게
          const shown = streamedText ? `\n\n${answer}` : answer;
          completeText = streamedText ? `${streamedText}${shown}` : answer;
          logger.llmEnd?.({ responseLength: completeText.length, isEmpty: !completeText });
          writeResponseChunk(response, {
            uuid,
            sources,
            type: "textResponseChunk",
            textResponse: shown,
            close: true,
            error: false,
            metrics,
          });
          closeChunkSent = true;
          break;
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

  if (debugIO) {
    console.log(
      `[tool-io] LLM_OUTPUT ` +
        JSON.stringify({ len: completeText?.length || 0, answer: completeText })
    );
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
  // 다른 직원 검색 skill·거절 선택지·조회 불가 선택지는 실행하지 않는다(specs/016 R14, 2026-10-19)
  const toolResult =
    pseudoToolResult(tc.name) ??
    (await ToolExecutor.execute(tc, {
        runtimeOverrides: toolRuntimeOverrides,
        clientToolTransport: clientToolBroker
          ? (spec) => clientToolBroker.request(spec)
          : null,
      }));

  // 관측성 (env HR_DEBUG_TOOL_IO=true) — tool 입력 args + LLM에 들어갈 렌더 결과.
  // 한 줄 JSON(개행 X)이라 `grep tool-io` 한 줄에 다 잡힘. ⚠️ 급여·주민번호 등 민감정보
  // 포함 가능 → 프로덕션 기본 off, 진단 시에만 켠다.
  if (process.env.HR_DEBUG_TOOL_IO === "true") {
    console.log(
      `[tool-io] round=${round} TOOL_CALL ` +
        JSON.stringify({
          name: tc.name,
          args:
            typeof tc.arguments === "string"
              ? tc.arguments
              : tc.arguments,
          resultLen: toolResult?.length || 0,
          result: toolResult,
        })
    );
  }
  const durationMs = Date.now() - tcStart;
  const isError =
    typeof toolResult === "string" && toolResult.startsWith("Error");
  // "> ⚠️"는 HR handler 가드레일 메시지의 확정 시그니처 — 결과 본문 대신
  // 이 불리언만 영속화해 개인정보 노출 없이 인자 실패를 식별한다.
  const resultIsGuardrail =
    typeof toolResult === "string" && toolResult.startsWith("> ⚠️");
  logger.toolCallEnd?.({ name: tc.name, durationMs, isError });
  toolTrace.push({
    round,
    name: tc.name,
    arguments: tc.arguments,
    resultLength: toolResult?.length || 0,
    durationMs,
    isError,
    resultIsGuardrail,
  });
  // 표 블록(specs/018)은 원래 결과에서 뽑는다 — 시스템이 답변 끝에 그대로 붙인다.
  // 판정 플래그도 위에서 원래 결과로 계산했다. 모델에 넘기는 값에만 [표 표시] 지시와 HR "본인 데이터"
  // 안내를 붙인다 — 다른 직원 질문에 본인 데이터를 그 사람 것처럼 답하지 않게(specs/016).
  const block = extractTableBlock(tc.name, toolResult);
  const messages = appendToolResult(
    currentMessages,
    tc,
    withSelfDataNotice(tc.name, tc.arguments, toModelResult(toolResult, Boolean(block))),
    LLMConnector.toolCallingFormat()
  );
  return { messages, block, result: typeof toolResult === "string" ? toolResult : "" };
}

/**
 * 표 블록이 있으면 모델 문장을 거르고 표를 붙인 최종 답변, 없으면 모델 문장 그대로(specs/018).
 * @param {string} text
 * @param {string[]} tableBlocks
 */
// HR 조회가 있었던 답변의 최종 문장 — 표를 붙이고(있으면), 근거 없는 연도를 지운다
function finalizeText(text, tables) {
  const withBlocks = withTableBlocks(text, tables);
  return tables.hrCalled ? stripUnknownYears(withBlocks, tables.years) : withBlocks;
}

function withTableBlocks(text, tables) {
  if (!hasBlocks(tables) || isRefusalText(text)) return text;
  return joinFinalAnswer(sanitizeModelText(text), selectBlocks(tables.entries, tables.mainAttempted));
}

// 붙일 표가 있는가 — 거절 선택지가 호출된 답변은 표 없이 지금처럼 스트리밍한다
function hasBlocks(tables) {
  return !tables.refused && selectBlocks(tables.entries, tables.mainAttempted).length > 0;
}

/**
 * 한 라운드의 tool 호출을 차례로 실행한다 — 호출 알림을 보내고, 결과를 메시지에 잇고, 표 블록을 쌓는다.
 * @returns {Promise<{messages: Array, tables: {entries: Array, refused: boolean}}>}
 */
async function runToolCalls(toolCalls, ctx) {
  const { response, uuid, sources } = ctx;
  let messages = ctx.currentMessages;
  let tables = ctx.tables;
  for (const tc of toolCalls) {
    // DX + E2E runner visibility: emit a dedicated `toolCallInvocation` SSE event
    // (parallel to aibitat's @agent-path "Assembling Tool Call"). Frontend ignores
    // unknown types; runner(scripts/e2e-hr-skill/runner.js) detects tool calls by it.
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
    // 사용자가 말하지 않은 연도 인자는 떼고 실행·기록한다 — 모델도 고친 인자를 본다(2026-10-19)
    const { tc: safeTc, corrected } = correctToolArgs(tc, tables.years);
    if (corrected) ctx.logger?.argsCorrected?.({ name: tc.name, from: tc.arguments, to: safeTc.arguments });
    const executed = await executeAndAppend({ ...ctx, tc: safeTc, currentMessages: messages });
    messages = executed.messages;
    const prep = isPrepLookup(safeTc.name, safeTc.arguments);
    const realHr = isHrTool(safeTc.name) && !pseudoToolResult(safeTc.name);
    tables = {
      ...tables,
      entries: executed.block ? [...tables.entries, { text: executed.block, prep }] : tables.entries,
      refused: tables.refused || isBlockedTool(safeTc.name),
      mainAttempted: tables.mainAttempted || (realHr && !prep),
      hrCalled: tables.hrCalled || realHr,
      years: new Set([...tables.years, ...yearsIn(executed.result)]),
    };
  }
  return { messages, tables };
}

/**
 * 공급자 handleStream에 넘기는 캡처용 응답 — 쓰기는 모아 두고, 연결 상태·이벤트는 실제 응답에 맡긴다.
 * 텍스트가 아닌 이벤트(예: 공급자가 보내는 부가 이벤트)는 flushNonText()로 실제 응답에 흘린다.
 * @param {import("express").Response} real
 */
function createCaptureResponse(real) {
  const writes = [];
  const typeOf = (chunk) => {
    const m = /^data: (.*)\n\n$/s.exec(String(chunk));
    try {
      return m ? JSON.parse(m[1])?.type : undefined;
    } catch (_) {
      return undefined;
    }
  };
  const isText = (chunk) => typeOf(chunk) === "textResponseChunk";
  return {
    write: (chunk) => {
      writes.push(chunk);
      return true;
    },
    on: (...args) => real?.on?.(...args),
    once: (...args) => real?.once?.(...args),
    off: (...args) => real?.off?.(...args),
    removeListener: (...args) => real?.removeListener?.(...args),
    get writable() {
      return real?.writable !== false;
    },
    get writableEnded() {
      return real?.writableEnded === true;
    },
    flushNonText: () => {
      if (!isResponseWritable(real)) return;
      writes.filter((chunk) => !isText(chunk)).forEach((chunk) => real.write(chunk));
    },
    // 공급자가 보낸 오류(abort) 청크가 있으면 실제 응답으로 보내고 true
    flushAbort: () => {
      const abort = writes.find((chunk) => typeOf(chunk) === "abort");
      if (!abort) return false;
      if (isResponseWritable(real)) real.write(abort);
      return true;
    },
  };
}

module.exports = { toolCallingLoop, injectToolChoice, MAX_TOOL_ROUNDS };
