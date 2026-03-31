/* eslint-env jest, node */

/**
 * Hybrid Search 통합테스트
 *
 * performMergedSearch → performSimilaritySearch → hybridSearchResponse
 * 파이프라인 전체가 hybridSearch 파라미터를 올바르게 전달하고
 * 처리하는지 검증합니다.
 *
 * 테스트 범위:
 * H-1: hybridSearch=true 파라미터 전달 (로컬 + 공용)
 * H-2: hybridSearch=false 하위 호환성
 * H-3: hybrid + adjacentChunks 조합
 * H-4: hybrid + 공용 WS 병렬 검색
 * H-5: hybrid + Graceful Degradation
 * H-6: hybrid 결과의 RRF 점수가 mergeAndRank와 올바르게 통합
 */

// ─── Mocks ───────────────────────────────────────────────────

const mockPerformSimilaritySearch = jest.fn();
const mockHasNamespace = jest.fn();

jest.mock("../../utils/helpers", () => ({
  getVectorDbClass: () => ({
    performSimilaritySearch: mockPerformSimilaritySearch,
    hasNamespace: mockHasNamespace,
  }),
}));

const mockGetShared = jest.fn();
jest.mock("../../models/workspace", () => ({
  Workspace: {
    getShared: mockGetShared,
  },
}));

const {
  performMergedSearch,
} = require("../../utils/vectorSearch/mergeSharedResults");

// ─── Fixtures ────────────────────────────────────────────────

function createSearchParams(overrides = {}) {
  return {
    workspace: { id: 1, slug: "hr-workspace", vectorSearchMode: "hybrid" },
    input: "연차 잔여일수 조회",
    LLMConnector: { embedTextInput: jest.fn() },
    similarityThreshold: 0.25,
    topN: 4,
    filterIdentifiers: [],
    rerank: false,
    hybridSearch: true,
    adjacentChunks: 0,
    ...overrides,
  };
}

function createSearchResult(sources = [], contextTexts = null) {
  return {
    contextTexts: contextTexts || sources.map((s) => `context for ${s.title}`),
    sources,
    message: false,
  };
}

const SHARED_WORKSPACE = {
  id: 99,
  slug: "shared-hr-docs",
  similarityThreshold: 0.3,
  topN: 5,
  adjacentChunks: 1,
  vectorSearchMode: "hybrid",
};

// ─── Tests ───────────────────────────────────────────────────

