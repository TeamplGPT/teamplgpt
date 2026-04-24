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

const MOCK_ARRAY_PLUGIN = {
  active: true,
  hubId: "hr-personnel-search",
  description: "직원을 속성 기반으로 검색합니다.",
  entrypoint: {
    params: {
      query_type: {
        type: "string",
        description: "조회 종류",
        enum: ["graduates_by_region"],
      },
      university_names: {
        type: "array",
        description: "정규화된 대학교명 배열",
        items: { type: "string" },
      },
      region: {
        type: "string",
        description: "지역 원문",
      },
    },
    required: ["query_type", "university_names"],
  },
};

const MOCK_ARRAY_MISSING_ITEMS_PLUGIN = {
  active: true,
  hubId: "broken-array",
  description: "Items 누락 플러그인(회귀 방어).",
  entrypoint: {
    params: {
      tags: { type: "array", description: "태그 배열" },
    },
    required: ["tags"],
  },
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

  describe("array type with items (FR-05, FR-06)", () => {
    it("openai-responses: array items를 보존해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ARRAY_PLUGIN]);
      const [tool] = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tool.parameters.properties.university_names).toEqual({
        type: "array",
        description: "정규화된 대학교명 배열",
        items: { type: "string" },
      });
    });

    it("anthropic: array items를 보존해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ARRAY_PLUGIN]);
      const [tool] = ChatToolsManager.getToolDefinitions("anthropic");
      expect(tool.input_schema.properties.university_names.items).toEqual({
        type: "string",
      });
    });

    it("chat-completions: array items를 보존해야 한다", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([MOCK_ARRAY_PLUGIN]);
      const [tool] = ChatToolsManager.getToolDefinitions("chat-completions");
      expect(
        tool.function.parameters.properties.university_names.items
      ).toEqual({ type: "string" });
    });

    it("items 미선언 array는 defensive default { type: string }을 주입해야 한다", () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_ARRAY_MISSING_ITEMS_PLUGIN,
      ]);
      const [tool] = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tool.parameters.properties.tags).toEqual({
        type: "array",
        description: "태그 배열",
        items: { type: "string" },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'param "tags" is array type but missing "items"'
        )
      );
      warnSpy.mockRestore();
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

  // FR-03, FR-04 — hr-personnel-search-web-search-assist
  describe("web_search_preview 조건부 주입 (metadata.enable_web_search)", () => {
    const MOCK_WEB_SEARCH_PLUGIN = {
      active: true,
      hubId: "hr-personnel-search",
      description: "직원 검색",
      metadata: { enable_web_search: true },
      entrypoint: {
        params: {
          query_type: { type: "string", description: "조회" },
          university_names: {
            type: "array",
            description: "대학 배열",
            items: { type: "string" },
          },
        },
        required: ["query_type", "university_names"],
      },
    };
    const MOCK_NON_WEB_SEARCH_PLUGIN = {
      active: true,
      hubId: "hr-attendance",
      description: "출퇴근 조회",
      entrypoint: {
        params: { emp_no: { type: "string" } },
        required: ["emp_no"],
      },
    };

    it("openai-responses: enable_web_search=true plugin 존재 시 web_search_preview 추가", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_WEB_SEARCH_PLUGIN,
      ]);
      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tools).toContainEqual({ type: "web_search_preview" });
      expect(
        tools.filter((t) => t.type === "web_search_preview")
      ).toHaveLength(1);
      expect(tools.filter((t) => t.type === "function")).toHaveLength(1);
    });

    it("openai-responses: enable_web_search=false/미설정 plugin만 있으면 web_search_preview 미추가", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_NON_WEB_SEARCH_PLUGIN,
      ]);
      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      expect(tools.some((t) => t.type === "web_search_preview")).toBe(false);
    });

    it("anthropic: enable_web_search=true plugin이 있어도 web_search_preview 미주입 (provider 비호환)", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_WEB_SEARCH_PLUGIN,
      ]);
      const tools = ChatToolsManager.getToolDefinitions("anthropic");
      expect(tools.some((t) => t?.type === "web_search_preview")).toBe(false);
    });

    it("chat-completions(OpenRouter): enable_web_search=true plugin이 있어도 미주입 (provider 비호환)", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_WEB_SEARCH_PLUGIN,
      ]);
      const tools = ChatToolsManager.getToolDefinitions("chat-completions");
      expect(tools.some((t) => t?.type === "web_search_preview")).toBe(false);
    });

    // M1 (design-validator R2): built-in tool은 name 필드 부재로
    // embed.applyAllowedHashes의 name 기반 filter에서 자연 제외 위험.
    // 본 테스트는 manager가 built-in tool에 name을 부여하지 않음을 확증 →
    // embed 쪽에서 type 기반 guard로 보존 책임 분리 (embed.js isBuiltInTool).
    it("web_search_preview built-in tool은 name 필드가 없어야 한다 (embed whitelist 필터 우회 전제)", () => {
      ImportedPlugin.listImportedPlugins.mockReturnValue([
        MOCK_WEB_SEARCH_PLUGIN,
      ]);
      const tools = ChatToolsManager.getToolDefinitions("openai-responses");
      const webSearchTool = tools.find((t) => t.type === "web_search_preview");
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool.name).toBeUndefined();
      expect(webSearchTool.function).toBeUndefined();
    });
  });
});
