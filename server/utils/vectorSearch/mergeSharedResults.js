const { Workspace } = require("../../models/workspace");

async function performMergedSearch({
  workspace,
  input,
  LLMConnector,
  similarityThreshold,
  topN,
  filterIdentifiers = [],
  rerank = false,
  adjacentChunks = 0,
}) {
  const { getVectorDbClass } = require("../helpers");
  const VectorDb = getVectorDbClass();

  const localSearch = () =>
    VectorDb.performSimilaritySearch({
      namespace: workspace.slug,
      input,
      LLMConnector,
      similarityThreshold,
      topN,
      filterIdentifiers,
      rerank,
      adjacentChunks,
    });

  const sharedWorkspace = await Workspace.getShared();

  // No shared workspace or self is shared -> normal search only
  if (!sharedWorkspace || workspace.id === sharedWorkspace.id) {
    return localSearch();
  }

  // Check if shared namespace exists
  const hasSharedNs = await VectorDb.hasNamespace(sharedWorkspace.slug);
  if (!hasSharedNs) {
    return localSearch();
  }

  // Parallel search with independent error handling for shared
  const localPromise = localSearch();
  const sharedPromise = VectorDb.performSimilaritySearch({
    namespace: sharedWorkspace.slug,
    input,
    LLMConnector,
    similarityThreshold: sharedWorkspace.similarityThreshold ?? 0.25,
    topN: sharedWorkspace.topN ?? 4,
    filterIdentifiers: [],
    rerank, // Use calling workspace's vectorSearchMode
    adjacentChunks: sharedWorkspace.adjacentChunks ?? 0,
  }).catch((error) => {
    console.warn(
      "[Shared Workspace] Shared search failed:",
      error.message
    );
    return null;
  });

  const [localResults, sharedResults] = await Promise.all([
    localPromise,
    sharedPromise,
  ]);

  // Shared search failed or returned error -> use local only
  if (!sharedResults || sharedResults.message) {
    if (sharedResults?.message) {
      console.warn(
        "[Shared Workspace] Shared search returned error:",
        sharedResults.message
      );
    }
    return localResults;
  }

  return mergeAndRank(localResults, sharedResults, topN);
}

function mergeAndRank(localResults, sharedResults, topN) {
  // Tag shared sources
  const taggedSharedSources = (sharedResults.sources || []).map((s) => ({
    ...s,
    fromShared: true,
  }));

  const allSources = [...(localResults.sources || []), ...taggedSharedSources];
  const allContextTexts = [
    ...(localResults.contextTexts || []),
    ...(sharedResults.contextTexts || []),
  ];

  // Deduplicate by chunkSource/title (keep higher score)
  const seen = new Map();
  for (let i = 0; i < allSources.length; i++) {
    const source = allSources[i];
    const key = source.chunkSource || source.title || String(i);
    const existing = seen.get(key);
    if (!existing || (source.score ?? 0) > (existing.source.score ?? 0)) {
      seen.set(key, { source, contextText: allContextTexts[i] || "" });
    }
  }

  // Sort by score descending, take topN
  const deduped = Array.from(seen.values());
  deduped.sort((a, b) => (b.source.score ?? 0) - (a.source.score ?? 0));
  const final = deduped.slice(0, topN);

  return {
    contextTexts: final.map((item) => item.contextText),
    sources: final.map((item) => item.source),
    message: localResults.message || false,
  };
}

module.exports = { performMergedSearch };
