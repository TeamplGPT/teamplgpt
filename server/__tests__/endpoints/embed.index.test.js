/* eslint-env jest, node */

jest.mock("../../utils/http", () => ({
  reqBody: jest.fn(),
  multiUserMode: jest.fn(),
}));

jest.mock("../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

jest.mock("../../utils/chats/embed", () => ({
  streamChatWithForEmbed: jest.fn(),
}));

jest.mock("../../models/embedChats", () => ({
  EmbedChats: {
    forEmbedByUser: jest.fn(),
    markHistoryInvalid: jest.fn(),
  },
}));

jest.mock("../../utils/middleware/embedMiddleware", () => ({
  validEmbedConfig: jest.fn(),
  canRespond: jest.fn(),
  setConnectionMeta: jest.fn(),
}));

jest.mock("../../utils/helpers/chat/responses", () => ({
  convertToChatHistory: jest.fn(),
  writeResponseChunk: jest.fn(),
}));

const {
  parseToolRuntimeOverrideHeaders,
} = require("../../endpoints/embed/index");

describe("parseToolRuntimeOverrideHeaders", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGate = process.env.ALLOW_TOOL_RUNTIME_OVERRIDE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_TOOL_RUNTIME_OVERRIDE = originalGate;
  });

  it("development 환경에서는 헤더를 upper-case runtime override로 파싱한다", () => {
    process.env.NODE_ENV = "development";

    const overrides = parseToolRuntimeOverrideHeaders({
      headers: {
        "x-tool-runtime-override-hr_api_base_url": "http://localhost:8001",
      },
    });

    expect(overrides).toEqual({
      HR_API_BASE_URL: "http://localhost:8001",
    });
  });

  it("production이어도 gate env=true면 파싱을 허용한다", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TOOL_RUNTIME_OVERRIDE = "true";

    const overrides = parseToolRuntimeOverrideHeaders({
      headers: {
        "X-Tool-Runtime-Override-extra_flag": "dev",
      },
    });

    expect(overrides).toEqual({
      EXTRA_FLAG: "dev",
    });
  });

  it("배열 헤더는 첫 번째 값만 사용하고 빈 값은 무시한다", () => {
    process.env.NODE_ENV = "development";

    const overrides = parseToolRuntimeOverrideHeaders({
      headers: {
        "x-tool-runtime-override-hr_api_base_url": [
          "http://localhost:8001",
          "http://localhost:8002",
        ],
        "x-tool-runtime-override-empty": "",
      },
    });

    expect(overrides).toEqual({
      HR_API_BASE_URL: "http://localhost:8001",
    });
  });

  it("gate가 닫혀 있으면 null을 반환한다", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_TOOL_RUNTIME_OVERRIDE;

    const overrides = parseToolRuntimeOverrideHeaders({
      headers: {
        "x-tool-runtime-override-hr_api_base_url": "http://localhost:8001",
      },
    });

    expect(overrides).toBeNull();
  });

  it("유효한 override 헤더가 하나도 없으면 null을 반환한다", () => {
    process.env.NODE_ENV = "development";

    const overrides = parseToolRuntimeOverrideHeaders({
      headers: {
        "content-type": "application/json",
        "x-tool-runtime-override-": "ignored",
      },
    });

    expect(overrides).toBeNull();
  });
});
