jest.mock("../../../utils/middleware/validApiKey", () => ({
  validApiKey: (req, res, next) => next(),
}));
jest.mock("../../../utils/companyDocs/process", () => ({
  purgeCompanyDataByName: jest.fn(),
}));

const {
  purgeCompanyDataByName,
} = require("../../../utils/companyDocs/process");
const {
  apiCompanyDataEndpoints,
} = require("../../../endpoints/api/companyData");

function mockApp() {
  const routes = {};
  return {
    routes,
    post(path, ...handlers) {
      routes[path] = handlers;
    },
  };
}

async function invoke(handlers, { body = {} } = {}) {
  const request = { body };
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  // validApiKey mock already next(); last handler is the route
  const route = handlers[handlers.length - 1];
  await route(request, response);
  return response;
}

describe("POST /v1/company-data/purge", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = mockApp();
    apiCompanyDataEndpoints(app);
  });

  it("companyName이 없으면 400 COMPANY_REQUIRED", async () => {
    purgeCompanyDataByName.mockResolvedValue(null);
    const res = await invoke(app.routes["/v1/company-data/purge"], {
      body: { companyName: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "COMPANY_REQUIRED" });
  });

  it("성공 시 200과 삭제 요약을 반환한다", async () => {
    purgeCompanyDataByName.mockResolvedValue({
      companyName: "오이사공",
      companyDocuments: 2,
      vectorNamespaces: 1,
    });
    const res = await invoke(app.routes["/v1/company-data/purge"], {
      body: { companyName: "오이사공", reason: "contract_expired" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      companyName: "오이사공",
      purged: true,
      details: { companyDocuments: 2, vectorNamespaces: 1 },
    });
  });

  it("처리 실패 시 500 PURGE_FAILED", async () => {
    purgeCompanyDataByName.mockRejectedValue(new Error("boom"));
    const res = await invoke(app.routes["/v1/company-data/purge"], {
      body: { companyName: "오이사공" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: "PURGE_FAILED" });
  });
});
