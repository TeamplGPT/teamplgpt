/**
 * hr-salary handler.js 단위테스트
 */

global.fetch = jest.fn();

const path = require("path");
const handlerPath = path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/hr-salary/handler.js"
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

describe("hr-salary handler", () => {
  describe("PARAMS_MAP - 유효 파라미터 전송", () => {
    it("payslip은 year_month를 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", amount: 3000000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "payslip",
        year_month: "202501",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202501");
    });

    it("compare는 current_month와 previous_month를 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", current: 3000000, previous: 2900000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "compare",
        current_month: "202503",
        previous_month: "202502",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("current_month=202503");
      expect(calledUrl).toContain("previous_month=202502");
    });

    it("retroactive는 year_month와 limit을 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ month: "202503", amount: 50000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "retroactive",
        year_month: "202503",
        limit: 5,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202503");
      expect(calledUrl).toContain("limit=5");
    });

    it("annual_total은 year를 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ total: 45000000 });

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "annual_total",
        year: "2024",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year=2024");
    });

    it("bonus는 year를 전송해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ type: "성과급", amount: 5000000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "bonus",
        year: "2025",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year=2025");
    });
  });

  describe("무효 파라미터 무시", () => {
    it("account에 모든 선택 파라미터를 전달해도 무시해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ bank: "국민은행", account: "***-***-1234" });

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "account",
        year: "2025",
        year_month: "202503",
        current_month: "202503",
        limit: 10,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/salary/account?emp_no=10001"
      );
    });

    it("payslip에 current_month를 전달하면 무시해야 한다 (year_month만 유효)", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", amount: 3000000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "payslip",
        current_month: "202503",
        year_month: "202501",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202501");
      expect(calledUrl).not.toContain("current_month");
    });
  });

  describe("숫자형 파라미터 처리", () => {
    it("limit이 숫자로 전달되어도 문자열로 변환되어야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ month: "202503", amount: 50000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "retroactive",
        limit: 15,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("limit=15");
    });
  });

  describe("날짜 파라미터 해석 (resolveDateParam 연동)", () => {
    it("한국어 상대 표현 '지난달'을 YYYYMM으로 변환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", amount: 3000000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "payslip",
        year_month: "지난달",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const expected = `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      expect(calledUrl).toContain(`year_month=${expected}`);
    });

    it("한국어 상대 표현 '작년'을 YYYY로 변환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ total: 45000000 });

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "annual_total",
        year: "작년",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      const expected = String(new Date().getFullYear() - 1);
      expect(calledUrl).toContain(`year=${expected}`);
    });

    it("compare의 상대 표현 '이번달'/'지난달'을 변환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", current: 3000000, previous: 2900000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "compare",
        current_month: "이번달",
        previous_month: "지난달",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toMatch(/current_month=\d{6}/);
      expect(calledUrl).toMatch(/previous_month=\d{6}/);
    });

    it("비표준 포맷 '2025-03'은 sugar-date가 '202503'으로 해석해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", amount: 3000000 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "payslip",
        year_month: "2025-03",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202503");
    });
  });

  describe("하위 호환성", () => {
    it("선택 파라미터 없이 호출해도 정상 동작해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ item: "기본급", amount: 3000000 }]);

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "payslip",
      });

      expect(result).toContain("HR 급여");
      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/salary/payslip?emp_no=10001"
      );
    });
  });

  describe("필수 파라미터 유효성 검증", () => {
    it("emp_no가 없으면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "",
        query_type: "payslip",
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
});
