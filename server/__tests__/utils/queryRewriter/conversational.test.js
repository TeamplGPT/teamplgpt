const {
  llmRewrite,
  REWRITE_SYSTEM_PROMPT,
  LLM_REWRITE_TIMEOUT_MS,
} = require("../../../utils/queryRewriter/strategies/conversational");

describe("QueryRewriter - Conversational (LLM) Strategy", () => {
  // ─── 기본 동작 ───
  describe("llmRewrite 기본 동작", () => {
    it("LLM 응답을 정상적으로 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "홍길동 3월 급여명세서",
        }),
      };

      const result = await llmRewrite(
        "그 사람 이번달 급여",
        [
          { role: "user", content: "홍길동 인사정보 조회" },
          { role: "assistant", content: "결과입니다" },
        ],
        mockLLM
      );

      expect(result).toBe("홍길동 3월 급여명세서");
    });

    it("temperature 0으로 호출한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "테스트 쿼리",
        }),
      };

      await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전 대화" }],
        mockLLM
      );

      expect(mockLLM.getChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        { temperature: 0 }
      );
    });

    it("시스템 프롬프트가 첫 번째 메시지에 포함된다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe(REWRITE_SYSTEM_PROMPT);
    });

    it("마지막 메시지에 원본 질문이 포함된다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      await llmRewrite(
        "급여 조회해줘",
        [{ role: "user", content: "이전" }],
        mockLLM
      );

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.role).toBe("user");
      expect(lastMsg.content).toContain("급여 조회해줘");
    });
  });

  // ─── 히스토리 처리 ───
  describe("chatHistory 처리", () => {
    it("최근 3턴(6개 메시지)만 포함한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      const longHistory = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `메시지 ${i}`,
      }));

      await llmRewrite("현재 질문", longHistory, mockLLM);

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      // system(1) + history(6) + user(1) = 8
      expect(messages.length).toBe(8);
    });

    it("히스토리의 role을 user/assistant로 정규화한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      await llmRewrite(
        "질문",
        [
          { role: "user", content: "사용자 메시지" },
          { role: "system", content: "시스템 응답" }, // system → assistant
        ],
        mockLLM
      );

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      // system prompt + history messages + final user
      expect(messages[1].role).toBe("user");
      expect(messages[2].role).toBe("assistant"); // system → assistant
    });

    it("긴 히스토리 메시지를 300자로 자른다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      const longContent = "가".repeat(500);
      await llmRewrite(
        "질문",
        [{ role: "user", content: longContent }],
        mockLLM
      );

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      expect(messages[1].content.length).toBeLessThanOrEqual(300);
    });

    it("content가 객체(멀티모달)이면 JSON.stringify 후 자른다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "결과",
        }),
      };

      await llmRewrite(
        "질문",
        [
          {
            role: "user",
            content: [
              { type: "text", text: "이미지 설명" },
              { type: "image_url", url: "data:image/png;base64,..." },
            ],
          },
        ],
        mockLLM
      );

      const messages = mockLLM.getChatCompletion.mock.calls[0][0];
      expect(typeof messages[1].content).toBe("string");
    });
  });

  // ─── 입력 검증 ───
  describe("입력 검증", () => {
    it("LLMConnector가 null이면 원본을 반환한다", async () => {
      const result = await llmRewrite("급여 조회", [], null);
      expect(result).toBe("급여 조회");
    });

    it("input이 빈 문자열이면 원본을 반환한다", async () => {
      const mockLLM = { getChatCompletion: jest.fn() };
      const result = await llmRewrite("", [], mockLLM);
      expect(result).toBe("");
      expect(mockLLM.getChatCompletion).not.toHaveBeenCalled();
    });

    it("input이 null이면 null을 반환한다", async () => {
      const mockLLM = { getChatCompletion: jest.fn() };
      const result = await llmRewrite(null, [], mockLLM);
      expect(result).toBeNull();
    });
  });

  // ─── 응답 검증 (가드레일) ───
  describe("응답 가드레일", () => {
    it("빈 응답이면 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "",
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("null 응답이면 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: null,
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("200자 초과 응답이면 원본을 반환한다 (답변 생성 감지)", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "아".repeat(201),
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("200자 이내 응답이면 정상 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "가".repeat(200),
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("가".repeat(200));
    });

    it("'답변' 포함 응답이면 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "답변을 드리겠습니다. 홍길동님의 급여는...",
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("'알려드리' 포함 응답이면 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "알려드리겠습니다. 3월 급여명세서 기준...",
        }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("응답 앞뒤 공백을 제거한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({
          textResponse: "  홍길동 급여  ",
        }),
      };

      const result = await llmRewrite(
        "그 사람 급여",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("홍길동 급여");
    });
  });

  // ─── 에러/타임아웃 처리 ───
  describe("에러 및 타임아웃 처리", () => {
    it("LLM API 에러 시 예외가 전파된다 (caller에서 catch)", async () => {
      const mockLLM = {
        getChatCompletion: jest
          .fn()
          .mockRejectedValue(new Error("API rate limit")),
      };

      await expect(
        llmRewrite(
          "급여 조회",
          [{ role: "user", content: "이전" }],
          mockLLM
        )
      ).rejects.toThrow("API rate limit");
    });

    it("getChatCompletion이 undefined 반환 시 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue(undefined),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });

    it("getChatCompletion이 textResponse 없이 반환 시 원본을 반환한다", async () => {
      const mockLLM = {
        getChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }),
      };

      const result = await llmRewrite(
        "급여 조회",
        [{ role: "user", content: "이전" }],
        mockLLM
      );
      expect(result).toBe("급여 조회");
    });
  });

  // ─── 상수 검증 ───
  describe("상수 검증", () => {
    it("타임아웃이 3초이다", () => {
      expect(LLM_REWRITE_TIMEOUT_MS).toBe(3000);
    });

    it("시스템 프롬프트에 HR 관련 규칙이 포함된다", () => {
      expect(REWRITE_SYSTEM_PROMPT).toContain("HR");
      expect(REWRITE_SYSTEM_PROMPT).toContain("대명사");
      expect(REWRITE_SYSTEM_PROMPT).toContain("사원번호");
    });
  });
});
