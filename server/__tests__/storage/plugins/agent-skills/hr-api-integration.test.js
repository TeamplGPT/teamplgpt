/**
 * HR API 통합테스트
 *
 * 실제 HR API (localhost:8000)에 대한 end-to-end 검증.
 * API 미실행 시 자동 스킵.
 *
 * 테스트 범위:
 * - 선택 파라미터 포함/미포함 호출 시 API 정상 응답
 * - 무효 선택 파라미터가 API 에러를 유발하지 않는지
 * - handler를 통한 전체 플로우 (fetch → unwrap → format)
 */

const path = require("path");

const HR_API_BASE_URL = process.env.HR_API_BASE_URL || "http://localhost:8000";
const TEST_EMP_NO = process.env.HR_TEST_EMP_NO || "20120154";

// API 접근 가능 여부 (beforeAll에서 설정)
let apiAvailable = false;
let skipReason = "";

beforeAll(async () => {
  if (!TEST_EMP_NO) {
    skipReason = "HR_TEST_EMP_NO 환경변수 미설정";
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${HR_API_BASE_URL}/openapi.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    apiAvailable = res.ok;
    if (!apiAvailable) skipReason = `API responded with ${res.status}`;
  } catch (e) {
    skipReason = `API not reachable: ${e.message}`;
  }
});

// 각 테스트에서 사용할 스킵 헬퍼
function skipIfNoApi() {
  if (!apiAvailable) {
    return true;
  }
  return false;
}

function loadHandler(skillName) {
  const handlerPath = path.resolve(
    __dirname,
    `../../../../storage/plugins/agent-skills/${skillName}/handler.js`
  );
  delete require.cache[handlerPath];
  return require(handlerPath);
}

function createContext() {
  return {
    runtimeArgs: { HR_API_BASE_URL },
    introspect: jest.fn(),
    logger: jest.fn(),
  };
}

describe("HR API 통합테스트", () => {
  // ─── hr-year-end-tax ───────────────────────────────

  describe("hr-year-end-tax", () => {
    it("cal_yy 없이 summary를 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-year-end-tax");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "summary",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("cal_yy=2024로 result를 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-year-end-tax");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "result",
        cal_yy: "2024",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });
  });

  // ─── hr-salary ─────────────────────────────────────

  describe("hr-salary", () => {
    it("year_month 없이 payslip을 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-salary");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "payslip",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("year_month=202501로 payslip을 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-salary");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "payslip",
        year_month: "202501",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("compare에 current_month/previous_month를 전달할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-salary");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "compare",
        current_month: "202503",
        previous_month: "202502",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("annual_total에 year를 전달할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-salary");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "annual_total",
        year: "2025",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("account에 무효 파라미터를 전달해도 에러가 발생하지 않아야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-salary");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "account",
        year_month: "202503",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });
  });

  // ─── hr-attendance ─────────────────────────────────

  describe("hr-attendance", () => {
    it("year 없이 annual_leave_balance를 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "annual_leave_balance",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("year=2025로 annual_leave_balance를 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "annual_leave_balance",
        year: "2025",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("year_month로 timesheet을 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "timesheet",
        year_month: "202503",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("leave_requests에 months와 status를 전달할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "leave_requests",
        months: 3,
        status: "30",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("business_trips에 limit을 전달할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "business_trips",
        limit: 5,
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("work_plan_weekly에 base_date 자연어를 전달할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "work_plan_weekly",
        base_date: "어제",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });

    it("work_type에 무효 파라미터를 전달해도 에러가 발생하지 않아야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-attendance");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "work_type",
        year: "2025",
        limit: 10,
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });
  });

  // ─── hr-personnel (변경 없음 확인) ─────────────────

  describe("hr-personnel (기존 동작 확인)", () => {
    it("선택 파라미터 없이 employment를 조회할 수 있어야 한다", async () => {
      if (skipIfNoApi()) return;
      const mod = loadHandler("hr-personnel");
      const ctx = createContext();

      const result = await mod.runtime.handler.call(ctx, {
        emp_no: TEST_EMP_NO,
        query_type: "employment",
      });

      expect(result).not.toContain("HR API 호출 실패");
      expect(result).not.toContain("오류가 발생했습니다");
    });
  });
});

// 상태 리포트 (항상 실행)
describe("HR API 통합테스트 상태", () => {
  it("API 접근 상태를 확인한다", () => {
    if (!apiAvailable) {
      console.log(`\n⏭️  HR API 통합테스트 스킵: ${skipReason}`);
      console.log("   실행 방법: HR_API_BASE_URL=http://localhost:8000 HR_TEST_EMP_NO=사번 npx jest hr-api-integration\n");
    } else {
      console.log(`\n✅ HR API 통합테스트 실행 완료: ${HR_API_BASE_URL} (사번: ${TEST_EMP_NO})\n`);
    }
    expect(true).toBe(true);
  });
});
