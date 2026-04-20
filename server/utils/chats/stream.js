const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { getVectorDbClass, getLLMProvider } = require("../helpers");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { performMergedSearch } = require("../vectorSearch/mergeSharedResults");
const {
  shouldUseHybridSearch,
  shouldUseRerank,
} = require("../vectorSearch/searchModeHelpers");
const { Workspace } = require("../../models/workspace");
const { grepAgents } = require("./agents");
const {
  grepCommand,
  VALID_COMMANDS,
  chatPrompt,
  recentChatHistory,
  sourceIdentifier,
} = require("./index");
const { ChatTraceLogger } = require("./traceLogger");
const { ChatToolsManager } = require("./toolCalling/manager");
const { toolCallingLoop } = require("./toolCalling/loop");

const VALID_CHAT_MODE = ["chat", "query", "react"];

async function streamChatWithWorkspace(
  response,
  workspace,
  message,
  chatMode = "chat",
  user = null,
  thread = null,
  attachments = []
) {
  const uuid = uuidv4();
  const logger = new ChatTraceLogger(uuid, { chatMode });
  const updatedMessage = await grepCommand(message, user);

  if (Object.keys(VALID_COMMANDS).includes(updatedMessage)) {
    const data = await VALID_COMMANDS[updatedMessage](
      workspace,
      message,
      uuid,
      user,
      thread
    );
    writeResponseChunk(response, data);
    return;
  }

  // If is agent enabled chat we will exit this flow early.
  const isAgentChat = await grepAgents({
    uuid,
    response,
    message: updatedMessage,
    user,
    workspace,
    thread,
    attachments,
  });
  if (isAgentChat) return;

  // ReAct mode delegates to a dedicated handler
  if (chatMode === "react") {
    const { streamReactChat } = require("./react");
    await streamReactChat(
      response,
      workspace,
      updatedMessage,
      user,
      thread,
      attachments
    );
    return;
  }

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });
  const VectorDb = getVectorDbClass();

  const messageLimit = workspace?.openAiHistory || 20;
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  // Skip early exit if a shared workspace exists (merged search may still find results).
  const sharedWorkspace = await Workspace.getShared();
  const hasSharedFallback = sharedWorkspace && sharedWorkspace.id !== workspace.id;
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query" && !hasSharedFallback) {
    logger.traceStart({ query: updatedMessage, workspace, chatHistoryCount: 0, pinnedDocsCount: 0, parsedFilesCount: 0 });
    logger.searchSkipped("no embeddings");
    logger.traceEnd({ reason: "query_no_embeddings" });
    logger.traceSummary();
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      attachments,
      close: true,
      error: null,
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // If we are here we know that we are in a workspace that is:
  // 1. Chatting in "chat" mode and may or may _not_ have embeddings
  // 2. Chatting in "query" mode and has at least 1 embedding
  let completeText;
  let metrics = {};
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
  });

  // Look for pinned documents and see if the user decided to use this feature. We will also do a vector search
  // as pinning is a supplemental tool but it should be used with caution since it can easily blow up a context window.
  // However we limit the maximum of appended context to 80% of its overall size, mostly because if it expands beyond this
  // it will undergo prompt compression anyway to make it work. If there is so much pinned that the context here is bigger than
  // what the model can support - it would get compressed anyway and that really is not the point of pinning. It is really best
  // suited for high-context models.
  await new DocumentManager({
    workspace,
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

  // Inject any parsed files for this workspace/thread/user
  const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    thread || null,
    user || null
  );
  parsedFiles.forEach((doc) => {
    const { pageContent, ...metadata } = doc;
    contextTexts.push(doc.pageContent);
    sources.push({
      text:
        pageContent.slice(0, 1_000) + "...continued on in source document...",
      ...metadata,
    });
  });

  logger.traceStart({
    query: updatedMessage,
    workspace,
    chatHistoryCount: chatHistory.length,
    pinnedDocsCount: pinnedDocIdentifiers.length,
    parsedFilesCount: parsedFiles.length,
  });

  const searchStartMs = Date.now();
  const vectorSearchResults =
    embeddingsCount !== 0
      ? await performMergedSearch({
          workspace,
          input: updatedMessage,
          LLMConnector,
          similarityThreshold: workspace?.similarityThreshold,
          topN: workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: shouldUseRerank(workspace),
          hybridSearch: shouldUseHybridSearch(workspace),
          adjacentChunks: workspace?.adjacentChunks ?? 0,
          chatHistory: rawHistory,
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };
  const searchDurationMs = Date.now() - searchStartMs;

  // Failed similarity search if it was run at all and failed.
  if (!!vectorSearchResults.message) {
    logger.search({
      query: updatedMessage,
      mode: workspace?.vectorSearchMode || "default",
      resultCount: 0,
      durationMs: searchDurationMs,
      error: vectorSearchResults.message,
    });
    logger.traceEnd({ reason: "search_error" });
    logger.traceSummary();
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
    });
    return;
  }

  if (embeddingsCount === 0) {
    logger.searchSkipped("no embeddings");
  } else {
    logger.search({
      query: updatedMessage,
      mode: workspace?.vectorSearchMode || "default",
      resultCount: vectorSearchResults.sources.length,
      durationMs: searchDurationMs,
      hasShared: !!sharedWorkspace && sharedWorkspace.id !== workspace.id,
    });
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: workspace?.topN || 4,
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

  const backfillCount = filledSources.contextTexts.length;
  logger.context({
    pinnedCount: pinnedDocIdentifiers.length,
    searchCount: vectorSearchResults.sources.length,
    backfillCount,
    totalCount: contextTexts.length,
  });

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (chatMode === "query" && contextTexts.length === 0) {
    logger.traceEnd({ reason: "query_no_context" });
    logger.traceSummary();
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      close: true,
      error: null,
    });

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const debugMultimodal = process.env.DEBUG_MULTIMODAL === "true";
  if (debugMultimodal && attachments?.length > 0) {
    console.log(
      `\x1b[36m[Multimodal]\x1b[0m Sending ${attachments.length} attachment(s) to LLM. ` +
        `Types: ${attachments.map((a) => a.mime).join(", ")}`
    );
  }

  const systemPrompt = await chatPrompt(workspace, user);
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt,
      userPrompt: updatedMessage,
      contextTexts,
      chatHistory,
      attachments,
    },
    rawHistory
  );
  logger.compress(messages.length);

  // Verify image data survived compression
  if (attachments?.length > 0) {
    const userMsg = messages[messages.length - 1];
    const hasImages =
      Array.isArray(userMsg?.content) &&
      userMsg.content.some(
        (c) => c.type === "input_image" || c.type === "image_url"
      );
    if (debugMultimodal) {
      console.log(
        `\x1b[36m[Multimodal]\x1b[0m Post-compression: ` +
          `images preserved = ${hasImages}, ` +
          `total messages = ${messages.length}`
      );
    }
    // WARNING always logged regardless of DEBUG_MULTIMODAL
    if (!hasImages) {
      console.warn(
        `\x1b[33m[Multimodal WARNING]\x1b[0m Image data was lost during compression!`
      );
    }
  }

  // Collect LLM log data for later storage
  const llmLogData = {
    systemPrompt,
    userPrompt: updatedMessage,
    contextTexts,
    chatHistory: rawHistory,
    compressedMessages: messages,
  };

  // Tool calling setup — get tool definitions if provider supports it
  const tools =
    typeof LLMConnector.supportsToolCalling === "function" &&
    LLMConnector.supportsToolCalling()
      ? ChatToolsManager.getToolDefinitions(LLMConnector.toolCallingFormat())
      : null;

  const { completeText: finalText, metrics: finalMetrics } =
    await toolCallingLoop({
      response,
      LLMConnector,
      messages,
      tools,
      llmOptions: {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        user,
      },
      uuid,
      sources,
      logger: {
        llmStart: (evt) => logger.llmStart(evt),
        llmEnd: (evt) => logger.llmEnd(evt),
        toolCall: (evt) => logger.toolCall(evt),
        toolCallEnd: (evt) => logger.toolCallEnd(evt),
        toolCallMax: ({ rounds }) =>
          console.warn(
            `[ToolCalling] Max rounds (${rounds}) reached, using partial response`
          ),
      },
    });
  completeText = finalText;
  metrics = finalMetrics;

  if (completeText?.length > 0) {
    logger.traceEnd({ reason: "success", answerLength: completeText.length, sourceCount: sources.length });
    logger.traceSummary();
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: completeText,
        sources,
        type: chatMode,
        attachments,
        metrics,
      },
      threadId: thread?.id || null,
      user,
    });

    // Save LLM message log
    try {
      await WorkspaceChats.createLlmMessageLog(chat.id, {
        ...llmLogData,
        llmResponse: completeText,
      });
    } catch (error) {
      console.error("[LLM Log] Failed to save log:", error.message);
      // Continue normally even if log saving fails
    }

    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
    });
    return;
  }

  logger.traceEnd({ reason: "empty_llm_response" });
  logger.traceSummary();
  writeResponseChunk(response, {
    uuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
    metrics,
  });
  return;
}

module.exports = {
  VALID_CHAT_MODE,
  streamChatWithWorkspace,
};
