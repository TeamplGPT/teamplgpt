const { applyRuleBasedRewriting } = require("./strategies/ruleBased");
const { llmRewrite } = require("./strategies/conversational");

/**
 * Maximum input length for query rewriting.
 * Prevents regex performance issues on extremely long inputs.
 */
const MAX_INPUT_LENGTH = 2000;

const DEBUG = process.env.DEBUG_QUERY_REWRITE === "true";

/**
 * Query Rewriter - Main Entry Point
 *
 * Rewrites user queries before vector search to improve retrieval quality.
 * Supports three modes controlled by workspace.queryRewriteMode:
 *
 * - "off":  No rewriting (passthrough)
 * - "rule": Rule-based only (synonym expansion, stopword removal, reference resolution)
 * - "llm":  Rule-based + LLM-based conversational rewriting
 *
 * Architecture Decision:
 * This function is called inside performMergedSearch() so that ALL search
 * paths (stream, API, embed, react, agents) benefit from rewriting without
 * modifying each caller individually.
 *
 * Set DEBUG_QUERY_REWRITE=true to enable verbose debug logging.
 *
 * @param {Object} params
 * @param {string} params.input - Original user message
 * @param {Object} params.workspace - Workspace config (includes queryRewriteMode)
 * @param {Array}  params.chatHistory - Recent chat messages [{role, content}, ...]
 * @param {Object} params.LLMConnector - LLM provider instance (for "llm" mode)
 * @returns {Promise<{rewrittenQuery: string, originalQuery: string, strategy: string}>}
 */
async function rewriteQuery({
  input,
  workspace,
  chatHistory = [],
  LLMConnector = null,
}) {
  const mode = workspace?.queryRewriteMode ?? "off";
  const originalQuery = input;

  if (mode === "off" || !input || typeof input !== "string") {
    return { rewrittenQuery: input, originalQuery, strategy: "none" };
  }

  // Cap input length to prevent regex performance issues
  const cappedInput =
    input.length > MAX_INPUT_LENGTH
      ? input.slice(0, MAX_INPUT_LENGTH)
      : input;

  const startTime = DEBUG ? Date.now() : 0;

  // Phase 1: Rule-based rewriting (always runs for "rule" and "llm" modes)
  let rewritten = applyRuleBasedRewriting(cappedInput, chatHistory);
  let strategy = "rule";

  // Phase 2: LLM-based rewriting (only for "llm" mode with history)
  if (mode === "llm" && LLMConnector && chatHistory.length > 0) {
    try {
      const llmResult = await llmRewrite(rewritten, chatHistory, LLMConnector);
      if (llmResult && llmResult !== rewritten) {
        rewritten = llmResult;
        strategy = "llm";
      }
    } catch (e) {
      // Fallback to rule-based result on any failure
      console.warn(
        `[QueryRewriter] LLM rewrite failed, using rule-based result: ${e.message}`
      );
    }
  }

  const elapsed = DEBUG ? Date.now() - startTime : 0;

  // Log rewriting for observability
  if (rewritten !== originalQuery) {
    console.log(
      `[QueryRewriter] "${originalQuery}" → "${rewritten}" (strategy: ${strategy}${DEBUG ? `, ${elapsed}ms` : ""})`
    );
  } else if (DEBUG) {
    console.log(
      `[QueryRewriter] passthrough (mode: ${mode}, ${elapsed}ms)`
    );
  }

  return { rewrittenQuery: rewritten, originalQuery, strategy };
}

module.exports = { rewriteQuery, MAX_INPUT_LENGTH };
