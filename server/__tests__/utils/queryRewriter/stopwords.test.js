const {
  removeStopwords,
  FILLER_PATTERNS,
  STOPWORDS,
} = require("../../../utils/queryRewriter/dictionaries/stopwords");

describe("QueryRewriter - Stopwords Dictionary", () => {
  // ─── FILLER_PATTERNS 개별 테스트 ───
  describe("FILLER_PATTERNS - 인사말 제거", () => {
    it.each([
      ["안녕하세요 급여 조회", "급여 조회"],
      ["안녕하세요, 급여 조회", "급여 조회"],
      ["안녕하세요. 급여 조회", "급여 조회"],
      ["안녕 급여 조회", "급여 조회"],
      ["감사합니다 급여 조회", "급여 조회"],
      ["수고하세요 급여 조회", "급여 조회"],
    ])('"%s" → "%s"', (input, expected) => {
      const result = removeStopwords(input);
      expect(result).toBe(expected);
    });
  });

  describe("FILLER_PATTERNS - 요청 표현 제거", () => {
    it.each([
      ["급여 알려주세요", "급여"],
      ["급여 알려줘", "급여"],
      ["급여 보여주세요", "급여"],
      ["급여 보여줘", "급여"],
      ["급여 말해주세요", "급여"],
      ["급여 말해줘", "급여"],
      ["급여 확인해주세요", "급여"],
      ["급여 확인해줘", "급여"],
      ["급여 조회 부탁합니다", "급여 조회"],
      ["급여 조회 부탁해", "급여 조회"],
    ])('"%s" → "%s"', (input, expected) => {
      const result = removeStopwords(input);
      expect(result).toBe(expected);
    });
  });

  describe("FILLER_PATTERNS - 궁금/알고싶다 표현 제거", () => {
    it.each([
      ["급여 궁금합니다", "급여"],
      ["급여 궁금해요", "급여"],
      ["급여 궁금해", "급여"],
      ["급여 알고 싶어요", "급여"],
      ["급여 알고 싶습니다", "급여"],
    ])('"%s" → "%s"', (input, expected) => {
      const result = removeStopwords(input);
      expect(result).toBe(expected);
    });
  });

  describe("FILLER_PATTERNS - '혹시' 접두사 제거", () => {
    it("문장 시작의 '혹시'를 제거한다", () => {
      const result = removeStopwords("혹시 급여 조회 가능한가요");
      expect(result).not.toMatch(/^혹시/);
      expect(result).toContain("급여");
    });
  });

  // ─── STOPWORDS 개별 테스트 ───
  describe("STOPWORDS - 접속사/부사 제거", () => {
    it.each([
      "그리고",
      "그런데",
      "하지만",
      "그래서",
      "또한",
      "또",
      "그냥",
      "정말",
      "진짜",
      "매우",
      "너무",
      "아주",
    ])('"%s"가 STOPWORDS에 포함된다', (word) => {
      expect(STOPWORDS.has(word)).toBe(true);
    });
  });

  describe("STOPWORDS - 대명사 제거", () => {
    it.each(["저", "제", "나", "내", "우리"])(
      '"%s"가 STOPWORDS에 포함된다',
      (word) => {
        expect(STOPWORDS.has(word)).toBe(true);
      }
    );
  });

  // ─── removeStopwords 복합 시나리오 ───
  describe("removeStopwords - 복합 시나리오", () => {
    it("인사말 + 요청 표현이 함께 있을 때 모두 제거한다", () => {
      const result = removeStopwords("안녕하세요 급여 알려주세요");
      expect(result).toBe("급여");
    });

    it("접속사 + 부사가 혼합된 문장을 정리한다", () => {
      const result = removeStopwords(
        "그런데 정말 급여가 매우 궁금합니다"
      );
      expect(result).not.toContain("그런데");
      expect(result).not.toContain("정말");
      expect(result).not.toContain("매우");
      expect(result).toContain("급여가");
    });

    it("대명사 + 불용어가 섞인 문장을 정리한다", () => {
      const result = removeStopwords("제 급여가 너무 궁금해요");
      expect(result).not.toContain("제");
      expect(result).not.toContain("너무");
      expect(result).toContain("급여가");
    });

    it("HR 핵심 키워드는 보존한다", () => {
      const result = removeStopwords(
        "안녕하세요 홍길동 사원의 3월 급여명세서 조회 부탁합니다"
      );
      expect(result).toContain("홍길동");
      expect(result).toContain("급여명세서");
      expect(result).toContain("조회");
    });

    it("숫자와 사원번호는 보존한다", () => {
      const result = removeStopwords(
        "사원번호 12345678의 2026년 3월 급여 알려주세요"
      );
      expect(result).toContain("12345678");
      expect(result).toContain("2026년");
      expect(result).toContain("3월");
      expect(result).toContain("급여");
    });

    it("이미 깨끗한 쿼리는 변경하지 않는다", () => {
      const result = removeStopwords("홍길동 3월 급여명세서");
      expect(result).toBe("홍길동 3월 급여명세서");
    });

    it("공백만 남으면 원본을 반환한다", () => {
      const input = "좀 제발";
      const result = removeStopwords(input);
      // "좀" → removed by pattern, "제발" → removed by pattern
      // if empty, return original
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── 엣지 케이스 ───
  describe("엣지 케이스", () => {
    it("단일 단어 쿼리 (불용어)는 원본을 반환한다", () => {
      const result = removeStopwords("그리고");
      // 모든 단어가 제거되면 원본 반환
      expect(result.length).toBeGreaterThan(0);
    });

    it("단일 단어 쿼리 (유효)는 그대로 반환한다", () => {
      expect(removeStopwords("급여")).toBe("급여");
    });

    it("연속 공백을 정리한다", () => {
      const result = removeStopwords("급여   명세서   조회");
      expect(result).toBe("급여 명세서 조회");
    });

    it("숫자만 있는 쿼리를 보존한다", () => {
      expect(removeStopwords("12345678")).toBe("12345678");
    });

    it("빈 문자열을 처리한다", () => {
      expect(removeStopwords("")).toBe("");
    });

    it("null을 처리한다", () => {
      expect(removeStopwords(null)).toBe(null);
    });

    it("undefined를 처리한다", () => {
      expect(removeStopwords(undefined)).toBe(undefined);
    });

    it("숫자 타입을 처리한다", () => {
      expect(removeStopwords(123)).toBe(123);
    });
  });
});
