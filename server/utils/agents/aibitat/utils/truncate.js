const DEFAULT_MAX_CHARS = 8_000;

/**
 * Truncate a tool call result to prevent context window overflow.
 * If the result exceeds maxChars, it is sliced and a truncation notice is appended.
 *
 * @param {string} result - The tool call result string.
 * @param {number} maxChars - Maximum allowed characters (default 8,000).
 * @returns {string} The original or truncated result.
 */
function truncateToolResult(result, maxChars = DEFAULT_MAX_CHARS) {
  if (typeof result !== "string") return result;
  if (result.length <= maxChars) return result;

  const truncated = result.slice(0, maxChars);
  return `${truncated}\n\n[... truncated: showing ${maxChars} of ${result.length} total characters]`;
}

module.exports = { truncateToolResult, DEFAULT_MAX_CHARS };
