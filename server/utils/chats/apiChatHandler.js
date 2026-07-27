const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../helpers");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { performMergedSearch } = require("../vectorSearch/mergeSharedResults");
const {
  shouldUseHybridSearch,
  shouldUseRerank,
} = require("../vectorSearch/searchModeHelpers");
const { Workspace } = require("../../models/workspace");
const {
  chatPrompt,
  sourceIdentifier,
  recentChatHistory,
  grepAllSlashCommands,
} = require("./index");
const { ChatTraceLogger } = require("./traceLogger");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../agents/ephemeral");
const { Telemetry } = require("../../models/telemetry");
const { CollectorApi } = require("../collectorApi");
const fs = require("fs");
const path = require("path");
const { hotdirPath, normalizePath, isWithin } = require("../files");
/**
 * @typedef ResponseObject
 * @property {string} id - uuid of response
 * @property {string} type - Type of response
 * @property {string|null} textResponse - full text response
 * @property {object[]} sources
 * @property {boolean} close
 * @property {string|null} error
 * @property {object} metrics
 */

/**
 * Users can pass in documents as attachments to the chat API.
 * The name of the document is the name of the attachment and must include the file extension.
 * the mime type for documents is `application/anythingllm-document` - anything else is assumed to be an image.
 * @param {{name: string, mime: string, contentString: string}[]} attachments
 * @returns {Promise<{parsedDocuments: Object[], imageAttachments: {name: string; mime: string; contentString: string}[]}>}
 */
async function processDocumentAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0)
    return { parsedDocuments: [], imageAttachments: [] };
  const documentAttachments = [];
  const imageAttachments = [];
  for (const attachment of attachments) {
    if (
      attachment &&
      attachment.contentString &&
      attachment.mime &&
      attachment.mime.toLowerCase() === "application/anythingllm-document"
    )
      documentAttachments.push(attachment);
    else imageAttachments.push(attachment);
  }

  if (documentAttachments.length === 0)
    return { parsedDocuments: [], imageAttachments };
  const Collector = new CollectorApi();
  const processingOnline = await Collector.online();
  if (!processingOnline) {
    console.warn(
      "Collector API is not online, skipping document attachment processing"
    );
    return { parsedDocuments: [], imageAttachments };
  }
  if (!fs.existsSync(hotdirPath)) fs.mkdirSync(hotdirPath, { recursive: true });

  const parsedDocuments = [];
  for (const attachment of documentAttachments) {
    try {
      let base64Data = attachment.contentString;
      const dataUriMatch = base64Data.match(/^data:[^;]+;base64,(.+)$/);
      if (dataUriMatch) base64Data = dataUriMatch[1];

      const buffer = Buffer.from(base64Data, "base64");
      const filename = normalizePath(
        attachment.name || `attachment-${uuidv4()}`
      );
      const filePath = normalizePath(path.join(hotdirPath, filename));
      if (!isWithin(hotdirPath, filePath))
        throw new Error(`Invalid file path for attachment ${filename}`);
      fs.writeFileSync(filePath, buffer);

      const { success, reason, documents } =
        await Collector.parseDocument(filename);
      if (success && documents?.length > 0) parsedDocuments.push(...documents);
      else console.warn(`Failed to parse attachment ${filename}:`, reason);
    } catch (error) {
      console.error(
        `Error processing attachment ${attachment.name}:`,
        error.message
      );
    }
  }

  return { parsedDocuments, imageAttachments };
}

/**
 * Handle synchronous chats with your workspace via the developer API endpoint
 * @param {{
 *  workspace: import("@prisma/client").workspaces,
 *  message:string,
 *  mode: "chat"|"query",
 *  user: import("@prisma/client").users|null,
 *  thread: import("@prisma/client").workspace_threads|null,
 *  sessionId: string|null,
 *  attachments: { name: string; mime: string; contentString: string }[],
 *  reset: boolean,
 * }} parameters
 * @returns {Promise<ResponseObject>}
 */
