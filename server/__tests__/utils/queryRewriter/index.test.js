const { rewriteQuery } = require("../../../utils/queryRewriter");

describe("QueryRewriter - Main Entry Point", () => {
  const baseWorkspace = {
    slug: "test-workspace",
    queryRewriteMode: "off",
  };

  describe("mode: off", () => {
    it("passthrough - 원본 쿼리를 그대로 반환한다", async () => {
      const result = await rewriteQuery({
        input: "연차 잔여일수 알려주세요",
        workspace: { ...baseWorkspace, queryRewriteMode: "off" },
      });

      expect(result.rewrittenQuery).toBe("연차 잔여일수 알려주세요");
      expect(result.originalQuery).toBe("연차 잔여일수 알려주세요");
      expect(result.strategy).toBe("none");
    });

    it("queryRewriteMode가 없으면 off로 동작한다", async () => {
      const result = await rewriteQuery({
        input: "급여 조회",
        workspace: { slug: "test" },
      });

      expect(result.strategy).toBe("none");
      expect(result.rewrittenQuery).toBe("급여 조회");
    });

    it("빈 입력을 처리한다", async () => {
      const result = await rewriteQuery({
        input: "",
        workspace: baseWorkspace,
      });
      expect(result.rewrittenQuery).toBe("");
    });
  });

  describe("mode: rule", () => {
    const ruleWorkspace = { ...baseWorkspace, queryRewriteMode: "rule" };

    it("동의어 확장이 적용된다", async () => {
      const result = await rewriteQuery({
        input: "연차 잔여일수",
        workspace: ruleWorkspace,
      });

      expect(result.strategy).toBe("rule");
      expect(result.rewrittenQuery).toContain("연차휴가");
      expect(result.rewrittenQuery).toContain("유급휴가");
    });

    it("불용어가 제거된다", async () => {
      const result = await rewriteQuery({
        input: "안녕하세요 급여 알려주세요",
        workspace: ruleWorkspace,
      });

      expect(result.strategy).toBe("rule");
      expect(result.rewrittenQuery).not.toContain("안녕하세요");
      expect(result.rewrittenQuery).toContain("급여");
    });

    it("대화 히스토리 기반 참조 해소가 동작한다", async () => {
      const result = await rewriteQuery({
        input: "그 사람 급여 보여줘",
        workspace: ruleWorkspace,
        chatHistory: [
          { role: "user", content: "홍길동 근태 조회" },
          { role: "assistant", content: "홍길동 근태 결과입니다" },
        ],
      });

      expect(result.rewrittenQuery).toContain("홍길동");
      expect(result.rewrittenQuery).not.toContain("그 사람");
    });

    it("LLMConnector가 있어도 rule 모드에서는 LLM을 호출하지 않는다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn(),
      };

      await rewriteQuery({
        input: "급여 조회",
        workspace: ruleWorkspace,
        chatHistory: [{ role: "user", content: "이전 대화" }],
        LLMConnector: mockLLM,
      });

      expect(mockLLM.getChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe("mode: llm", () => {
    const llmWorkspace = { ...baseWorkspace, queryRewriteMode: "llm" };

    it("LLM 재작성이 성공하면 llm 전략을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "홍길동 3월 급여명세서",
        }),
      };

      const result = await rewriteQuery({
        input: "그 사람 이번달 급여",
        workspace: llmWorkspace,
        chatHistory: [
          { role: "user", content: "홍길동 인사정보 조회" },
          { role: "assistant", content: "결과입니다" },
        ],
        LLMConnector: mockLLM,
      });

      expect(result.strategy).toBe("llm");
      expect(result.rewrittenQuery).toBe("홍길동 3월 급여명세서");
    });

    it("LLM 호출 실패 시 rule-based 결과로 폴백한다", async () => {
      const mockLLM = {
        getChatCompletion: jest
          .fn()
          .mockRejectedValue(new Error("API error")),
      };

      const result = await rewriteQuery({
        input: "연차 잔여일수",
        workspace: llmWorkspace,
        chatHistory: [{ role: "user", content: "이전 대화" }],
        LLMConnector: mockLLM,
      });

      expect(result.strategy).toBe("rule");
      expect(result.rewrittenQuery).toContain("연차휴가"); // rule-based 결과
    });

    it("chatHistory가 비어있으면 LLM을 호출하지 않는다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn(),
      };

      const result = await rewriteQuery({
        input: "급여 조회",
        workspace: llmWorkspace,
        chatHistory: [],
        LLMConnector: mockLLM,
      });

      expect(mockLLM.getChatCompletion).not.toHaveBeenCalled();
      expect(result.strategy).toBe("rule");
    });

    it("LLMConnector가 없으면 rule-based만 실행한다", async () => {
      const result = await rewriteQuery({
        input: "연차 잔여일수",
        workspace: llmWorkspace,
        chatHistory: [{ role: "user", content: "이전 대화" }],
        LLMConnector: null,
      });

      expect(result.strategy).toBe("rule");
    });

    it("LLM이 200자 이상 반환하면 rule-based로 폴백한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "아".repeat(201),
        }),
      };

      const result = await rewriteQuery({
        input: "급여 조회",
        workspace: llmWorkspace,
        chatHistory: [{ role: "user", content: "이전 대화" }],
        LLMConnector: mockLLM,
      });

      // LLM returned too-long response, fallback to rule
      expect(result.strategy).toBe("rule");
    });
  });

  describe("입력 길이 캡", () => {
    it("MAX_INPUT_LENGTH 상수가 2000이다", () => {
      const { MAX_INPUT_LENGTH } = require("../../../utils/queryRewriter");
      expect(MAX_INPUT_LENGTH).toBe(2000);
    });

    it("2000자 초과 입력이 잘려서 처리된다", async () => {
      const longInput = "연차 " + "가".repeat(2500);
      const result = await rewriteQuery({
        input: longInput,
        workspace: { slug: "test", queryRewriteMode: "rule" },
      });

      // 원본은 2500+자이지만 처리됨 (에러 없음)
      expect(result.strategy).toBe("rule");
      expect(result.originalQuery).toBe(longInput);
      // 재작성 결과가 원본보다 짧음 (캡 적용됨)
      expect(result.rewrittenQuery.length).toBeLessThan(longInput.length);
    });

    it("2000자 이내 입력은 정상 처리된다", async () => {
      const normalInput = "연차 잔여일수";
      const result = await rewriteQuery({
        input: normalInput,
        workspace: { slug: "test", queryRewriteMode: "rule" },
      });

      expect(result.strategy).toBe("rule");
      expect(result.rewrittenQuery).toContain("연차휴가");
    });
  });
});
