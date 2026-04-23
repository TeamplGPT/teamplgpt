/* eslint-env jest, node */

const path = require("path");

function loadHandler(skillName) {
  const handlerPath = path.resolve(
    __dirname,
    `../../../../storage/plugins/agent-skills/${skillName}/handler.js`
  );
  delete require.cache[handlerPath];
  return require(handlerPath);
}

function createContext(baseUrl) {
  return {
    runtimeArgs: { HR_API_BASE_URL: baseUrl },
    introspect: jest.fn(),
    logger: jest.fn(),
  };
}

function mockJsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ success: true, data }),
  };
}

describe("HR API mock integration", () => {
  const originalFetch = global.fetch;
  const baseUrl = "http://mock-hr-api";

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("hr-personnel이 mock fetch로 요청을 보내고 결과를 포맷한다", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockJsonResponse([{ school: "서울대", major: "컴공" }]));

    const mod = loadHandler("hr-personnel");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      emp_no: "12345",
      query_type: "education",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/personnel/education?emp_no=12345`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain("HR 인사기록 - 학력사항");
    expect(result).toContain("서울대");
  });

  it("hr-attendance가 year_month를 포함해 mock fetch를 호출한다", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockJsonResponse([{ work_date: "20250301", start_time: "0900" }])
      );

    const mod = loadHandler("hr-attendance");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      emp_no: "12345",
      query_type: "timesheet",
      year_month: "202503",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/attendance/timesheet?emp_no=12345&year_month=202503`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain("HR 근태 - 출퇴근 기록");
    expect(result).toContain("20250301");
  });

  it("hr-salary가 compare 파라미터를 mock fetch까지 전달한다", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockJsonResponse([
          { current_month: "202503", previous_month: "202502" },
        ])
      );

    const mod = loadHandler("hr-salary");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      emp_no: "12345",
      query_type: "compare",
      current_month: "202503",
      previous_month: "202502",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/salary/compare?emp_no=12345&current_month=202503&previous_month=202502`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain("HR 급여 - 월별 급여 비교");
    expect(result).toContain("202503");
  });

  it("hr-year-end-tax가 cal_yy를 mock fetch까지 전달한다", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockJsonResponse([{ deduction_total: 1000000 }]));

    const mod = loadHandler("hr-year-end-tax");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      emp_no: "12345",
      query_type: "summary",
      cal_yy: "2024",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/year-end-tax/summary?emp_no=12345&cal_yy=2024`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain("HR 연말정산 - 연말정산 공제 요약");
    expect(result).toContain("1,000,000");
  });
});