async function chatSync({
  workspace,
  message = null,
  mode = "chat",
  user = null,
  thread = null,
  sessionId = null,
  attachments = [],
  reset = false,
}) {
  const uuid = uuidv4();
  const chatMode = mode ?? "chat";
  const logger = new ChatTraceLogger(uuid, { chatMode });

  // If the user wants to reset the chat history we do so pre-flight
  // and continue execution. If no message is provided then the user intended
  // to reset the chat history only and we can exit early with a confirmation.
  if (reset) {
    await WorkspaceChats.markThreadHistoryInvalidV2({
      workspaceId: workspace.id,
      user_id: user?.id,
      thread_id: thread?.id,
      api_session_id: sessionId,
    });
    if (!message?.length) {
      return {
        id: uuid,
        type: "textResponse",
        textResponse: "Chat history was reset!",
        sources: [],
        close: true,
        error: null,
        metrics: {},
      };
    }
  }

  // Process slash commands
  // Since preset commands are not supported in API calls, we can just process the message here
  const processedMessage = await grepAllSlashCommands(message);
  message = processedMessage;

  if (EphemeralAgentHandler.isAgentInvocation({ message })) {
    await Telemetry.sendTelemetry("agent_chat_started");

    // Initialize the EphemeralAgentHandler to handle non-continuous
    // conversations with agents since this is over REST.
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace,
      prompt: message,
      userId: user?.id || null,
      threadId: thread?.id || null,
      sessionId,
      // chatSync(비스트림)는 response 객체가 스코프에 없음 — override 미지원 (null 고정).
      // override 배선은 streamChat 분기에만 존재 (E2E runner가 쓰는 경로).
      toolRuntimeOverrides: null,
    });

    // Establish event listener that emulates websocket calls
    // in Aibitat so that we can keep the same interface in Aibitat
    // but use HTTP.
    const eventListener = new EphemeralEventListener();
    await agentHandler.init();
    await agentHandler.createAIbitat({ handler: eventListener });
    agentHandler.startAgentCluster();

    // The cluster has started and now we wait for close event since
    // this is a synchronous call for an agent, so we return everything at once.
    // After this, we conclude the call as we normally do.
    return await eventListener
      .waitForClose()
      .then(async ({ thoughts, textResponse }) => {
        await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: String(message),
          response: {
            text: textResponse,
            sources: [],
            attachments,
            type: chatMode,
            thoughts,
          },
          include: false,
          apiSessionId: sessionId,
        });
        return {
          id: uuid,
          type: "textResponse",
          sources: [],
          close: true,
          error: null,
          textResponse,
          thoughts,
        };
      });
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
    logger.traceStart({ query: message, workspace, chatHistoryCount: 0, pinnedDocsCount: 0, parsedFilesCount: 0 });
    logger.searchSkipped("no embeddings");
    logger.traceEnd({ reason: "query_no_embeddings" });
    logger.traceSummary();
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: String(message),
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
      },
      include: false,
      apiSessionId: sessionId,
    });

    return {
      id: uuid,
      type: "textResponse",
      sources: [],
      close: true,
      error: null,
      textResponse,
      metrics: {},
    };
  }

  // If we are here we know that we are in a workspace that is:
  // 1. Chatting in "chat" mode and may or may _not_ have embeddings
  // 2. Chatting in "query" mode and has at least 1 embedding
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
    apiSessionId: sessionId,
  });

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

  const processedAttachments = await processDocumentAttachments(attachments);
  const parsedAttachments = processedAttachments.parsedDocuments;
  attachments = processedAttachments.imageAttachments;
  parsedAttachments.forEach((doc) => {
    if (doc.pageContent) {
      contextTexts.push(doc.pageContent);
      const { pageContent, ...metadata } = doc;
      sources.push({
        text:
          pageContent.slice(0, 1_000) + "...continued on in source document...",
        ...metadata,
      });
    }
  });

  logger.traceStart({
    query: message,
    workspace,
    chatHistoryCount: chatHistory.length,
    pinnedDocsCount: pinnedDocIdentifiers.length,
    parsedFilesCount: parsedAttachments.length,
  });

  const searchStartMs = Date.now();
  const vectorSearchResults =
    embeddingsCount !== 0
      ? await performMergedSearch({
          workspace,
          input: message,
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
      query: message,
      mode: workspace?.vectorSearchMode || "default",
      resultCount: 0,
      durationMs: searchDurationMs,
      error: vectorSearchResults.message,
    });
    logger.traceEnd({ reason: "search_error" });
    logger.traceSummary();
    return {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
      metrics: {},
    };
  }

  if (embeddingsCount === 0) {
    logger.searchSkipped("no embeddings");
  } else {
    logger.search({
      query: message,
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

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
      },
      threadId: thread?.id || null,
      include: false,
      apiSessionId: sessionId,
      user,
    });

    return {
      id: uuid,
      type: "textResponse",
      sources: [],
      close: true,
      error: null,
      textResponse,
      metrics: {},
    };
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),
      userPrompt: message,
      contextTexts,
      chatHistory,
      attachments,
    },
    rawHistory
  );
  logger.compress(messages.length);

  // Send the text completion.
  logger.llmStart({ messageCount: messages.length, streaming: false });
  const { textResponse, metrics: performanceMetrics } =
    await LLMConnector.getChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });
  logger.llmEnd({ responseLength: textResponse?.length || 0, isEmpty: !textResponse });

  if (!textResponse) {
    logger.traceEnd({ reason: "empty_llm_response" });
    logger.traceSummary();
    return {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: "No text completion could be completed with this input.",
      metrics: performanceMetrics,
    };
  }

  logger.traceEnd({ reason: "success", answerLength: textResponse.length, sourceCount: sources.length });
  logger.traceSummary();
  const { chat } = await WorkspaceChats.new({
    workspaceId: workspace.id,
    prompt: message,
    response: {
      text: textResponse,
      sources,
      attachments,
      type: chatMode,
      metrics: performanceMetrics,
    },
    threadId: thread?.id || null,
    apiSessionId: sessionId,
    user,
  });

  // Save LLM message log
  try {
    await WorkspaceChats.createLlmMessageLog(chat.id, {
      systemPrompt:
        messages.find((m) => m.role === "system")?.content || null,
      userPrompt: message,
      contextTexts,
      chatHistory: rawHistory,
      compressedMessages: messages,
      llmResponse: textResponse,
    });
  } catch (error) {
    console.error("[LLM Log] Failed to save log:", error.message);
  }

  return {
    id: uuid,
    type: "textResponse",
    close: true,
    error: null,
    chatId: chat.id,
    textResponse,
    sources,
    metrics: performanceMetrics,
  };
}

