const { v4: uuidv4 } = require("uuid");
const { getVectorDbClass, getLLMProvider } = require("../helpers");
const { chatPrompt, sourceIdentifier } = require("./index");
const { EmbedChats } = require("../../models/embedChats");
const {
  convertToPromptHistory,
  writeResponseChunk,
} = require("../helpers/chat/responses");
const { DocumentManager } = require("../DocumentManager");
const { ChatToolsManager } = require("./toolCalling/manager");
const { toolCallingLoop } = require("./toolCalling/loop");
const { performMergedSearch } = require("../vectorSearch/mergeSharedResults");
const {
  shouldUseHybridSearch,
  shouldUseRerank,
} = require("../vectorSearch/searchModeHelpers");
const { Workspace } = require("../../models/workspace");

async function streamChatWithForEmbed(
  response,
  /** @type {import("@prisma/client").embed_configs & {workspace?: import("@prisma/client").workspaces}} */
  embed,
  /** @type {String} */
  message,
  /** @type {String} */
  sessionId,
  {
    promptOverride,
    modelOverride,
    temperatureOverride,
    username,
    toolRuntimeOverrides,
  }
) {
  const chatMode = embed.chat_mode;
  const chatModel = embed.allow_model_override ? modelOverride : null;

  // If there are overrides in request & they are permitted, override the default workspace ref information.
  if (embed.allow_prompt_override)
    embed.workspace.openAiPrompt = promptOverride;
  if (embed.allow_temperature_override)
    embed.workspace.openAiTemp = parseFloat(temperatureOverride);

  const uuid = uuidv4();
  const LLMConnector = getLLMProvider({
    provider: embed?.workspace?.chatProvider,
    model: chatModel ?? embed.workspace?.chatModel,
  });
  const VectorDb = getVectorDbClass();

  const messageLimit = embed.message_limit ?? 20;
  const hasVectorizedSpace = await VectorDb.hasNamespace(embed.workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(embed.workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  // Skip early exit if a shared workspace exists (merged search may still find results).
  const sharedWorkspace = await Workspace.getShared();
  const hasSharedFallback = sharedWorkspace && sharedWorkspace.id !== embed.workspace.id;
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query" && !hasSharedFallback) {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse:
        "I do not have enough information to answer that. Try another question.",
      sources: [],
      close: true,
      error: null,
    });
    return;
  }

  let completeText;
  let metrics = {};
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentEmbedChatHistory(
    sessionId,
    embed,
    messageLimit
  );

  // See stream.js comment for more information on this implementation.
  await new DocumentManager({
    workspace: embed.workspace,
    maxTokens: LLMConnector.promptWindowLimit(),
  })
    .pinnedDocs()
    .then((pinnedDocs) => {
      pinnedDocs.forEach((doc) => {
        const { pageContent, ...metadata } = doc;
        pinnedDocIdentifiers.push(sourceIdentifier(doc));
        contextTexts.push(doc.pageContent);
        sources.push({
          text:
            pageContent.slice(0, 1_000) +
            "...continued on in source document...",
          ...metadata,
        });
      });
    });

  const vectorSearchResults =
    embeddingsCount !== 0
      ? await performMergedSearch({
          workspace: embed.workspace,
          input: message,
          LLMConnector,
          similarityThreshold: embed.workspace?.similarityThreshold,
          topN: embed.workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: shouldUseRerank(embed.workspace),
          hybridSearch: shouldUseHybridSearch(embed.workspace),
          adjacentChunks: embed.workspace?.adjacentChunks ?? 0,
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };

  // Failed similarity search if it was run at all and failed.
  if (!!vectorSearchResults.message) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: "Failed to connect to vector database provider.",
    });
    return;
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: embed.workspace?.topN || 4,
    searchResults: vectorSearchResults.sources,
    history: rawHistory,
    filterIdentifiers: pinnedDocIdentifiers,
  });

  // Why does contextTexts get all the info, but sources only get current search?
  // This is to give the ability of the LLM to "comprehend" a contextual response without
  // populating the Citations under a response with documents the user "thinks" are irrelevant
  // due to how we manage backfilling of the context to keep chats with the LLM more correct in responses.
  // If a past citation was used to answer the question - that is visible in the history so it logically makes sense
  // and does not appear to the user that a new response used information that is otherwise irrelevant for a given prompt.
  // TLDR; reduces GitHub issues for "LLM citing document that has no answer in it" while keep answers highly accurate.
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...vectorSearchResults.sources];

  // If in query mode and no sources are found in current search or backfilled from history, do not
  // let the LLM try to hallucinate a response or use general knowledge
  if (chatMode === "query" && contextTexts.length === 0) {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse:
        embed.workspace?.queryRefusalResponse ??
        "There is no relevant information in this workspace to answer your query.",
      sources: [],
      close: true,
      error: null,
    });
    return;
  }

  // Compress message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(embed.workspace, username),
      userPrompt: message,
      contextTexts,
      chatHistory,
    },
    rawHistory
  );

  // Tool calling setup — embed-specific: opt-in via allow_tool_calling + provider support
  const toolsEnabled =
    embed.allow_tool_calling === true &&
    typeof LLMConnector.supportsToolCalling === "function" &&
    LLMConnector.supportsToolCalling();

  let tools = null;
  if (toolsEnabled) {
    const format = LLMConnector.toolCallingFormat();
    const allTools = ChatToolsManager.getToolDefinitions(format);
    tools = applyAllowedHashes(allTools, embed.allowed_skill_hashes, format);
  }

  // Phase 2 초기: console 기반 경량 로거
  // Phase 4 에서 traceLogger 채택 시 동일 인터페이스로 교체 예정
  const loopLogger = {
    llmStart: () => {},
    llmEnd: () => {},
    toolCall: (evt) =>
      console.log(`[embed-tool] ${evt.name} args=`, evt.arguments),
    toolCallEnd: (evt) =>
      console.log(
        `[embed-tool] ${evt.name} done ${evt.durationMs}ms err=${evt.isError}`
      ),
    toolCallMax: (evt) =>
      console.warn(`[embed-tool] max rounds ${evt.rounds} reached`),
  };

  const {
    completeText: finalText,
    metrics: finalMetrics,
    toolTrace,
  } = await toolCallingLoop({
    response,
    LLMConnector,
    messages,
    tools,
    llmOptions: {
      temperature: embed.workspace?.openAiTemp ?? LLMConnector.defaultTemp,
    },
    uuid,
    sources: [],
    logger: loopLogger,
    caller: "embed",
    toolRuntimeOverrides,
  });
  completeText = finalText;
  metrics = finalMetrics;

  await EmbedChats.new({
    embedId: embed.id,
    prompt: message,
    response: {
      text: completeText,
      type: chatMode,
      sources,
      metrics,
      ...(toolTrace?.length ? { toolTrace } : {}),
    },
    connection_information: response.locals.connection
      ? {
          ...response.locals.connection,
          username: !!username ? String(username) : null,
        }
      : { username: !!username ? String(username) : null },
    sessionId,
  });
  return;
}

