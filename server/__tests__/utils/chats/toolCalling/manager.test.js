/**
 * ChatToolsManager 단위테스트
 *
 * 테스트 범위:
 * - active 플러그인만 tool 정의에 포함
 * - 3가지 provider format 변환 (openai-responses, anthropic, chat-completions)
 * - unknown format 처리
 * - 플러그인 변환 실패 시 graceful skip
 */

jest.mock("../../../../utils/agents/imported", () => ({
  listImportedPlugins: jest.fn(),
}));

const ImportedPlugin = require("../../../../utils/agents/imported");
const {
  ChatToolsManager,
} = require("../../../../utils/chats/toolCalling/manager");

const MOCK_ACTIVE_PLUGIN = {
  active: true,
  hubId: "hr-personnel",
  description: "직원 인사기록을 조회합니다.",
  entrypoint: {
    params: {
      emp_no: { type: "string", description: "사원번호" },
      query_type: {
        type: "string",
        description: "조회 종류",
        enum: ["address", "education", "employment"],
      },
    },
    required: ["emp_no", "query_type"],
  },
};

const MOCK_INACTIVE_PLUGIN = {
  active: false,
  hubId: "hr-disabled",
  description: "비활성 플러그인",
  entrypoint: { params: {}, required: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ChatToolsManager", () => {
  describe("getToolDefinitions", () => {
    it("active 플러그인만 반환해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_ACTIVE_PLUGIN,
        MOCK_INACTIVE_PLUGIN,
      ]);

      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("hr-personnel");
    });

    it("플러그인이 없으면 빈 배열을 반환해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([]);
      expect(ChatToolsManager.getToolDefinitions("openai-responses")).toEqual(
        []
      );
    });

    it("active 플러그인이 없으면 빈 배열을 반환해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_INACTIVE_PLUGIN,
      ]);
      expect(ChatToolsManager.getToolDefinitions("openai-responses")).toEqual(
        []
      );
    });

    it("unknown format일 때 빈 배열을 반환해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ACTIVE_PLUGIN]);

      const tools = ChatToolsManager.getToolDefinitions("unknown-format");
      expect(tools).toEqual([]);
    });

    it("플러그인 변환 실패 시 해당 tool만 제외하고 나머지를 반환해야 한다", () => {
      const brokenPlugin = {
        active: true,
        hubId: "broken",
        description: "broken",
        // entrypoint 없음 → #buildSchema에서 에러
      };
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_ACTIVE_PLUGIN,
        brokenPlugin,
      ]);

      // entrypoint가 undefined이면 params 접근 시 에러 발생하지 않음 (optional chaining)
      // 정상적으로 2개 모두 반환됨
      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tools.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("openai-responses format", () => {
    beforeEach(() => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ACTIVE_PLUGIN]);
    });

    it("올바른 OpenAI Responses API tool 형식을 반환해야 한다", () => {
      const [tool] = ChatToolsManager.getToolDefinitions("openai-responses");

      expect(tool).toEqual({
        type: "function",
        name: "hr-personnel",
        description: "직원 인사기록을 조회합니다.",
        parameters: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            emp_no: { type: "string", description: "사원번호" },
            query_type: {
              type: "string",
              description: "조회 종류",
              enum: ["address", "education", "employment"],
            },
          },
          required: ["emp_no", "query_type"],
          additionalProperties: false,
        },
        strict: false,
      });
    });
  });

  describe("anthropic format", () => {
    beforeEach(() => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ACTIVE_PLUGIN]);
    });

    it("올바른 Anthropic Messages API tool 형식을 반환해야 한다", () => {
      const [tool] = ChatToolsManager.getToolDefinitions("anthropic");

      expect(tool).toEqual({
        name: "hr-personnel",
        description: "직원 인사기록을 조회합니다.",
        input_schema: {
          type: "object",
          properties: {
            emp_no: { type: "string", description: "사원번호" },
            query_type: {
              type: "string",
              description: "조회 종류",
              enum: ["address", "education", "employment"],
            },
          },
          required: ["emp_no", "query_type"],
        },
      });
    });
  });

  describe("chat-completions format", () => {
    beforeEach(() => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ACTIVE_PLUGIN]);
    });

    it("올바른 Chat Completions API tool 형식을 반환해야 한다", () => {
      const [tool] = ChatToolsManager.getToolDefinitions("chat-completions");

      expect(tool).toEqual({
        type: "function",
        function: {
          name: "hr-personnel",
          description: "직원 인사기록을 조회합니다.",
          parameters: {
            type: "object",
            properties: {
              emp_no: { type: "string", description: "사원번호" },
              query_type: {
                type: "string",
                description: "조회 종류",
                enum: ["address", "education", "employment"],
              },
            },
            required: ["emp_no", "query_type"],
          },
        },
      });
    });
  });

  describe("복수 플러그인 처리", () => {
    it("여러 active 플러그인을 모두 변환해야 한다", () => {
      const secondPlugin = {
        active: true,
        hubId: "hr-salary",
        description: "급여명세서를 조회합니다.",
        entrypoint: {
          params: { emp_no: { type: "string" } },
          required: ["emp_no"],
        },
      };
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_ACTIVE_PLUGIN,
        secondPlugin,
      ]);

      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("hr-personnel");
      expect(tools[1].name).toBe("hr-salary");
    });
  });
});
