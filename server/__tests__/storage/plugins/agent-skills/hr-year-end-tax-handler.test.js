/**
 * hr-year-end-tax handler.js 단위테스트
 */

global.fetch = jest.fn();

const path = require("path");
const handlerPath = path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/hr-year-end-tax/handler.js"
);

beforeEach(() => {
  jest.resetModules();
  global.fetch.mockReset();
});

function loadHandler() {
  delete require.cache[handlerPath];
  return require(handlerPath);
}

function createMockContext(baseUrl = "http://test-hr-api:8000") {
  return {
    runtimeArgs: { HR_API_BASE_URL: baseUrl },
    introspect: jest.fn(),
    logger: jest.fn(),
  };
}

function mockFetchSuccess(data) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data, message: null }),
  });
}

describe("hr-year-end-tax handler", () => {
  describe("cal_yy 파라미터 전송", () => {
    const queryTypes = [
      "credit_card", "donation", "education", "family", "insurance",
      "medical", "previous_employer", "result", "savings", "summary",
    ];

    queryTypes.forEach((qt) => {
      it(`${qt}에서 cal_yy를 전송해야 한다`, async () => {
        const mod = loadHandler();
        const ctx = createMockContext();
        mockFetchSuccess([{ item: "test", amount: 100000 }]);

        await mod.runtime.handler.call(ctx, {
          emp_no: "10001",
          query_type: qt,
          cal_yy: "2024",
        });

        const calledUrl = global.fetch.mock.calls[0][0];
        expect(calledUrl).toContain("cal_yy=2024");
        expect(calledUrl).toContain("emp_no=10001");
      });
    });
  });

  describe("cal_yy 미전달 시 하위 호환성", () => {
    it("cal_yy 없이 호출하면 emp_no만 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기부금", amount: 500000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "donation",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/year-end-tax/donation?emp_no=10001"
      );
    });
  });

  describe("빈값 처리", () => {
    it("cal_yy가 빈 문자열이면 전송하지 않아야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "test" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "summary",
        cal_yy: "",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).not.toContain("cal_yy");
    });

    it("cal_yy가 null이면 전송하지 않아야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "test" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "result",
        cal_yy: null,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).not.toContain("cal_yy");
    });
  });

  describe("날짜 파라미터 해석 (resolveDateParam 연동)", () => {
    it("한국어 상대 표현 '작년'을 YYYY로 변환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "test", amount: 100000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "result",
        cal_yy: "작년",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      const expected = String(new Date().getFullYear() - 1);
      expect(calledUrl).toContain(`cal_yy=${expected}`);
    });

    it("해석 불가 문자열은 제거되어야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "test" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "summary",
        cal_yy: "abc날짜아님",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).not.toContain("cal_yy");
    });

    it("정확한 YYYY 형식은 그대로 전달해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "test", amount: 100000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "credit_card",
        cal_yy: "2024",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("cal_yy=2024");
    });
  });

  describe("필수 파라미터 유효성 검증", () => {
    it("emp_no가 없으면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "",
        query_type: "summary",
      });
      expect(result).toContain("사원번호(emp_no)가 필요합니다");
    });

    it("query_type이 유효하지 않으면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "invalid",
      });
      expect(result).toContain("query_type이 올바르지 않습니다");
    });
  });

  describe("응답 포맷팅", () => {
    it("정상 데이터를 마크다운 테이블로 포맷해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([
        { 항목: "신용카드", 금액: 5000000 },
        { 항목: "체크카드", 금액: 2000000 },
      ]);

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "credit_card",
        cal_yy: "2024",
      });

      expect(result).toContain("HR 연말정산");
      expect(result).toContain("총 **2건** 조회됨");
    });

    it("빈 데이터면 안내 메시지를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], message: null }),
      });

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "donation",
      });

      expect(result).toContain("조회 결과가 존재하지 않습니다");
    });
  });
});
