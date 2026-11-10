const { Workspace } = require("../../models/workspace");
const { rewriteQuery } = require("../queryRewriter");

async function performMergedSearch({
  workspace,
  input,
  LLMConnector,
  similarityThreshold,
  topN,
  filterIdentifiers = [],
  rerank = false,
  adjacentChunks = 0,
  chatHistory = [],
  hybridSearch = false,
  skipRewrite = false,
  companyNamespace = null,
}) {
  const { getVectorDbClass } = require("../helpers");
  const VectorDb = getVectorDbClass();

  // Query Rewriting: transform input before vector search
  // Skipped in ReAct mode where the LLM already generates optimized search queries
  const { rewrittenQuery } = skipRewrite
    ? { rewrittenQuery: input }
    : await rewriteQuery({ input, workspace, chatHistory, LLMConnector });
  const searchInput = rewrittenQuery || input;

  // 위젯 회사 문서(specs/021): 공통 결과와 병합하지 않고 분리해서 돌려준다 —
  // 호출자가 회사 근거를 우선 근거로 앞에 둔다
  const companyPromise = searchCompanyNamespace(VectorDb, companyNamespace, {
    input: searchInput,
    LLMConnector,
    similarityThreshold,
    topN,
    rerank,
    adjacentChunks,
    hybridSearch,
  });
  const withCompany = async (results) => {
    if (!companyNamespace) return results;
    const company = await companyPromise;
    return {
      ...results,
      companyContextTexts: company?.contextTexts || [],
      companySources: (company?.sources || []).map((s) => ({
        ...s,
        fromCompany: true,
      })),
    };
  };

  // 회사 문서만 있고 워크스페이스 문서가 없으면 공통 검색은 "no documents" 오류를 낸다 — 빈 결과로 대신한다
  const localSearch = async () => {
    if (companyNamespace && !(await VectorDb.hasNamespace(workspace.slug)))
      return { contextTexts: [], sources: [], message: null };
    return VectorDb.performSimilaritySearch({
      namespace: workspace.slug,
      input: searchInput,
      LLMConnector,
      similarityThreshold,
      topN,
      filterIdentifiers,
      rerank,
      adjacentChunks,
      hybridSearch,
    });
  };

  const sharedWorkspace = await Workspace.getShared();

  // No shared workspace or self is shared -> normal search only
  if (!sharedWorkspace || workspace.id === sharedWorkspace.id) {
    return withCompany(await localSearch());
  }

  // Check if shared namespace exists
  const hasSharedNs = await VectorDb.hasNamespace(sharedWorkspace.slug);
  if (!hasSharedNs) {
    return withCompany(await localSearch());
  }

  // Parallel search with independent error handling for shared
  const localPromise = localSearch();
  const sharedPromise = VectorDb.performSimilaritySearch({
    namespace: sharedWorkspace.slug,
    input: searchInput,
    LLMConnector,
    similarityThreshold: sharedWorkspace.similarityThreshold ?? 0.25,
    topN: sharedWorkspace.topN ?? 4,
    filterIdentifiers: [],
    rerank, // Use calling workspace's vectorSearchMode
    adjacentChunks: sharedWorkspace.adjacentChunks ?? 0,
    hybridSearch, // Use calling workspace's vectorSearchMode
  }).catch((error) => {
    console.warn("[Shared Workspace] Shared search failed:", error.message);
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
    return withCompany(localResults);
  }

  return withCompany(mergeAndRank(localResults, sharedResults, topN));
}

async function searchCompanyNamespace(VectorDb, namespace, searchArgs) {
  if (!namespace) return null;
  try {
    if (!(await VectorDb.hasNamespace(namespace))) return null;
    const results = await VectorDb.performSimilaritySearch({
      ...searchArgs,
      namespace,
      filterIdentifiers: [],
    });
    if (results?.message) {
      console.warn(
        "[Company Docs] Company search returned error:",
        results.message
      );
      return null;
    }
    return results;
  } catch (error) {
    console.warn("[Company Docs] Company search failed:", error.message);
    return null;
  }
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