/**
 * @param {string} sessionId the session id of the user from embed widget
 * @param {Object} embed the embed config object
 * @param {Number} messageLimit the number of messages to return
 * @returns {Promise<{rawHistory: import("@prisma/client").embed_chats[], chatHistory: {role: string, content: string, attachments?: Object[]}[]}>
 */
/**
 * ChatToolsManager는 수정하지 않고, 반환된 tool 배열을 embed별 화이트리스트로 필터링.
 *
 * 저장 값 해석 (embed_configs.allowed_skill_hashes):
 *  - NULL      → 필터 미적용 (전체 tool 노출)
 *  - ""        → 빈 허용 목록 → 빈 배열 (실질적 tool off)
 *  - "a,b"     → trim + 빈 항목 제거 후 허용 목록
 *
 * @param {Array} tools - ChatToolsManager.getToolDefinitions() 결과
 * @param {string|null} raw - embed_configs.allowed_skill_hashes (csv or NULL)
 * @param {"openai-responses"|"anthropic"|"chat-completions"} format
 * @returns {Array} 필터링된 tools
 */
function applyAllowedHashes(tools, raw, format) {
  if (raw === null || raw === undefined) return tools;
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return [];
  return tools.filter((t) => allowed.includes(extractToolName(t, format)));
}

function extractToolName(tool, format) {
  switch (format) {
    case "openai-responses":
      return tool.name;
    case "anthropic":
      return tool.name;
    case "chat-completions":
      return tool.function?.name;
    default:
      return null;
  }
}

async function recentEmbedChatHistory(sessionId, embed, messageLimit = 20) {
  const rawHistory = (
    await EmbedChats.forEmbedByUser(embed.id, sessionId, messageLimit, {
      id: "desc",
    })
  ).reverse();
  return { rawHistory, chatHistory: convertToPromptHistory(rawHistory) };
}

module.exports = {
  streamChatWithForEmbed,
};
