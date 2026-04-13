/* eslint-env jest, node */

// mergeSharedResults.js 단위 테스트
// - mergeAndRank 합산 로직
// - performMergedSearch 통합 로직 (mock 기반)

// mergeAndRank는 내부 함수이므로, 테스트를 위해 모듈에서 직접 호출할 수 없다.
// 대신 performMergedSearch를 통해 간접적으로 테스트하거나,
// mergeAndRank 로직을 검증할 수 있도록 별도 export가 필요하다.
// 여기서는 performMergedSearch를 mock과 함께 통합 테스트한다.

const mockPerformSimilaritySearch = jest.fn();
const mockHasNamespace = jest.fn();

// Mock helpers (VectorDb provider)
jest.mock("../../../utils/helpers", () => ({
  getVectorDbClass: () => ({
    performSimilaritySearch: mockPerformSimilaritySearch,
    hasNamespace: mockHasNamespace,
  }),
}));

// Mock Workspace model
const mockGetShared = jest.fn();
jest.mock("../../../models/workspace", () => ({
  Workspace: {
    getShared: mockGetShared,
  },
}));

const {
  performMergedSearch,
} = require("../../../utils/vectorSearch/mergeSharedResults");

const defaultParams = {
  workspace: { id: 1, slug: "test-workspace" },
  input: "test query",
  LLMConnector: {},
  similarityThreshold: 0.25,
  topN: 4,
  filterIdentifiers: [],
  rerank: false,
  adjacentChunks: 0,
};

