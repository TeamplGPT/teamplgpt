const pluralize = require("pluralize");
const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");

// In-memory cache for agent attachments.
// Bridges the HTTP → WebSocket gap: attachments are cached here after grepAgents()
// and consumed by AgentHandler once the WebSocket connection is established.
const agentAttachmentCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache attachments for an agent invocation (in-memory, one-time consumption).
 * @param {string} uuid - The invocation UUID
 * @param {Array<{name: string, mime: string, contentString: string}>} attachments
 */
function cacheAgentAttachments(uuid, attachments) {
  if (!attachments?.length) return;
  agentAttachmentCache.set(uuid, attachments);
  setTimeout(() => agentAttachmentCache.delete(uuid), CACHE_TTL_MS);
}

/**
 * Retrieve and delete cached attachments for an agent invocation.
 * Returns empty array if not found (cache miss, TTL expired, or already consumed).
 * @param {string} uuid - The invocation UUID
 * @returns {Array<{name: string, mime: string, contentString: string}>}
 */
function consumeAgentAttachments(uuid) {
  const attachments = agentAttachmentCache.get(uuid) || [];
  agentAttachmentCache.delete(uuid);
  return attachments;
}

async function grepAgents({
  uuid,
  response,
  message,
  workspace,
  user = null,
  thread = null,
  attachments = [],
}) {
  const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
  if (agentHandles.length > 0) {
    const { invocation: newInvocation } = await WorkspaceAgentInvocation.new({
      prompt: message,
      workspace: workspace,
      user: user,
      thread: thread,
    });

    if (!newInvocation) {
      writeResponseChunk(response, {
        id: uuid,
        type: "statusResponse",
        textResponse: `${pluralize(
          "Agent",
          agentHandles.length
        )} ${agentHandles.join(
          ", "
        )} could not be called. Chat will be handled as default chat.`,
        sources: [],
        close: true,
        animate: false,
        error: null,
      });
      return;
    }

    // Cache attachments so AgentHandler can retrieve them after WebSocket handshake
    cacheAgentAttachments(newInvocation.uuid, attachments);
    if (attachments.length > 0) {
      console.log(
        `\x1b[36m[Agent Multimodal]\x1b[0m Cached ${attachments.length} attachment(s) for invocation ${newInvocation.uuid}`
      );
    }

    writeResponseChunk(response, {
      id: uuid,
      type: "agentInitWebsocketConnection",
      textResponse: null,
      sources: [],
      close: false,
      error: null,
      websocketUUID: newInvocation.uuid,
    });

    // Close HTTP stream-able chunk response method because we will swap to agents now.
    writeResponseChunk(response, {
      id: uuid,
      type: "statusResponse",
      textResponse: `${pluralize(
        "Agent",
        agentHandles.length
      )} ${agentHandles.join(
        ", "
      )} invoked.\nSwapping over to agent chat. Type /exit to exit agent execution loop early.`,
      sources: [],
      close: true,
      error: null,
      animate: true,
    });
    return true;
  }

  return false;
}

module.exports = { grepAgents, consumeAgentAttachments };
