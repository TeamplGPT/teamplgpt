const { PGVector } = require("../../../../utils/vectorDbProviders/pgvector");

/**
 * Hybrid Search 기능 테스트
 *
 * 이 테스트는 PGVector의 하이브리드 검색 관련 메서드를 테스트합니다:
 * - rrfFusion: Reciprocal Rank Fusion 점수 결합
 * - keywordSearchResponse: tsvector + pg_trgm 키워드 검색
 * - hybridSearchResponse: vector + keyword 병렬 검색 오케스트레이션
 * - performSimilaritySearch: hybridSearch 파라미터 분기
 */

describe("PGVector.hybridSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // rrfFusion 테스트
  // ============================================================
  describe("rrfFusion", () => {
    it("벡터와 키워드 양쪽에 모두 나타난 문서가 가장 높은 점수를 받아야 함", () => {
      const vectorResults = {
        contextTexts: ["doc A text", "doc B text"],
        sourceDocuments: [
          { docId: "doc-A", chunkIndex: 0, text: "doc A text", score: 0.95 },
          { docId: "doc-B", chunkIndex: 0, text: "doc B text", score: 0.80 },
        ],
        scores: [0.95, 0.80],
      };

      const keywordResults = {
        contextTexts: ["doc A text", "doc C text"],
        sourceDocuments: [
          { docId: "doc-A", chunkIndex: 0, text: "doc A text", keywordScore: 0.90 },
          { docId: "doc-C", chunkIndex: 0, text: "doc C text", keywordScore: 0.70 },
        ],
        scores: [0.90, 0.70],
      };

      const result = PGVector.rrfFusion(vectorResults, keywordResults, 4, 60);

      // doc A는 양쪽 모두 rank 1이므로 가장 높은 RRF 점수
      expect(result.sourceDocuments[0].docId).toBe("doc-A");
      // doc A의 RRF score = 1/(60+1) + 1/(60+1) = 2/61
      expect(result.scores[0]).toBeCloseTo(2 / 61, 6);

      // 총 3개 고유 문서
      expect(result.sourceDocuments).toHaveLength(3);
    });

    it("topN 파라미터가 결과 수를 제한해야 함", () => {
      const vectorResults = {
        contextTexts: ["a", "b", "c"],
        sourceDocuments: [
          { docId: "A", chunkIndex: 0, text: "a", score: 0.9 },
          { docId: "B", chunkIndex: 0, text: "b", score: 0.8 },
          { docId: "C", chunkIndex: 0, text: "c", score: 0.7 },
        ],
        scores: [0.9, 0.8, 0.7],
      };

      const keywordResults = {
        contextTexts: ["d", "e"],
        sourceDocuments: [
          { docId: "D", chunkIndex: 0, text: "d", keywordScore: 0.8 },
          { docId: "E", chunkIndex: 0, text: "e", keywordScore: 0.6 },
        ],
        scores: [0.8, 0.6],
      };

      const result = PGVector.rrfFusion(vectorResults, keywordResults, 2, 60);

      expect(result.sourceDocuments).toHaveLength(2);
      expect(result.contextTexts).toHaveLength(2);
      expect(result.scores).toHaveLength(2);
    });

    it("한쪽 검색 결과가 비어있어도 다른 쪽 결과를 반환해야 함", () => {
      const vectorResults = {
        contextTexts: ["doc A"],
        sourceDocuments: [
          { docId: "A", chunkIndex: 0, text: "doc A", score: 0.9 },
        ],
        scores: [0.9],
      };

      const keywordResults = {
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      };

      const result = PGVector.rrfFusion(vectorResults, keywordResults, 4, 60);

      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.sourceDocuments[0].docId).toBe("A");
      // 벡터 rank 1만: 1/(60+1)
      expect(result.scores[0]).toBeCloseTo(1 / 61, 6);
    });

    it("양쪽 결과가 모두 비어있으면 빈 결과를 반환해야 함", () => {
      const emptyResults = {
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      };

      const result = PGVector.rrfFusion(emptyResults, emptyResults, 4, 60);

      expect(result.sourceDocuments).toHaveLength(0);
      expect(result.contextTexts).toHaveLength(0);
      expect(result.scores).toHaveLength(0);
    });

    it("RRF 점수가 내림차순으로 정렬되어야 함", () => {
      // docKey는 docId + chunkIndex + text.slice(0,50)로 구성됨
      // 같은 문서는 동일한 text를 가져야 매칭됨
      const vectorResults = {
        contextTexts: ["doc A text", "doc B text", "doc C text"],
        sourceDocuments: [
          { docId: "A", chunkIndex: 0, text: "doc A text", score: 0.9 },
          { docId: "B", chunkIndex: 0, text: "doc B text", score: 0.8 },
          { docId: "C", chunkIndex: 0, text: "doc C text", score: 0.7 },
        ],
        scores: [0.9, 0.8, 0.7],
      };

      // 키워드 검색에서 C가 1위, B가 2위 (벡터에서는 C=3위, B=2위)
      const keywordResults = {
        contextTexts: ["doc C text", "doc B text"],
        sourceDocuments: [
          { docId: "C", chunkIndex: 0, text: "doc C text", keywordScore: 0.95 },
          { docId: "B", chunkIndex: 0, text: "doc B text", keywordScore: 0.80 },
        ],
        scores: [0.95, 0.80],
      };

      const result = PGVector.rrfFusion(vectorResults, keywordResults, 3, 60);

      // B는 vector rank 2 + keyword rank 2 = 1/(60+2) + 1/(60+2) = 2/62
      // C는 vector rank 3 + keyword rank 1 = 1/(60+3) + 1/(60+1) = 1/63 + 1/61
      // A는 vector rank 1 only = 1/(60+1) = 1/61
      const scoreB = 2 / 62;
      const scoreC = 1 / 63 + 1 / 61;
      const scoreA = 1 / 61;

      // C > B > A 순서
      expect(result.scores[0]).toBeCloseTo(scoreC, 6);
      expect(result.scores[1]).toBeCloseTo(scoreB, 6);
      expect(result.scores[2]).toBeCloseTo(scoreA, 6);
    });

    it("같은 docId+chunkIndex+text를 가진 문서는 중복 제거되어야 함", () => {
      // docKey = docId-chunkIndex-text.slice(0,50)이므로 text도 동일해야 매칭
      const sharedText = "동일한 청크 텍스트 내용입니다";
      const vectorResults = {
        contextTexts: [sharedText],
        sourceDocuments: [
          { docId: "doc-1", chunkIndex: 5, text: sharedText, score: 0.9 },
        ],
        scores: [0.9],
      };

      const keywordResults = {
        contextTexts: [sharedText],
        sourceDocuments: [
          { docId: "doc-1", chunkIndex: 5, text: sharedText, keywordScore: 0.8 },
        ],
        scores: [0.8],
      };

      const result = PGVector.rrfFusion(vectorResults, keywordResults, 4, 60);

      // 같은 문서이므로 1개만 나와야 함
      expect(result.sourceDocuments).toHaveLength(1);
      // 양쪽 점수가 결합됨: 1/(60+1) + 1/(60+1) = 2/61
      expect(result.scores[0]).toBeCloseTo(2 / 61, 6);
    });
  });

  // ============================================================
  // keywordSearchResponse 테스트
  // ============================================================
  describe("keywordSearchResponse", () => {
    it("키워드 매칭 결과를 점수 내림차순으로 반환해야 함", async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            { metadata: { text: "연차 사용 방법", docId: "d1", chunkIndex: 0 }, _keyword_score: 0.85 },
            { metadata: { text: "연차 잔여일수 확인", docId: "d2", chunkIndex: 0 }, _keyword_score: 0.72 },
          ],
        }),
      };

      const result = await PGVector.keywordSearchResponse({
        client: mockClient,
        namespace: "test-ns",
        queryText: "연차",
        topN: 10,
        filterIdentifiers: [],
      });

      expect(result.contextTexts).toEqual(["연차 사용 방법", "연차 잔여일수 확인"]);
      expect(result.scores[0]).toBe(0.85);
      expect(result.scores[1]).toBe(0.72);
      expect(result.sourceDocuments).toHaveLength(2);
    });

    it("점수가 0 이하인 결과는 제외해야 함", async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            { metadata: { text: "good result", docId: "d1", chunkIndex: 0 }, _keyword_score: 0.5 },
            { metadata: { text: "zero score", docId: "d2", chunkIndex: 0 }, _keyword_score: 0 },
            { metadata: { text: "negative score", docId: "d3", chunkIndex: 0 }, _keyword_score: -0.1 },
          ],
        }),
      };

      const result = await PGVector.keywordSearchResponse({
        client: mockClient,
        namespace: "test-ns",
        queryText: "test",
        topN: 10,
        filterIdentifiers: [],
      });

      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.contextTexts).toEqual(["good result"]);
    });

    it("filterIdentifiers에 포함된 소스는 제외해야 함", async () => {
      // sourceIdentifier는 title:${title}-timestamp:${published} 형식을 반환
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              metadata: {
                text: "pinned doc",
                docId: "d1",
                chunkIndex: 0,
                title: "Pinned Doc",
                published: "2026-01-01T00:00:00.000Z",
              },
              _keyword_score: 0.9,
            },
            {
              metadata: {
                text: "normal doc",
                docId: "d2",
                chunkIndex: 0,
                title: "Normal Doc",
                published: "2026-01-02T00:00:00.000Z",
              },
              _keyword_score: 0.7,
            },
          ],
        }),
      };

      const result = await PGVector.keywordSearchResponse({
        client: mockClient,
        namespace: "test-ns",
        queryText: "test",
        topN: 10,
        filterIdentifiers: ["title:Pinned Doc-timestamp:2026-01-01T00:00:00.000Z"],
      });

      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.contextTexts).toEqual(["normal doc"]);
    });

    it("빈 결과를 올바르게 처리해야 함", async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      const result = await PGVector.keywordSearchResponse({
        client: mockClient,
        namespace: "test-ns",
        queryText: "존재하지 않는 키워드",
        topN: 10,
        filterIdentifiers: [],
      });

      expect(result.contextTexts).toEqual([]);
      expect(result.sourceDocuments).toEqual([]);
      expect(result.scores).toEqual([]);
    });

    it("올바른 SQL 쿼리 파라미터를 전달해야 함", async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await PGVector.keywordSearchResponse({
        client: mockClient,
        namespace: "my-workspace",
        queryText: "퇴직금 계산",
        topN: 15,
        filterIdentifiers: [],
      });

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockClient.query.mock.calls[0];

      // SQL에 ts_rank과 similarity가 포함되어야 함
      expect(sql).toContain("ts_rank");
      expect(sql).toContain("similarity");
      expect(sql).toContain("plainto_tsquery");

      // 파라미터 확인
      expect(params).toEqual(["퇴직금 계산", "my-workspace", 15]);
    });
  });

  // ============================================================
  // hybridSearchResponse 테스트
  // ============================================================
  describe("hybridSearchResponse", () => {
    it("vector와 keyword 검색을 병렬 실행해야 함", async () => {
      const mockClient = { query: jest.fn() };

      const vectorResult = {
        contextTexts: ["vec result"],
        sourceDocuments: [{ docId: "d1", chunkIndex: 0, text: "vec result", score: 0.9 }],
        scores: [0.9],
      };

      const keywordResult = {
        contextTexts: ["kw result"],
        sourceDocuments: [{ docId: "d2", chunkIndex: 0, text: "kw result", keywordScore: 0.8 }],
        scores: [0.8],
      };

      PGVector.similarityResponse = jest.fn().mockResolvedValue(vectorResult);
      PGVector.keywordSearchResponse = jest.fn().mockResolvedValue(keywordResult);

      const result = await PGVector.hybridSearchResponse({
        client: mockClient,
        namespace: "test-ns",
        queryText: "test query",
        queryVector: [0.1, 0.2, 0.3],
        similarityThreshold: 0.25,
        topN: 4,
        filterIdentifiers: [],
      });

      // 양쪽 모두 호출되어야 함
      expect(PGVector.similarityResponse).toHaveBeenCalledTimes(1);
      expect(PGVector.keywordSearchResponse).toHaveBeenCalledTimes(1);

      // 결과가 RRF로 결합됨
      expect(result.sourceDocuments).toHaveLength(2);
    });

    it("후보 수가 topN * 3으로 설정되어야 함", async () => {
      PGVector.similarityResponse = jest.fn().mockResolvedValue({
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      });
      PGVector.keywordSearchResponse = jest.fn().mockResolvedValue({
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      });

      await PGVector.hybridSearchResponse({
        client: { query: jest.fn() },
        namespace: "test-ns",
        queryText: "test",
        queryVector: [0.1],
        topN: 5,
        filterIdentifiers: [],
      });

      // similarityResponse의 topN이 5 * 3 = 15여야 함
      expect(PGVector.similarityResponse).toHaveBeenCalledWith(
        expect.objectContaining({ topN: 15 })
      );
      expect(PGVector.keywordSearchResponse).toHaveBeenCalledWith(
        expect.objectContaining({ topN: 15 })
      );
    });

    it("최종 결과가 topN으로 제한되어야 함", async () => {
      const manyVectorDocs = Array.from({ length: 10 }, (_, i) => ({
        docId: `v-${i}`,
        chunkIndex: 0,
        text: `vec doc ${i}`,
        score: 0.9 - i * 0.05,
      }));

      PGVector.similarityResponse = jest.fn().mockResolvedValue({
        contextTexts: manyVectorDocs.map((d) => d.text),
        sourceDocuments: manyVectorDocs,
        scores: manyVectorDocs.map((d) => d.score),
      });
      PGVector.keywordSearchResponse = jest.fn().mockResolvedValue({
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      });

      const result = await PGVector.hybridSearchResponse({
        client: { query: jest.fn() },
        namespace: "test-ns",
        queryText: "test",
        queryVector: [0.1],
        topN: 3,
        filterIdentifiers: [],
      });

      expect(result.sourceDocuments).toHaveLength(3);
    });
  });

  // ============================================================
  // performSimilaritySearch - hybridSearch 분기 테스트
  // ============================================================
  describe("performSimilaritySearch - hybridSearch branching", () => {
    const mockConnection = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };

    const mockLLMConnector = {
      embedTextInput: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    beforeEach(() => {
      PGVector.connect = jest.fn().mockResolvedValue(mockConnection);
      PGVector.namespaceExists = jest.fn().mockResolvedValue(true);
    });

    it("hybridSearch=false일 때 similarityResponse를 호출해야 함", async () => {
      const simResult = {
        contextTexts: ["result"],
        sourceDocuments: [{ docId: "d1", chunkIndex: 0, text: "result", score: 0.9 }],
        scores: [0.9],
      };

      PGVector.similarityResponse = jest.fn().mockResolvedValue(simResult);
      PGVector.hybridSearchResponse = jest.fn();

      await PGVector.performSimilaritySearch({
        namespace: "test-ns",
        input: "test",
        LLMConnector: mockLLMConnector,
        hybridSearch: false,
      });

      expect(PGVector.similarityResponse).toHaveBeenCalledTimes(1);
      expect(PGVector.hybridSearchResponse).not.toHaveBeenCalled();
    });

    it("hybridSearch=true일 때 hybridSearchResponse를 호출해야 함", async () => {
      const hybridResult = {
        contextTexts: ["hybrid result"],
        sourceDocuments: [{ docId: "d1", chunkIndex: 0, text: "hybrid result", score: 0.033 }],
        scores: [0.033],
      };

      PGVector.similarityResponse = jest.fn();
      PGVector.hybridSearchResponse = jest.fn().mockResolvedValue(hybridResult);

      await PGVector.performSimilaritySearch({
        namespace: "test-ns",
        input: "test",
        LLMConnector: mockLLMConnector,
        hybridSearch: true,
      });

      expect(PGVector.hybridSearchResponse).toHaveBeenCalledTimes(1);
      expect(PGVector.similarityResponse).not.toHaveBeenCalled();
    });

    it("hybridSearch=true일 때 queryText가 올바르게 전달되어야 함", async () => {
      PGVector.hybridSearchResponse = jest.fn().mockResolvedValue({
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      });

      await PGVector.performSimilaritySearch({
        namespace: "test-ns",
        input: "연차 잔여일수 조회",
        LLMConnector: mockLLMConnector,
        hybridSearch: true,
        topN: 4,
        similarityThreshold: 0.25,
      });

      expect(PGVector.hybridSearchResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          queryText: "연차 잔여일수 조회",
          namespace: "test-ns",
          topN: 4,
          similarityThreshold: 0.25,
        })
      );
    });

    it("hybridSearch=true에서도 adjacentChunks가 동작해야 함", async () => {
      const hybridResult = {
        contextTexts: ["hybrid chunk"],
        sourceDocuments: [
          { docId: "doc-1", chunkIndex: 3, text: "hybrid chunk", score: 0.033 },
        ],
        scores: [0.033],
      };

      PGVector.hybridSearchResponse = jest.fn().mockResolvedValue(hybridResult);

      const adjacentResult = {
        contextTexts: ["adj chunk 2", "adj chunk 4"],
        sourceDocuments: [
          { docId: "doc-1", chunkIndex: 2, isAdjacentChunk: true },
          { docId: "doc-1", chunkIndex: 4, isAdjacentChunk: true },
        ],
      };

      PGVector.getAdjacentChunks = jest.fn().mockResolvedValue(adjacentResult);

      const result = await PGVector.performSimilaritySearch({
        namespace: "test-ns",
        input: "test",
        LLMConnector: mockLLMConnector,
        hybridSearch: true,
        adjacentChunks: 1,
      });

      // adjacentChunks가 호출되어야 함
      expect(PGVector.getAdjacentChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: "doc-1",
          chunkIndex: 3,
          adjacentCount: 1,
        })
      );

      // 원본 1개 + 인접 2개 = 3개
      expect(result.contextTexts).toHaveLength(3);
      expect(result.sources).toHaveLength(3);
    });

    it("hybridSearch 파라미터 기본값은 false여야 함", async () => {
      const simResult = {
        contextTexts: ["default result"],
        sourceDocuments: [{ docId: "d1", chunkIndex: 0, text: "default result", score: 0.9 }],
        scores: [0.9],
      };

      PGVector.similarityResponse = jest.fn().mockResolvedValue(simResult);
      PGVector.hybridSearchResponse = jest.fn();

      // hybridSearch 파라미터를 전달하지 않음
      await PGVector.performSimilaritySearch({
        namespace: "test-ns",
        input: "test",
        LLMConnector: mockLLMConnector,
      });

      // 기본값 false이므로 similarityResponse가 호출됨
      expect(PGVector.similarityResponse).toHaveBeenCalledTimes(1);
      expect(PGVector.hybridSearchResponse).not.toHaveBeenCalled();
    });
  });
});
