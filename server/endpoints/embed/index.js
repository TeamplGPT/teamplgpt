const { v4: uuidv4 } = require("uuid");
const { reqBody, multiUserMode } = require("../../utils/http");
const { Telemetry } = require("../../models/telemetry");
const { streamChatWithForEmbed } = require("../../utils/chats/embed");
const { EmbedChats } = require("../../models/embedChats");
const {
  validEmbedConfig,
  canRespond,
  setConnectionMeta,
} = require("../../utils/middleware/embedMiddleware");
const {
  convertToChatHistory,
  writeResponseChunk,
} = require("../../utils/helpers/chat/responses");

/**
 * Parse `x-tool-runtime-override-<PARAM>` request headers into a runtimeArgs override map.
 * Test/dev-only mechanism — allows E2E runners to redirect skill HTTP targets (e.g., mock API port)
 * without mutating plugin.json. Header names are case-insensitive; param names are uppercased.
 *
 * Gated by NODE_ENV === 'development' OR ALLOW_TOOL_RUNTIME_OVERRIDE === 'true'.
 * Returns null in production so merge layer becomes a no-op.
 *
 * @param {import('express').Request} request
 * @returns {Object<string,string>|null}
 */
function parseToolRuntimeOverrideHeaders(request) {
  const gateOpen =
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_TOOL_RUNTIME_OVERRIDE === "true";
  if (!gateOpen) return null;

  const PREFIX = "x-tool-runtime-override-";
  const overrides = {};
  for (const [rawKey, rawValue] of Object.entries(request.headers || {})) {
    const key = rawKey.toLowerCase();
    if (!key.startsWith(PREFIX)) continue;
    const paramName = key.slice(PREFIX.length).toUpperCase();
    if (!paramName) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== "string" || value.length === 0) continue;
    overrides[paramName] = value;
  }
  if (Object.keys(overrides).length === 0) return null;
  console.log(
    `[tool-runtime-override] embed applying overrides: ${Object.keys(overrides).join(", ")}`
  );
  return overrides;
}

function embeddedEndpoints(app) {
  if (!app) return;

  app.post(
    "/embed/:embedId/stream-chat",
    [validEmbedConfig, setConnectionMeta, canRespond],
    async (request, response) => {
      try {
        const embed = response.locals.embedConfig;
        const {
          sessionId,
          message,
          // optional keys for override of defaults if enabled.
          prompt = null,
          model = null,
          temperature = null,
          username = null,
        } = reqBody(request);

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        const toolRuntimeOverrides =
          parseToolRuntimeOverrideHeaders(request);
        await streamChatWithForEmbed(response, embed, message, sessionId, {
          promptOverride: prompt,
          modelOverride: model,
          temperatureOverride: temperature,
          username,
          toolRuntimeOverrides,
        });
        await Telemetry.sendTelemetry("embed_sent_chat", {
          multiUserMode: multiUserMode(response),
          LLMSelection: process.env.LLM_PROVIDER || "openai",
          Embedder: process.env.EMBEDDING_ENGINE || "inherit",
          VectorDbSelection: process.env.VECTOR_DB || "lancedb",
        });
        response.end();
      } catch (e) {
        console.error(e);
        writeResponseChunk(response, {
          id: uuidv4(),
          type: "abort",
          sources: [],
          textResponse: null,
          close: true,
          error: e.message,
        });
        response.end();
      }
    }
  );

  app.get(
    "/embed/:embedId/:sessionId",
    [validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;
        const history = await EmbedChats.forEmbedByUser(
          embed.id,
          sessionId,
          null,
          null,
          true
        );

        response.status(200).json({ history: convertToChatHistory(history) });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/embed/:embedId/:sessionId",
    [validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;

        await EmbedChats.markHistoryInvalid(embed.id, sessionId);
        response.status(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { embeddedEndpoints, parseToolRuntimeOverrideHeaders };
