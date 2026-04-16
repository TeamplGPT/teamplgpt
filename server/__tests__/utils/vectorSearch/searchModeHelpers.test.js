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
});
