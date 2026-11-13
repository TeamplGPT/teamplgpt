/**
 * Determine if hybrid search (vector + BM25) should be used.
 * Currently: pgvector DB always uses hybrid search regardless of workspace setting.
 *
 * @param {object} workspace - Prisma workspace record (or partial object)
 * @param {string} [workspace.vectorDB] - Vector database identifier
 * @returns {boolean} true if hybrid search should be applied
 */
function shouldUseHybridSearch(workspace) {
  return workspace?.vectorDB === "pgvector";
}

/**
 * Determine if rerank should be used.
 * Currently: lancedb DB applies rerank only when workspace explicitly opts in.
 *
 * @param {object} workspace - Prisma workspace record (or partial object)
 * @param {string} [workspace.vectorDB] - Vector database identifier
 * @param {string} [workspace.vectorSearchMode] - User-selected mode
 * @returns {boolean} true if rerank should be applied
 */
function shouldUseRerank(workspace) {
  if (workspace?.vectorDB !== "lancedb") return false;
  return workspace?.vectorSearchMode === "rerank";
}

module.exports = { shouldUseHybridSearch, shouldUseRerank };
