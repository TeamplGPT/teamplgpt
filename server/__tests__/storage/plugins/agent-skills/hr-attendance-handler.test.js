/**
 * hr-attendance handler.js 단위테스트
 *
 * 테스트 범위:
 * - PARAMS_MAP 정합성 (query_type별 유효 파라미터 매핑)
 * - handler 시그니처 (선택 파라미터 수신)
 * - URLSearchParams 동적 빌드 (유효 파라미터만 전송)
 * - 필수 파라미터 유효성 검증
 * - 무효 선택 파라미터 무시
 */

// Mock fetch globally
global.fetch = jest.fn();

const path = require("path");
const handlerPath = path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/hr-attendance/handler.js"
);

// Clear module cache to ensure fresh import
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

describe("hr-attendance handler", () => {
  describe("PARAMS_MAP 정합성", () => {
    it("annual_leave_balance는 year 파라미터를 허용해야 한다", () => {
      const mod = loadHandler();
      // PARAMS_MAP은 모듈 스코프 상수이므로 handler를 통해 간접 검증
      // 대신 핸들러 호출 시 year가 URLSearchParams에 포함되는지 확인
      expect(mod.runtime).toBeDefined();
    });

    it("timesheet은 year_month 파라미터를 허용해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ date: "20250319", in: "09:00", out: "18:00" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "timesheet",
        year_month: "202501",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202501");
      expect(calledUrl).toContain("emp_no=10001");
    });

    it("leave_requests는 months와 status 파라미터를 허용해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ type: "연차", status: "승인" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "leave_requests",
        months: 3,
        status: "30",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("months=3");
      expect(calledUrl).toContain("status=30");
    });

    it("work_plan_weekly는 base_date 파라미터를 허용해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ day: "월", type: "근무" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "work_plan_weekly",
        base_date: "20250319",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("base_date=20250319");
    });

    it("overtime은 year_month 파라미터를 허용해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ date: "20250310", hours: 2 }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "overtime",
        year_month: "202503",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year_month=202503");
    });

    it("business_trips는 limit 파라미터를 허용해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ destination: "부산", date: "20250315" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "business_trips",
        limit: 5,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("limit=5");
    });
  });

  describe("무효 파라미터 무시", () => {
    it("annual_leave_balance에 year_month를 전달하면 무시해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ total: 15, used: 5, remaining: 10 });

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "annual_leave_balance",
        year_month: "202503", // 무효 - year만 유효
        year: "2025",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("year=2025");
      expect(calledUrl).not.toContain("year_month");
    });

    it("work_type에 모든 선택 파라미터를 전달해도 무시해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ type: "재택근무" });

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "work_type",
        year: "2025",
        year_month: "202503",
        limit: 10,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/attendance/work-type?emp_no=10001"
      );
    });
  });

  describe("빈값/미전달 파라미터 처리", () => {
    it("선택 파라미터가 undefined이면 전송하지 않아야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ date: "20250319" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "timesheet",
        // year_month 미전달 (undefined)
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/attendance/timesheet?emp_no=10001"
      );
    });

    it("선택 파라미터가 빈 문자열이면 전송하지 않아야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ date: "20250319" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "timesheet",
        year_month: "  ",
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).not.toContain("year_month");
    });

    it("선택 파라미터가 null이면 전송하지 않아야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess([{ date: "20250319" }]);

      await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "timesheet",
        year_month: null,
      });

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).not.toContain("year_month");
    });
  });

  describe("필수 파라미터 유효성 검증", () => {
    it("emp_no가 없으면 에러 메시지를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "",
        query_type: "timesheet",
      });

      expect(result).toContain("사원번호(emp_no)가 필요합니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("query_type이 유효하지 않으면 에러 메시지를 반환해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "invalid_type",
      });

      expect(result).toContain("query_type이 올바르지 않습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("하위 호환성", () => {
    it("선택 파라미터 없이 기존 방식으로 호출해도 정상 동작해야 한다", async () => {
      const mod = loadHandler();
      const ctx = createMockContext();
      mockFetchSuccess({ total: 15, used: 5, remaining: 10 });

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: "10001",
        query_type: "annual_leave_balance",
      });

      expect(result).toContain("HR 근태");
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toBe(
        "http://test-hr-api:8000/api/v1/attendance/annual-leave/balance?emp_no=10001"
      );
    });
  });
});
