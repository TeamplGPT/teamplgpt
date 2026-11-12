/**
 * Resolve the vector DB a workspace runs on.
 * Prisma workspace records have no vectorDB column — the DB is a server-wide
 * setting (VECTOR_DB, default lancedb as in endpoints/utils.js).
 *
 * @param {object} workspace - Prisma workspace record (or partial object)
 * @returns {string|null} vector DB identifier, null when no workspace
 */
function resolveVectorDB(workspace) {
  if (!workspace) return null;
  return workspace.vectorDB || process.env.VECTOR_DB || "lancedb";
}

/**
 * Determine if hybrid search (vector + BM25) should be used.
 * Currently: pgvector DB always uses hybrid search regardless of workspace setting.
 *
 * @param {object} workspace - Prisma workspace record (or partial object)
 * @param {string} [workspace.vectorDB] - Vector database identifier (falls back to VECTOR_DB)
 * @returns {boolean} true if hybrid search should be applied
 */
function shouldUseHybridSearch(workspace) {
  return resolveVectorDB(workspace) === "pgvector";
}

/**
 * Determine if rerank should be used.
 * Currently: lancedb DB applies rerank only when workspace explicitly opts in.
 *
 * @param {object} workspace - Prisma workspace record (or partial object)
 * @param {string} [workspace.vectorDB] - Vector database identifier (falls back to VECTOR_DB)
 * @param {string} [workspace.vectorSearchMode] - User-selected mode
 * @returns {boolean} true if rerank should be applied
 */
function shouldUseRerank(workspace) {
  if (resolveVectorDB(workspace) !== "lancedb") return false;
  return workspace.vectorSearchMode === "rerank";
}

module.exports = { shouldUseHybridSearch, shouldUseRerank };
