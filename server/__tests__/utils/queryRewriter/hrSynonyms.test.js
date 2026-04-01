const {
  HR_SYNONYMS,
} = require("../../../utils/queryRewriter/dictionaries/hrSynonyms");
const {
  expandSynonyms,
} = require("../../../utils/queryRewriter/strategies/ruleBased");

describe("QueryRewriter - HR Synonyms Dictionary", () => {
  // ─── 사전 무결성 검증 ───
  describe("사전 구조 무결성", () => {
    it("모든 키가 문자열이다", () => {
      for (const key of Object.keys(HR_SYNONYMS)) {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      }
    });

    it("모든 값이 비어있지 않은 문자열 배열이다", () => {
      for (const [key, synonyms] of Object.entries(HR_SYNONYMS)) {
        expect(Array.isArray(synonyms)).toBe(true);
        expect(synonyms.length).toBeGreaterThan(0);
        synonyms.forEach((syn) => {
          expect(typeof syn).toBe("string");
          expect(syn.length).toBeGreaterThan(0);
        });
      }
    });

    it("사전에 중복 값이 없다 (키 내부)", () => {
      for (const [key, synonyms] of Object.entries(HR_SYNONYMS)) {
        const unique = new Set(synonyms);
        expect(unique.size).toBe(
          synonyms.length,
          `"${key}"에 중복 동의어가 있습니다: ${synonyms}`
        );
      }
    });
  });

  // ─── 카테고리별 커버리지 ───
  describe("급여 관련 동의어", () => {
    it.each(["월급", "급여", "보수", "임금", "봉급", "연봉"])(
      '"%s"가 사전에 존재한다',
      (word) => {
        expect(HR_SYNONYMS[word]).toBeDefined();
        expect(HR_SYNONYMS[word].length).toBeGreaterThan(0);
      }
    );

    it("월급 → 급여 양방향 매핑이 된다", () => {
      expect(HR_SYNONYMS["월급"]).toContain("급여");
      expect(HR_SYNONYMS["급여"]).toContain("월급");
    });

    it("보너스/상여/성과급이 상호 매핑된다", () => {
      expect(HR_SYNONYMS["보너스"]).toContain("상여");
      expect(HR_SYNONYMS["상여"]).toContain("보너스");
      expect(HR_SYNONYMS["성과급"]).toContain("보너스");
    });
  });

  describe("휴가/근태 관련 동의어", () => {
    it.each(["연차", "연가", "유급휴가", "휴가", "반차", "병가"])(
      '"%s"가 사전에 존재한다',
      (word) => {
        expect(HR_SYNONYMS[word]).toBeDefined();
      }
    );

    it("연차 ↔ 유급휴가 양방향 매핑이 된다", () => {
      expect(HR_SYNONYMS["연차"]).toContain("유급휴가");
      expect(HR_SYNONYMS["유급휴가"]).toContain("연차");
    });

    it("야근/초과근무 매핑이 된다", () => {
      expect(HR_SYNONYMS["야근"]).toContain("초과근무");
      expect(HR_SYNONYMS["초과근무"]).toContain("야근");
    });
  });

  describe("인사정보 관련 동의어", () => {
    it.each(["인사기록", "인사정보", "경력", "학력", "자격증"])(
      '"%s"가 사전에 존재한다',
      (word) => {
        expect(HR_SYNONYMS[word]).toBeDefined();
      }
    );
  });

  describe("연말정산 관련 동의어", () => {
    it.each(["연말정산", "소득공제", "세액공제", "의료비", "교육비"])(
      '"%s"가 사전에 존재한다',
      (word) => {
        expect(HR_SYNONYMS[word]).toBeDefined();
      }
    );
  });

  describe("사회보험 관련 동의어", () => {
    it("4대보험이 4개 보험을 모두 포함한다", () => {
      const synonyms = HR_SYNONYMS["4대보험"];
      expect(synonyms).toContain("국민연금");
      expect(synonyms).toContain("건강보험");
      expect(synonyms).toContain("고용보험");
      expect(synonyms).toContain("산재보험");
    });

    it("개별 보험이 4대보험을 참조한다", () => {
      expect(HR_SYNONYMS["국민연금"]).toContain("4대보험");
      expect(HR_SYNONYMS["건강보험"]).toContain("4대보험");
      expect(HR_SYNONYMS["고용보험"]).toContain("4대보험");
      expect(HR_SYNONYMS["산재보험"]).toContain("4대보험");
    });
  });

  // ─── expandSynonyms 통합 시나리오 ───
  describe("expandSynonyms 실제 검색 시나리오", () => {
    it("급여 관련 질의 확장", () => {
      const result = expandSynonyms("급여 명세서 조회");
      expect(result).toContain("급여");
      expect(result).toContain("월급");
      expect(result).toContain("명세서");
      expect(result).toContain("조회");
    });

    it("근태 관련 질의 확장", () => {
      const result = expandSynonyms("근태 현황");
      expect(result).toContain("근태");
      expect(result).toContain("출퇴근");
      expect(result).toContain("근무시간");
    });

    it("연말정산 관련 질의 확장", () => {
      const result = expandSynonyms("의료비 공제 내역");
      expect(result).toContain("의료비");
      expect(result).toContain("의료비공제");
      expect(result).toContain("병원비");
    });

    it("복합 키워드 질의 확장", () => {
      const result = expandSynonyms("연차 잔여일수 확인");
      expect(result).toContain("연차휴가");
      expect(result).toContain("유급휴가");
      expect(result).toContain("잔여일수");
      expect(result).toContain("확인");
    });

    it("동의어가 없는 단어와 있는 단어가 혼합된 경우", () => {
      const result = expandSynonyms("홍길동 급여 3월");
      expect(result).toContain("홍길동");
      expect(result).toContain("급여");
      expect(result).toContain("월급"); // 동의어 확장
      expect(result).toContain("3월");
    });

    it("중복 동의어가 제거된다 (Set 활용)", () => {
      // 급여 → [월급, 보수, 임금, 봉급], 월급 → [급여, 보수, 임금, 봉급]
      // "급여 월급" → Set으로 중복 제거
      const result = expandSynonyms("급여 월급");
      const words = result.split(" ");
      const unique = new Set(words);
      expect(words.length).toBe(unique.size);
    });
  });
});
