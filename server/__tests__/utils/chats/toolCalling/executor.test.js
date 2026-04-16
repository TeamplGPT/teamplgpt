/**
 * ToolExecutor 단위테스트
 *
 * 테스트 범위:
 * - 정상 실행: handler 결과 문자열 반환
 * - plugin not found → 에러 문자열
 * - inactive plugin → 에러 문자열
 * - string arguments → JSON.parse 후 전달
 * - handler 에러 → catch 후 에러 문자열 반환
 * - handler가 object 반환 → JSON.stringify
 * - context 바인딩 (runtimeArgs, introspect, logger)
 */

jest.mock("../../../../utils/agents/imported", () => {
  const mockPlugin = {
    config: { active: true },
    parseCallOptions: jest.fn().mockReturnValue({ HR_API_BASE_URL: "http://localhost:8000" }),
    handler: {
      runtime: {
        handler: jest.fn(),
      },
    },
  };
  return {
    loadPluginByHubId: jest.fn().mockReturnValue(mockPlugin),
    _mockPlugin: mockPlugin,
  };
});

const ImportedPlugin = require("../../../../utils/agents/imported");
const { ToolExecutor } = require("../../../../utils/chats/toolCalling/executor");

beforeEach(() => {
  jest.clearAllMocks();
  ImportedPlugin._mockPlugin.config.active = true;
  ImportedPlugin._mockPlugin.handler.runtime.handler.mockReset();
  ImportedPlugin.loadPluginByHubId.mockReturnValue(ImportedPlugin._mockPlugin);
});

describe("ToolExecutor", () => {
  describe("정상 실행", () => {
    it("handler가 문자열을 반환하면 그대로 반환해야 한다", async () => {
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockResolvedValue(
        "> 학력: 서울대학교 컴퓨터공학과"
      );

      const result = await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: { emp_no: "12345", query_type: "education" },
      });

      expect(result).toBe("> 학력: 서울대학교 컴퓨터공학과");
      expect(ImportedPlugin.loadPluginByHubId).toHaveBeenCalledWith(
        "hr-personnel"
      );
    });

    it("handler가 object를 반환하면 JSON.stringify 해야 한다", async () => {
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockResolvedValue({
        name: "홍길동",
        degree: "학사",
      });

      const result = await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: { emp_no: "12345", query_type: "education" },
      });

      expect(JSON.parse(result)).toEqual({ name: "홍길동", degree: "학사" });
    });

    it("string arguments를 JSON.parse하여 handler에 전달해야 한다", async () => {
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockResolvedValue("OK");

      await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: '{"emp_no":"12345","query_type":"education"}',
      });

      const handlerCall =
        ImportedPlugin._mockPlugin.handler.runtime.handler.mock.calls[0];
      expect(handlerCall[0]).toEqual({
        emp_no: "12345",
        query_type: "education",
      });
    });
  });

  describe("context 바인딩", () => {
    it("runtimeArgs가 context에 바인딩되어야 한다", async () => {
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockImplementation(
        async function () {
          return `baseUrl=${this.runtimeArgs.HR_API_BASE_URL}`;
        }
      );

      const result = await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: { emp_no: "12345", query_type: "education" },
      });

      expect(result).toBe("baseUrl=http://localhost:8000");
    });

    it("options.logger가 introspect와 logger에 바인딩되어야 한다", async () => {
      const mockLogger = jest.fn();
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockImplementation(
        async function () {
          this.introspect("test introspect");
          this.logger("test log");
          return "done";
        }
      );

      await ToolExecutor.execute(
        { name: "hr-personnel", arguments: {} },
        { logger: mockLogger }
      );

      expect(mockLogger).toHaveBeenCalledWith("test introspect");
      expect(mockLogger).toHaveBeenCalledWith("test log");
    });
  });

  describe("에러 처리", () => {
    it("plugin not found일 때 에러 문자열을 반환해야 한다", async () => {
      ImportedPlugin.loadPluginByHubId.mockReturnValue(null);

      const result = await ToolExecutor.execute({
        name: "nonexistent",
        arguments: {},
      });

      expect(result).toBe('Error: Tool "nonexistent" not found.');
    });

    it("inactive plugin일 때 에러 문자열을 반환해야 한다", async () => {
      ImportedPlugin._mockPlugin.config.active = false;

      const result = await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: {},
      });

      expect(result).toBe('Error: Tool "hr-personnel" is not active.');
    });

    it("handler 실행 에러 시 에러 문자열을 반환해야 한다", async () => {
      ImportedPlugin._mockPlugin.handler.runtime.handler.mockRejectedValue(
        new Error("API 서버 연결 실패")
      );

      const result = await ToolExecutor.execute({
        name: "hr-personnel",
        arguments: { emp_no: "12345", query_type: "education" },
      });

      expect(result).toContain("Error executing tool");
      expect(result).toContain("API 서버 연결 실패");
    });
  });
});
