const {
  shouldUseHybridSearch,
  shouldUseRerank,
} = require("../../../utils/vectorSearch/searchModeHelpers");

describe("searchModeHelpers", () => {
  describe("shouldUseHybridSearch", () => {
    test("T1: pgvector workspace returns true", () => {
      expect(shouldUseHybridSearch({ vectorDB: "pgvector" })).toBe(true);
    });

    test("T2: pgvector + default mode returns true", () => {
      expect(
        shouldUseHybridSearch({
          vectorDB: "pgvector",
          vectorSearchMode: "default",
        })
      ).toBe(true);
    });

    test("T3: pgvector + rerank mode still returns true (mode ignored)", () => {
      expect(
        shouldUseHybridSearch({
          vectorDB: "pgvector",
          vectorSearchMode: "rerank",
        })
      ).toBe(true);
    });

    test("T4 (hybrid part): lancedb returns false", () => {
      expect(shouldUseHybridSearch({ vectorDB: "lancedb" })).toBe(false);
    });

    test("T7 (hybrid part): chroma returns false", () => {
      expect(shouldUseHybridSearch({ vectorDB: "chroma" })).toBe(false);
    });

    test("T8 (hybrid part): empty object returns false", () => {
      expect(shouldUseHybridSearch({})).toBe(false);
    });

    test("T9 (hybrid part): null/undefined returns false", () => {
      expect(shouldUseHybridSearch(null)).toBe(false);
      expect(shouldUseHybridSearch(undefined)).toBe(false);
    });
  });

  describe("shouldUseRerank", () => {
    test("T4 (rerank part): lancedb without mode returns false", () => {
      expect(shouldUseRerank({ vectorDB: "lancedb" })).toBe(false);
    });

    test("T5: lancedb + rerank mode returns true", () => {
      expect(
        shouldUseRerank({
          vectorDB: "lancedb",
          vectorSearchMode: "rerank",
        })
      ).toBe(true);
    });

    test("T6: lancedb + default mode returns false", () => {
      expect(
        shouldUseRerank({
          vectorDB: "lancedb",
          vectorSearchMode: "default",
        })
      ).toBe(false);
    });

    test("T7 (rerank part): chroma never reranks", () => {
      expect(
        shouldUseRerank({
          vectorDB: "chroma",
          vectorSearchMode: "rerank",
        })
      ).toBe(false);
    });

    test("rerank is false for pgvector regardless of mode", () => {
      expect(
        shouldUseRerank({
          vectorDB: "pgvector",
          vectorSearchMode: "rerank",
        })
      ).toBe(false);
    });

    test("T8 (rerank part): empty object returns false", () => {
      expect(shouldUseRerank({})).toBe(false);
    });

    test("T9 (rerank part): null/undefined returns false", () => {
      expect(shouldUseRerank(null)).toBe(false);
      expect(shouldUseRerank(undefined)).toBe(false);
    });
  });

  // Prisma workspace 레코드에는 vectorDB 컬럼이 없다 — 서버 설정 VECTOR_DB로 판정해야 한다
  describe("vectorDB가 없는 실제 workspace 레코드", () => {
    const ORIGINAL = process.env.VECTOR_DB;
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.VECTOR_DB;
      else process.env.VECTOR_DB = ORIGINAL;
    });

    test("VECTOR_DB=lancedb + rerank 모드면 rerank한다", () => {
      process.env.VECTOR_DB = "lancedb";
      expect(shouldUseRerank({ vectorSearchMode: "rerank" })).toBe(true);
      expect(shouldUseRerank({ vectorSearchMode: "default" })).toBe(false);
    });

    test("VECTOR_DB가 없으면 기본 lancedb로 본다", () => {
      delete process.env.VECTOR_DB;
      expect(shouldUseRerank({ vectorSearchMode: "rerank" })).toBe(true);
      expect(shouldUseHybridSearch({ vectorSearchMode: "default" })).toBe(
        false
      );
    });

    test("VECTOR_DB=pgvector면 hybrid search를 쓰고 rerank는 안 한다", () => {
      process.env.VECTOR_DB = "pgvector";
      expect(shouldUseHybridSearch({ vectorSearchMode: "default" })).toBe(true);
      expect(shouldUseRerank({ vectorSearchMode: "rerank" })).toBe(false);
    });

    test("workspace.vectorDB가 있으면 서버 설정보다 우선한다", () => {
      process.env.VECTOR_DB = "pgvector";
      expect(
        shouldUseRerank({ vectorDB: "lancedb", vectorSearchMode: "rerank" })
      ).toBe(true);
    });

    test("workspace가 없으면 서버 설정과 무관하게 false", () => {
      process.env.VECTOR_DB = "pgvector";
      expect(shouldUseHybridSearch(null)).toBe(false);
      expect(shouldUseRerank(undefined)).toBe(false);
    });
  });
});
