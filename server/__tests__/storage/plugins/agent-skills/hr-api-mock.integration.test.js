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

  it("hr-personnel-search가 POST + JSON body로 university_names/region을 전달한다", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              emp_no: "10234",
              name: "홍길동",
              graduated_university: "경북대학교",
              degree: "학사",
            },
          ],
          total: 1,
        },
      }),
    });

    const mod = loadHandler("hr-personnel-search");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      query_type: "graduates_by_region",
      university_names: ["경북대학교", "부산대학교", "동아대학교"],
      region: "경상도",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/personnel/search/graduates`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.university_names).toEqual([
      "경북대학교",
      "부산대학교",
      "동아대학교",
    ]);
    expect(body.region).toBe("경상도");

    expect(result).toContain("HR 지역-대학-졸업자 검색 - 경상도");
    expect(result).toContain("홍길동");
    expect(result).toContain("경북대학교");
  });

  it("hr-personnel-search가 빈 결과 응답을 '결과 없음' 메시지로 처리한다", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest
        .fn()
        .mockResolvedValue({ success: true, data: [], message: "no matches" }),
    });

    const mod = loadHandler("hr-personnel-search");
    const result = await mod.runtime.handler.call(createContext(baseUrl), {
      query_type: "graduates_by_region",
      university_names: ["제주대학교"],
      region: "제주도",
    });

    expect(result).toContain("결과가 존재하지 않습니다");
    expect(result).toContain("제주도");
  });
});