/**
 * Handle streamable HTTP chunks for chats with your workspace via the developer API endpoint
 * @param {{
 * response: import("express").Response,
 *  workspace: import("@prisma/client").workspaces,
 *  message:string,
 *  mode: "chat"|"query",
 *  user: import("@prisma/client").users|null,
 *  thread: import("@prisma/client").workspace_threads|null,
 *  sessionId: string|null,
 *  attachments: { name: string; mime: string; contentString: string }[],
 *  reset: boolean,
 * }} parameters
 * @returns {Promise<VoidFunction>}
 */
async function streamChat({
  response,
  workspace,
  message = null,
  mode = "chat",
  user = null,
  thread = null,
  sessionId = null,
  attachments = [],
  reset = false,
}) {
  const uuid = uuidv4();
  const chatMode = mode ?? "chat";
  const logger = new ChatTraceLogger(uuid, { chatMode });

  // If the user wants to reset the chat history we do so pre-flight
  // and continue execution. If no message is provided then the user intended
  // to reset the chat history only and we can exit early with a confirmation.
  if (reset) {
    await WorkspaceChats.markThreadHistoryInvalidV2({
      workspaceId: workspace.id,
      user_id: user?.id,
      thread_id: thread?.id,
      api_session_id: sessionId,
    });
    if (!message?.length) {
      writeResponseChunk(response, {
        id: uuid,
        type: "textResponse",
        textResponse: "Chat history was reset!",
        sources: [],
        attachments: [],
        close: true,
        error: null,
        metrics: {},
      });
      return;
    }
  }

  // Check for and process slash commands
  // Since preset commands are not supported in API calls, we can just process the message here
  const processedMessage = await grepAllSlashCommands(message);
  message = processedMessage;

  if (EphemeralAgentHandler.isAgentInvocation({ message })) {
    await Telemetry.sendTelemetry("agent_chat_started");

    // Initialize the EphemeralAgentHandler to handle non-continuous
    // conversations with agents since this is over REST.
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace,
      prompt: message,
      userId: user?.id || null,
      threadId: thread?.id || null,
      sessionId,
      // E2E 등 call-site override — endpoint 게이트(dev/ALLOW_TOOL_RUNTIME_OVERRIDE)
      // 통과분만 존재. imported skill runtimeArgs에 병합된다 (ephemeral.js).
      toolRuntimeOverrides: response.locals?.toolRuntimeOverrides || null,
    });

    // Establish event listener that emulates websocket calls
    // in Aibitat so that we can keep the same interface in Aibitat
    // but use HTTP.
    const eventListener = new EphemeralEventListener();
    await agentHandler.init();
    await agentHandler.createAIbitat({ handler: eventListener });
    agentHandler.startAgentCluster();

    // The cluster has started and now we wait for close event since
    // and stream back any results we get from agents as they come in.
    return eventListener
      .streamAgentEvents(response, uuid)
      .then(async ({ thoughts, textResponse }) => {
        await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: String(message),
          response: {
            text: textResponse,
            sources: [],
            attachments: attachments,
            type: chatMode,
            thoughts,
          },
          include: true,
          threadId: thread?.id || null,
          apiSessionId: sessionId,
        });
        writeResponseChunk(response, {
          uuid,
          type: "finalizeResponseStream",
          textResponse,
          thoughts,
          close: true,
          error: false,
        });
      });
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
  const sharedWs = await Workspace.getShared();
  const hasSharedFallback2 = sharedWs && sharedWs.id !== workspace.id;
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query" && !hasSharedFallback2) {
    logger.traceStart({ query: message, workspace, chatHistoryCount: 0, pinnedDocsCount: 0, parsedFilesCount: 0 });
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
      attachments: [],
      close: true,
      error: null,
      metrics: {},
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
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
    apiSessionId: sessionId,
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

  const processedAttachments = await processDocumentAttachments(attachments);
  const parsedAttachments = processedAttachments.parsedDocuments;
  attachments = processedAttachments.imageAttachments;
  parsedAttachments.forEach((doc) => {
    if (doc.pageContent) {
      contextTexts.push(doc.pageContent);
      const { pageContent, ...metadata } = doc;
      sources.push({
        text:
          pageContent.slice(0, 1_000) + "...continued on in source document...",
        ...metadata,
      });
    }
  });

  logger.traceStart({
    query: message,
    workspace,
    chatHistoryCount: chatHistory.length,
    pinnedDocsCount: pinnedDocIdentifiers.length,
    parsedFilesCount: parsedAttachments.length,
  });

  const searchStartMs = Date.now();
  const vectorSearchResults =
    embeddingsCount !== 0
      ? await performMergedSearch({
          workspace,
          input: message,
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
      query: message,
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
      metrics: {},
    });
    return;
  }

  if (embeddingsCount === 0) {
    logger.searchSkipped("no embeddings");
  } else {
    logger.search({
      query: message,
      mode: workspace?.vectorSearchMode || "default",
      resultCount: vectorSearchResults.sources.length,
      durationMs: searchDurationMs,
      hasShared: !!sharedWs && sharedWs.id !== workspace.id,
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
      metrics: {},
    });

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
      include: false,
      user,
    });
    return;
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),
      userPrompt: message,
      contextTexts,
      chatHistory,
      attachments,
    },
    rawHistory
  );
  logger.compress(messages.length);

  // If streaming is not explicitly enabled for connector
  // we do regular waiting of a response and send a single chunk.
  if (LLMConnector.streamingEnabled() !== true) {
    console.log(
      `\x1b[31m[STREAMING DISABLED]\x1b[0m Streaming is not available for ${LLMConnector.constructor.name}. Will use regular chat method.`
    );
    logger.llmStart({ messageCount: messages.length, streaming: false });
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        user: user,
      });
    logger.llmEnd({ responseLength: textResponse?.length || 0, isEmpty: !textResponse });
    completeText = textResponse;
    metrics = performanceMetrics;
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: completeText,
      close: true,
      error: false,
      metrics,
    });
  } else {
    // Tool calling support parity with /workspace/:slug/stream-chat (UI path).
    // ApiChatHandler previously bypassed tool calling (direct streamGetChatCompletion).
    // This blocked HR skill E2E (E125/E126) validation from chat/query mode.
    const { ChatToolsManager } = require("./toolCalling/manager");
    const { routeHrToolsForMessage } = require("./toolCalling/hrRouting");
    const { toolCallingLoop } = require("./toolCalling/loop");
    const providerFormat =
      typeof LLMConnector.toolCallingFormat === "function"
        ? LLMConnector.toolCallingFormat()
        : null;
    const rawTools =
      typeof LLMConnector.supportsToolCalling === "function" &&
      LLMConnector.supportsToolCalling()
        ? ChatToolsManager.getToolDefinitions(providerFormat)
        : null;
    const { tools, toolChoice } = routeHrToolsForMessage({
      tools: rawTools,
      providerFormat,
      message,
    });
    const { completeText: finalText, metrics: finalMetrics } =
      await toolCallingLoop({
        response,
        LLMConnector,
        messages,
        tools,
        llmOptions: {
          temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
          user,
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
        },
        uuid,
        sources,
        toolRuntimeOverrides:
          response.locals?.toolRuntimeOverrides &&
          typeof response.locals.toolRuntimeOverrides === "object"
            ? response.locals.toolRuntimeOverrides
            : null,
        logger: {
          llmStart: (evt) => logger.llmStart?.(evt),
          llmEnd: (evt) => logger.llmEnd?.(evt),
          toolCall: (evt) =>
            typeof logger.toolCall === "function" && logger.toolCall(evt),
          toolCallEnd: (evt) =>
            typeof logger.toolCallEnd === "function" &&
            logger.toolCallEnd(evt),
          toolCallMax: ({ rounds }) =>
            console.warn(
              `[ApiChatHandler] Max tool rounds (${rounds}) reached, using partial response`
            ),
        },
      });
    completeText = finalText;
    metrics = finalMetrics;
  }

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
        metrics,
        attachments,
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
      user,
    });

    // Save LLM message log
    try {
      await WorkspaceChats.createLlmMessageLog(chat.id, {
        systemPrompt:
          messages.find((m) => m.role === "system")?.content || null,
        userPrompt: message,
        contextTexts,
        chatHistory: rawHistory,
        compressedMessages: messages,
        llmResponse: completeText,
      });
    } catch (error) {
      console.error("[LLM Log] Failed to save log:", error.message);
    }

    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
      sources,
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
  });
  return;
}

module.exports.ApiChatHandler = {
  chatSync,
  streamChat,
};