describe("performMergedSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("공용 워크스페이스가 없을 때", () => {
    it("일반 검색만 수행한다", async () => {
      mockGetShared.mockResolvedValue(null);
      const expected = {
        contextTexts: ["text1"],
        sources: [{ title: "doc1", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch.mockResolvedValue(expected);

      const result = await performMergedSearch(defaultParams);

      expect(result).toEqual(expected);
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(1);
      expect(mockPerformSimilaritySearch).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: "test-workspace" })
      );
    });
  });

  describe("자기 자신이 공용 워크스페이스일 때", () => {
    it("합산 스킵하고 일반 검색만 수행한다", async () => {
      mockGetShared.mockResolvedValue({ id: 1, slug: "test-workspace" });
      const expected = {
        contextTexts: ["text1"],
        sources: [{ title: "doc1", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch.mockResolvedValue(expected);

      const result = await performMergedSearch(defaultParams);

      expect(result).toEqual(expected);
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(1);
    });
  });

  describe("공용 네임스페이스가 존재하지 않을 때", () => {
    it("일반 검색만 수행한다", async () => {
      mockGetShared.mockResolvedValue({
        id: 2,
        slug: "shared-ws",
        similarityThreshold: 0.25,
        topN: 4,
        adjacentChunks: 0,
      });
      mockHasNamespace.mockResolvedValue(false);
      const expected = {
        contextTexts: ["text1"],
        sources: [{ title: "doc1", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch.mockResolvedValue(expected);

      const result = await performMergedSearch(defaultParams);

      expect(result).toEqual(expected);
      expect(mockHasNamespace).toHaveBeenCalledWith("shared-ws");
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(1);
    });
  });

  describe("공용 검색이 정상적으로 수행될 때", () => {
    const sharedWorkspace = {
      id: 2,
      slug: "shared-ws",
      similarityThreshold: 0.3,
      topN: 3,
      adjacentChunks: 1,
    };

    beforeEach(() => {
      mockGetShared.mockResolvedValue(sharedWorkspace);
      mockHasNamespace.mockResolvedValue(true);
    });

    it("병렬 검색 후 합산 결과를 반환한다", async () => {
      const localResult = {
        contextTexts: ["local text 1"],
        sources: [{ title: "local-doc", score: 0.9, chunkSource: "local://1" }],
        message: false,
      };
      const sharedResult = {
        contextTexts: ["shared text 1"],
        sources: [{ title: "shared-doc", score: 0.7, chunkSource: "shared://1" }],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(defaultParams);

      // 2개의 검색이 수행됨
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(2);
      // 결과에 양쪽 소스 포함
      expect(result.sources).toHaveLength(2);
      // score 내림차순 정렬 (local 0.9 먼저)
      expect(result.sources[0].title).toBe("local-doc");
      expect(result.sources[0].score).toBe(0.9);
      // 공용 소스에 fromShared 태깅
      expect(result.sources[1].fromShared).toBe(true);
      expect(result.sources[1].title).toBe("shared-doc");
    });

    it("topN으로 결과를 제한한다", async () => {
      const localResult = {
        contextTexts: ["t1", "t2", "t3"],
        sources: [
          { title: "d1", score: 0.9, chunkSource: "c1" },
          { title: "d2", score: 0.7, chunkSource: "c2" },
          { title: "d3", score: 0.5, chunkSource: "c3" },
        ],
        message: false,
      };
      const sharedResult = {
        contextTexts: ["s1", "s2", "s3"],
        sources: [
          { title: "s1", score: 0.85, chunkSource: "sc1" },
          { title: "s2", score: 0.6, chunkSource: "sc2" },
          { title: "s3", score: 0.4, chunkSource: "sc3" },
        ],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const params = { ...defaultParams, topN: 3 };
      const result = await performMergedSearch(params);

      // 6개 중 topN=3만 반환
      expect(result.sources).toHaveLength(3);
      // score 순: 0.9, 0.85, 0.7
      expect(result.sources[0].score).toBe(0.9);
      expect(result.sources[1].score).toBe(0.85);
      expect(result.sources[2].score).toBe(0.7);
    });

    it("동일 chunkSource 중복 시 높은 score만 유지한다", async () => {
      const localResult = {
        contextTexts: ["local version"],
        sources: [{ title: "same-doc", score: 0.6, chunkSource: "doc://same" }],
        message: false,
      };
      const sharedResult = {
        contextTexts: ["shared version"],
        sources: [{ title: "same-doc", score: 0.8, chunkSource: "doc://same" }],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(defaultParams);

      // 중복 제거 후 1개만 남음
      expect(result.sources).toHaveLength(1);
      // 높은 score (0.8) 유지, fromShared 태깅
      expect(result.sources[0].score).toBe(0.8);
      expect(result.sources[0].fromShared).toBe(true);
    });

    it("로컬 소스에는 fromShared가 없다", async () => {
      const localResult = {
        contextTexts: ["local"],
        sources: [{ title: "local-doc", score: 0.9, chunkSource: "l://1" }],
        message: false,
      };
      const sharedResult = {
        contextTexts: [],
        sources: [],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(defaultParams);

      expect(result.sources[0].fromShared).toBeUndefined();
    });

    it("공용 검색 설정은 공용 WS 자체 값을 사용한다", async () => {
      mockPerformSimilaritySearch
        .mockResolvedValueOnce({ contextTexts: [], sources: [], message: false })
        .mockResolvedValueOnce({ contextTexts: [], sources: [], message: false });

      await performMergedSearch(defaultParams);

      // 두 번째 호출 (shared search)의 파라미터 확인
      const sharedCall = mockPerformSimilaritySearch.mock.calls[1][0];
      expect(sharedCall.namespace).toBe("shared-ws");
      expect(sharedCall.similarityThreshold).toBe(0.3);
      expect(sharedCall.topN).toBe(3);
      expect(sharedCall.adjacentChunks).toBe(1);
      // rerank은 호출 WS 설정 사용
      expect(sharedCall.rerank).toBe(false);
      // filterIdentifiers는 빈 배열 (공용 pin 미적용)
      expect(sharedCall.filterIdentifiers).toEqual([]);
    });
  });

  describe("Graceful Degradation", () => {
    const sharedWorkspace = {
      id: 2,
      slug: "shared-ws",
      similarityThreshold: 0.25,
      topN: 4,
      adjacentChunks: 0,
    };

    beforeEach(() => {
      mockGetShared.mockResolvedValue(sharedWorkspace);
      mockHasNamespace.mockResolvedValue(true);
    });

    it("공용 검색 실패 시 자체 결과만 반환한다", async () => {
      const localResult = {
        contextTexts: ["local"],
        sources: [{ title: "local-doc", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockRejectedValueOnce(new Error("Shared search failed"));

      const result = await performMergedSearch(defaultParams);

      // 자체 결과만 반환
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("local-doc");
      // fromShared가 없음
      expect(result.sources[0].fromShared).toBeUndefined();
    });

    it("공용 검색이 에러 메시지를 반환하면 자체 결과만 반환한다", async () => {
      const localResult = {
        contextTexts: ["local"],
        sources: [{ title: "local-doc", score: 0.8 }],
        message: false,
      };
      const sharedError = {
        contextTexts: [],
        sources: [],
        message: "No documents found for shared workspace!",
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedError);

      const result = await performMergedSearch(defaultParams);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("local-doc");
    });
  });

  describe("contextTexts와 sources 매핑", () => {
    beforeEach(() => {
      mockGetShared.mockResolvedValue({
        id: 2,
        slug: "shared-ws",
        similarityThreshold: 0.25,
        topN: 4,
        adjacentChunks: 0,
      });
      mockHasNamespace.mockResolvedValue(true);
    });

    it("contextTexts가 sources와 올바르게 매핑된다", async () => {
      const localResult = {
        contextTexts: ["local context A"],
        sources: [{ title: "docA", score: 0.5, chunkSource: "a://1" }],
        message: false,
      };
      const sharedResult = {
        contextTexts: ["shared context B"],
        sources: [{ title: "docB", score: 0.9, chunkSource: "b://1" }],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      const result = await performMergedSearch(defaultParams);

      // score 정렬: docB(0.9) > docA(0.5)
      expect(result.sources[0].title).toBe("docB");
      expect(result.contextTexts[0]).toBe("shared context B");
      expect(result.sources[1].title).toBe("docA");
      expect(result.contextTexts[1]).toBe("local context A");
    });
  });

  describe("skipRewrite 파라미터", () => {
    beforeEach(() => {
      mockGetShared.mockResolvedValue(null);
    });

    it("skipRewrite=true: 원본 쿼리가 그대로 VectorDb에 전달된다", async () => {
      const expected = {
        contextTexts: ["text1"],
        sources: [{ title: "doc1", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch.mockResolvedValue(expected);

      const result = await performMergedSearch({
        ...defaultParams,
        input: "홍길동 급여 지급 내역",
        skipRewrite: true,
      });

      expect(result).toEqual(expected);
      const searchCall = mockPerformSimilaritySearch.mock.calls[0][0];
      expect(searchCall.input).toBe("홍길동 급여 지급 내역");
    });

    it("skipRewrite 미지정(기본값 false): 기존 동작과 동일하다", async () => {
      const expected = {
        contextTexts: ["text1"],
        sources: [{ title: "doc1", score: 0.8 }],
        message: false,
      };
      mockPerformSimilaritySearch.mockResolvedValue(expected);

      const result = await performMergedSearch({
        ...defaultParams,
        input: "테스트 쿼리",
      });

      expect(result).toEqual(expected);
      expect(mockPerformSimilaritySearch).toHaveBeenCalledTimes(1);
    });

    it("skipRewrite=true + 공용 WS: 양쪽 검색 모두 원본 쿼리를 사용한다", async () => {
      const sharedWorkspace = {
        id: 2,
        slug: "shared-ws",
        similarityThreshold: 0.25,
        topN: 4,
        adjacentChunks: 0,
      };
      mockGetShared.mockResolvedValue(sharedWorkspace);
      mockHasNamespace.mockResolvedValue(true);

      const localResult = {
        contextTexts: ["local"],
        sources: [{ title: "local-doc", score: 0.9, chunkSource: "l://1" }],
        message: false,
      };
      const sharedResult = {
        contextTexts: ["shared"],
        sources: [{ title: "shared-doc", score: 0.7, chunkSource: "s://1" }],
        message: false,
      };
      mockPerformSimilaritySearch
        .mockResolvedValueOnce(localResult)
        .mockResolvedValueOnce(sharedResult);

      await performMergedSearch({
        ...defaultParams,
        input: "원본 검색어",
        skipRewrite: true,
      });

      const localCall = mockPerformSimilaritySearch.mock.calls[0][0];
      const sharedCall = mockPerformSimilaritySearch.mock.calls[1][0];
      expect(localCall.input).toBe("원본 검색어");
      expect(sharedCall.input).toBe("원본 검색어");
    });
  });
});
