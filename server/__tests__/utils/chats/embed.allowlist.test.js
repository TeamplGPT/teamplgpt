/* eslint-env jest, node */

jest.mock("../../../utils/helpers/chat/responses", () => ({
  convertToPromptHistory: jest.fn(),
  writeResponseChunk: jest.fn(),
}));

jest.mock("../../../utils/helpers", () => ({
  getLLMProvider: jest.fn(),
  getVectorDbClass: jest.fn(),
}));

jest.mock("../../../utils/chats/index", () => ({
  chatPrompt: jest.fn(),
  sourceIdentifier: jest.fn(),
}));

jest.mock("../../../models/embedChats", () => ({
  EmbedChats: {
    forEmbedByUser: jest.fn(),
    new: jest.fn(),
  },
}));

jest.mock("../../../utils/DocumentManager", () => ({
  DocumentManager: jest.fn(),
}));

jest.mock("../../../utils/chats/toolCalling/manager", () => ({
  ChatToolsManager: { getToolDefinitions: jest.fn() },
}));

jest.mock("../../../utils/chats/toolCalling/loop", () => ({
  toolCallingLoop: jest.fn(),
}));

jest.mock("../../../utils/vectorSearch/mergeSharedResults", () => ({
  performMergedSearch: jest.fn(),
}));

jest.mock("../../../utils/vectorSearch/searchModeHelpers", () => ({
  shouldUseHybridSearch: jest.fn(),
  shouldUseRerank: jest.fn(),
}));

jest.mock("../../../models/workspace", () => ({
  Workspace: { getShared: jest.fn() },
}));

const {
  applyAllowedHashes,
  buildEmbedSystemPrompt,
  extractAllowedToolNames,
  extractToolName,
  shouldForceToolChoice,
} = require("../../../utils/chats/embed");

describe("embed allowlist helpers", () => {
  const openAiTools = [
    { name: "hr-attendance" },
    { name: "hr-salary" },
    { name: "hr-personnel" },
  ];

  it("raw=null이면 필터 없이 전체 tools를 반환한다", () => {
    expect(applyAllowedHashes(openAiTools, null, "openai-responses")).toBe(
      openAiTools
    );
  });

  it("raw=''이면 빈 허용 목록으로 빈 배열을 반환한다", () => {
    expect(applyAllowedHashes(openAiTools, "", "openai-responses")).toEqual([]);
  });

  it("CSV는 trim 후 허용된 tool만 남긴다", () => {
    expect(
      applyAllowedHashes(
        openAiTools,
        " hr-salary , hr-personnel ",
        "openai-responses"
      )
    ).toEqual([{ name: "hr-salary" }, { name: "hr-personnel" }]);
  });

  it("chat-completions 형식에서는 function.name을 기준으로 필터링한다", () => {
    const tools = [
      { function: { name: "hr-attendance" } },
      { function: { name: "hr-salary" } },
    ];
    expect(
      applyAllowedHashes(tools, "hr-attendance", "chat-completions")
    ).toEqual([{ function: { name: "hr-attendance" } }]);
  });

  it("알 수 없는 format에서는 이름을 추출하지 못해 결과가 비어진다", () => {
    expect(
      applyAllowedHashes(openAiTools, "hr-attendance", "unknown-format")
    ).toEqual([]);
    expect(extractToolName(openAiTools[0], "unknown-format")).toBeNull();
  });

  it("extractAllowedToolNames는 필터된 tool 이름 목록만 반환한다", () => {
    expect(
      extractAllowedToolNames(
        openAiTools,
        "hr-salary,hr-personnel",
        "openai-responses"
      )
    ).toEqual(["hr-salary", "hr-personnel"]);
  });

  it("전체 허용(null)이면 tool_choice 강제를 유지하고 subset이면 해제한다", () => {
    expect(shouldForceToolChoice(null)).toBe(true);
    expect(shouldForceToolChoice(undefined)).toBe(true);
    expect(shouldForceToolChoice("hr-attendance")).toBe(false);
    expect(shouldForceToolChoice("")).toBe(false);
  });

  it("buildEmbedSystemPrompt는 허용 tool 경계를 시스템 프롬프트에 추가한다", () => {
    const out = buildEmbedSystemPrompt("base prompt", [
      "hr-attendance",
      "hr-salary",
    ]);
    expect(out).toContain("base prompt");
    expect(out).toContain("Only these tools are available: hr-attendance, hr-salary");
    expect(out).toContain("do not call a tool");
  });
});
