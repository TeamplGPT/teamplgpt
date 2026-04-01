const {
  expandSynonyms,
  resolveReferences,
  extractContextKeywords,
  isDateLikeNumber,
  applyRuleBasedRewriting,
} = require("../../../utils/queryRewriter/strategies/ruleBased");
const {
  removeStopwords,
} = require("../../../utils/queryRewriter/dictionaries/stopwords");

describe("QueryRewriter - Rule-based Strategy", () => {
  // ─── expandSynonyms ───
  describe("expandSynonyms", () => {
    it("HR 동의어를 확장한다 (연차)", () => {
      const result = expandSynonyms("연차 잔여일수");
      expect(result).toContain("연차");
      expect(result).toContain("연차휴가");
      expect(result).toContain("유급휴가");
      expect(result).toContain("연가");
      expect(result).toContain("잔여일수");
    });

    it("HR 동의어를 확장한다 (급여)", () => {
      const result = expandSynonyms("월급 조회");
      expect(result).toContain("월급");
      expect(result).toContain("급여");
      expect(result).toContain("보수");
      expect(result).toContain("임금");
    });

    it("연말정산 관련 동의어를 확장한다", () => {
      const result = expandSynonyms("연말정산 결과");
      expect(result).toContain("연말정산");
      expect(result).toContain("소득공제");
      expect(result).toContain("세액공제");
    });

    it("동의어가 없는 단어는 그대로 유지한다", () => {
      const result = expandSynonyms("사무실 위치");
      expect(result).toBe("사무실 위치");
    });

    it("부분 매칭으로 복합어 내 동의어를 확장한다", () => {
      const result = expandSynonyms("초과근무수당");
      expect(result).toContain("야근");
      expect(result).toContain("연장근무");
    });

    it("빈 입력을 처리한다", () => {
      expect(expandSynonyms("")).toBe("");
      expect(expandSynonyms(null)).toBe(null);
      expect(expandSynonyms(undefined)).toBe(undefined);
    });
  });

  // ─── removeStopwords ───
  describe("removeStopwords", () => {
    it("인사말을 제거한다", () => {
      const result = removeStopwords("안녕하세요 급여 조회해주세요");
      expect(result).not.toContain("안녕하세요");
      expect(result).toContain("급여");
    });

    it("요청 표현을 제거한다", () => {
      const result = removeStopwords("연차 잔여일수 알려주세요");
      expect(result).not.toMatch(/알려\s*주세요/);
      expect(result).toContain("연차");
      expect(result).toContain("잔여일수");
    });

    it("부탁 표현을 제거한다", () => {
      const result = removeStopwords("급여명세서 확인 부탁합니다");
      expect(result).not.toContain("부탁합니다");
      expect(result).toContain("급여명세서");
    });

    it("접속사/부사를 제거한다", () => {
      const result = removeStopwords("그리고 정말 급여 너무 궁금해요");
      expect(result).not.toContain("그리고");
      expect(result).not.toContain("정말");
      expect(result).not.toContain("너무");
      expect(result).toContain("급여");
    });

    it("모든 단어가 제거되면 원본을 반환한다", () => {
      const result = removeStopwords("저 좀");
      expect(result.length).toBeGreaterThan(0);
    });

    it("빈 입력을 처리한다", () => {
      expect(removeStopwords("")).toBe("");
      expect(removeStopwords(null)).toBe(null);
    });
  });

  // ─── resolveReferences ───
  describe("resolveReferences", () => {
    const historyWithName = [
      { role: "user", content: "홍길동 근태 조회해줘" },
      { role: "assistant", content: "홍길동님의 근태 기록입니다..." },
    ];

    const historyWithEmpNo = [
      { role: "user", content: "사원번호 12345678 급여 보여줘" },
      { role: "assistant", content: "12345678 사원의 급여입니다..." },
    ];

    it("'그 사람'을 이전 대화의 이름으로 대체한다", () => {
      const result = resolveReferences(
        "그 사람 급여도 보여줘",
        historyWithName
      );
      expect(result).toContain("홍길동");
      expect(result).toContain("급여");
      expect(result).not.toContain("그 사람");
    });

    it("'그 직원'을 이전 대화의 이름으로 대체한다", () => {
      const result = resolveReferences(
        "그 직원 연차 현황은?",
        historyWithName
      );
      expect(result).toContain("홍길동");
    });

    it("짧은 질의에 이전 대화의 키워드를 추가한다", () => {
      const result = resolveReferences("급여는?", historyWithName);
      expect(result).toContain("홍길동");
      expect(result).toContain("급여");
    });

    it("사원번호가 있는 대화에서 참조를 해소한다", () => {
      const result = resolveReferences(
        "그 사람 연차 잔여일수",
        historyWithEmpNo
      );
      expect(result).toContain("12345678");
    });

    it("참조가 없으면 원본을 반환한다", () => {
      const result = resolveReferences(
        "김철수 급여 조회해줘",
        historyWithName
      );
      expect(result).toBe("김철수 급여 조회해줘");
    });

    it("히스토리가 없으면 원본을 반환한다", () => {
      const result = resolveReferences("그 사람 급여", []);
      expect(result).toBe("그 사람 급여");
    });
  });

  // ─── extractContextKeywords ───
  describe("extractContextKeywords", () => {
    it("한국어 이름을 추출한다", () => {
      const keywords = extractContextKeywords("홍길동 근태 조회해줘");
      expect(keywords).toContain("홍길동");
    });

    it("사원번호를 추출한다", () => {
      const keywords = extractContextKeywords("사원번호 12345678 급여");
      expect(keywords).toContain("12345678");
    });

    it("일반 단어는 이름으로 추출하지 않는다", () => {
      const keywords = extractContextKeywords("급여 조회 확인");
      // 급여, 조회, 확인은 COMMON_WORDS에 포함
      expect(keywords).not.toContain("급여");
      expect(keywords).not.toContain("조회");
    });

    it("최대 3개까지만 추출한다", () => {
      const keywords = extractContextKeywords(
        "홍길동 김철수 이영희 박지민 최유진"
      );
      expect(keywords.length).toBeLessThanOrEqual(3);
    });
  });

  // ─── isDateLikeNumber ───
  describe("isDateLikeNumber", () => {
    it.each(["2026", "2025", "1999", "2000", "2099"])(
      "YYYY 형식 '%s'를 날짜로 인식한다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(true);
      }
    );

    it.each(["202604", "202601", "202612"])(
      "YYYYMM 형식 '%s'를 날짜로 인식한다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(true);
      }
    );

    it.each(["20260401", "20251231", "19990101"])(
      "YYYYMMDD 형식 '%s'를 날짜로 인식한다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(true);
      }
    );

    it.each(["12345678", "10000001", "99999999"])(
      "사원번호 '%s'를 날짜로 인식하지 않는다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(false);
      }
    );

    it.each(["1899", "2100", "3000"])(
      "범위 밖 연도 '%s'를 날짜로 인식하지 않는다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(false);
      }
    );

    it.each(["202613", "202600"])(
      "잘못된 월 '%s'를 날짜로 인식하지 않는다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(false);
      }
    );

    it.each(["20260432", "20260100"])(
      "잘못된 일 '%s'를 날짜로 인식하지 않는다",
      (num) => {
        expect(isDateLikeNumber(num)).toBe(false);
      }
    );

    it("null/빈 값을 false로 반환한다", () => {
      expect(isDateLikeNumber(null)).toBe(false);
      expect(isDateLikeNumber("")).toBe(false);
      expect(isDateLikeNumber(undefined)).toBe(false);
    });

    it("5자리/7자리 숫자는 날짜로 인식하지 않는다", () => {
      expect(isDateLikeNumber("12345")).toBe(false);
      expect(isDateLikeNumber("1234567")).toBe(false);
    });
  });

  // ─── extractContextKeywords - 날짜 오인 방지 ───
  describe("extractContextKeywords - 날짜 오인 방지", () => {
    it("YYYYMMDD 형식 날짜를 사원번호로 추출하지 않는다", () => {
      const keywords = extractContextKeywords(
        "20260401 급여 조회"
      );
      expect(keywords).not.toContain("20260401");
    });

    it("YYYY년 형식이 포함된 텍스트에서 연도를 추출하지 않는다", () => {
      const keywords = extractContextKeywords(
        "2026년 3월 급여 조회"
      );
      expect(keywords).not.toContain("2026");
    });

    it("사원번호와 날짜가 동시에 있으면 사원번호만 추출한다", () => {
      const keywords = extractContextKeywords(
        "사원번호 10000001 2026년 3월 급여"
      );
      expect(keywords).toContain("10000001");
      expect(keywords).not.toContain("2026");
    });

    it("실제 사원번호 패턴은 정상 추출한다", () => {
      const keywords = extractContextKeywords("사원번호 12345678 급여");
      expect(keywords).toContain("12345678");
    });
  });

  // ─── applyRuleBasedRewriting (전체 파이프라인) ───
  describe("applyRuleBasedRewriting", () => {
    it("전체 파이프라인이 동작한다: 참조 해소 + 불용어 제거 + 동의어 확장", () => {
      const history = [
        { role: "user", content: "홍길동 근태 조회해줘" },
        { role: "assistant", content: "근태 기록입니다." },
      ];
      const result = applyRuleBasedRewriting(
        "그 사람 월급 알려주세요",
        history
      );

      // 참조 해소: 홍길동 포함
      expect(result).toContain("홍길동");
      // 동의어 확장: 월급 → 급여, 보수 등
      expect(result).toContain("급여");
      // 불용어 제거: "알려주세요" 제거
      expect(result).not.toMatch(/알려\s*주세요/);
    });

    it("히스토리 없이도 동의어 확장과 불용어 제거가 동작한다", () => {
      const result = applyRuleBasedRewriting(
        "안녕하세요 연차 잔여일수 알려주세요"
      );
      expect(result).toContain("연차휴가");
      expect(result).toContain("유급휴가");
      expect(result).not.toContain("안녕하세요");
    });

    it("빈 입력을 처리한다", () => {
      expect(applyRuleBasedRewriting("")).toBe("");
      expect(applyRuleBasedRewriting(null)).toBe(null);
    });
  });
});