describe("Hybrid Search Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // H-1: hybridSearch 파라미터 전달
  describe("H-1: hybridSearch=true가 performSimilaritySearch에 전달된다", () => {
    it("로컬 검색에 hybridSearch=true가 전달된다", async () => {
      mockGetShared.mockResolvedValue(null);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(createSearchParams());

      const localCall = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(localCall.hybridSearch).toBe(true);
      expect(localCall.namespace).toBe("hr-workspace");
    });

    it("공용 검색에도 hybridSearch=true가 전달된다", async () => {
      mockGetShared.mockResolvedValue(SHARED_WORKSPACE);
      mockHasNamespace.mockResolvedValue(true);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(createSearchParams());

      // 로컬 (call[0])과 공용 (call[1]) 양쪽 모두 hybridSearch=true
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(2);
      expect(mockPerformSimilaritySearch.mock.calls[0][0].hybridSearch).toBe(true);
      expect(mockPerformSimilaritySearch.mock.calls[1][0].hybridSearch).toBe(true);
    });
  });

  // H-2: hybridSearch=false 하위 호환성
  describe("H-2: hybridSearch=false일 때 기존 동작과 동일하다", () => {
    it("hybridSearch=false가 전달된다", async () => {
      mockGetShared.mockResolvedValue(null);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(
        createSearchParams({ hybridSearch: false, rerank: false })
      );

      const localCall = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(localCall.hybridSearch).toBe(false);
      expect(localCall.rerank).toBe(false);
    });

    it("hybridSearch 미전달 시 기본값 false로 전달된다", async () => {
      mockGetShared.mockResolvedValue(null);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      const params = createSearchParams();
      delete params.hybridSearch;
      await performMergedSearch(params);

      const localCall = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(localCall.hybridSearch).toBe(false);
    });

    it("rerank=true와 hybridSearch는 상호 배타적으로 전달 가능하다", async () => {
      mockGetShared.mockResolvedValue(null);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(
        createSearchParams({ hybridSearch: true, rerank: false })
      );

      const call = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(call.hybridSearch).toBe(true);
      expect(call.rerank).toBe(false);
    });
  });

  // H-3: hybrid + adjacentChunks 조합
  describe("H-3: hybridSearch와 adjacentChunks가 함께 전달된다", () => {
    it("hybridSearch=true + adjacentChunks=2가 동시에 전달된다", async () => {
      mockGetShared.mockResolvedValue(null);
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(
        createSearchParams({ hybridSearch: true, adjacentChunks: 2 })
      );

      const call = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(call.hybridSearch).toBe(true);
      expect(call.adjacentChunks).toBe(2);
    });
  });

  // H-4: hybrid + 공용 WS 병렬 검색 파이프라인
  describe("H-4: hybrid 모드에서 로컬+공용 병렬 검색 후 합산", () => {
    beforeEach(() => {
      mockGetShared.mockResolvedValue(SHARED_WORKSPACE);
      mockHasNamespace.mockResolvedValue(true);
    });

    it("hybrid 결과가 RRF 점수로 올바르게 합산된다", async () => {
      // RRF 점수는 일반 cosine similarity와 다른 스케일(~0.01~0.03)
      const localSources = [
        { title: "local-hr-1", score: 0.033, chunkSource: "l://1" },
        { title: "local-hr-2", score: 0.016, chunkSource: "l://2" },
      ];
      const sharedSources = [
        { title: "shared-hr-1", score: 0.025, chunkSource: "s://1" },
      ];

      mockPerformSimilaritySearch
        .mockResolvedValueOnce(createSearchResult(localSources))
        .mockResolvedValueOnce(createSearchResult(sharedSources));

      const result = await performMergedSearch(createSearchParams({ topN: 3 }));

      // 점수 내림차순: 0.033, 0.025, 0.016
      expect(result.sources).toHaveLength(3);
      expect(result.sources[0].score).toBe(0.033);
      expect(result.sources[0].title).toBe("local-hr-1");
      expect(result.sources[1].score).toBe(0.025);
      expect(result.sources[1].fromShared).toBe(true);
      expect(result.sources[2].score).toBe(0.016);
    });

    it("공용 검색의 adjacentChunks는 공용 WS 설정을 사용한다", async () => {
      mockPerformSimilaritySearch.mockResolvedValue(createSearchResult([]));

      await performMergedSearch(
        createSearchParams({ adjacentChunks: 3 })
      );

      // 로컬: adjacentChunks=3 (호출 파라미터)
      const localCall = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(localCall.adjacentChunks).toBe(3);

      // 공용: adjacentChunks=1 (SHARED_WORKSPACE 자체 값)
      const sharedCall = mockPerformSimilaritySearch.mock.calls[1][0];
      expect(sharedCall.adjacentChunks).toBe(1);
    });
  });

  // H-5: hybrid + Graceful Degradation
  describe("H-5: hybrid 모드에서 공용 검색 실패 시 로컬 결과만 반환", () => {
    beforeEach(() => {
      mockGetShared.mockResolvedValue(SHARED_WORKSPACE);
      mockHasNamespace.mockResolvedValue(true);
    });

    it("공용 hybrid 검색 예외 시 로컬 hybrid 결과만 반환", async () => {
      const localResult = createSearchResult([
        { title: "local-hybrid", score: 0.033, chunkSource: "l://1" },
      ]);

      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockRejectedValueOnce(new Error("Hybrid search timeout on shared"));

      const result = await performMergedSearch(createSearchParams());

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("local-hybrid");
      expect(result.sources[0].fromShared).toBeUndefined();
    });

    it("공용 hybrid 검색이 에러 메시지 반환 시 로컬 결과만 반환", async () => {
      const localResult = createSearchResult([
        { title: "local-only", score: 0.025, chunkSource: "l://1" },
      ]);
      const sharedError = {
        contextTexts: [],
        sources: [],
        message: "text_search column not found - run hybrid-search-setup.sql",
      };

      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedError);

      const result = await performMergedSearch(createSearchParams());

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("local-only");
    });
  });

  // H-6: 중복 제거와 contextTexts 매핑 무결성
  describe("H-6: hybrid 모드에서 중복 제거 및 contextTexts 매핑", () => {
    beforeEach(() => {
      mockGetShared.mockResolvedValue(SHARED_WORKSPACE);
      mockHasNamespace.mockResolvedValue(true);
    });

    it("로컬과 공용에 같은 chunkSource가 있으면 높은 점수만 유지", async () => {
      const localResult = createSearchResult(
        [{ title: "dup-doc", score: 0.020, chunkSource: "dup://1" }],
        ["local context"]
      );
      const sharedResult = createSearchResult(
        [{ title: "dup-doc", score: 0.033, chunkSource: "dup://1" }],
        ["shared context"]
      );

      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(createSearchParams());

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].score).toBe(0.033);
      expect(result.sources[0].fromShared).toBe(true);
      expect(result.contextTexts[0]).toBe("shared context");
    });

    it("contextTexts와 sources 인덱스가 정렬 후에도 일치한다", async () => {
      const localResult = createSearchResult(
        [
          { title: "A", score: 0.010, chunkSource: "a://1" },
          { title: "B", score: 0.030, chunkSource: "b://1" },
        ],
        ["ctx-A", "ctx-B"]
      );
      const sharedResult = createSearchResult(
        [{ title: "C", score: 0.020, chunkSource: "c://1" }],
        ["ctx-C"]
      );

      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(createSearchParams({ topN: 3 }));

      // 정렬: B(0.030), C(0.020), A(0.010)
      expect(result.sources[0].title).toBe("B");
      expect(result.contextTexts[0]).toBe("ctx-B");
      expect(result.sources[1].title).toBe("C");
      expect(result.contextTexts[1]).toBe("ctx-C");
      expect(result.sources[2].title).toBe("A");
      expect(result.contextTexts[2]).toBe("ctx-A");
    });
  });
});
