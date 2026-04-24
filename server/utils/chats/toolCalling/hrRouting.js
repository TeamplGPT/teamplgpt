"use strict";

const HR_PERSONNEL_SEARCH_TOOL = "hr-personnel-search";

function routeHrToolsForMessage({ tools, providerFormat, message }) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return { tools, toolChoice: null };
  }
  if (!isPersonnelSearchGraduateRegionQuery(message)) {
    return { tools, toolChoice: null };
  }

  const targetTools = tools.filter(
    (tool) => extractToolName(tool, providerFormat) === HR_PERSONNEL_SEARCH_TOOL
  );
  if (targetTools.length === 0) return { tools, toolChoice: null };

  const builtInTools = tools.filter((tool) =>
    isBuiltInTool(tool, providerFormat)
  );
  const routedTools = [...targetTools, ...builtInTools];

  return {
    tools: routedTools,
    toolChoice: providerFormat === "openai-responses" ? "required" : null,
  };
}

function isBuiltInTool(tool, providerFormat) {
  if (providerFormat !== "openai-responses") return false;
  return tool?.type === "web_search_preview";
}

function isPersonnelSearchGraduateRegionQuery(message) {
  if (typeof message !== "string") return false;
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return false;

  const hasUniversity = /(대학|대학교)/.test(text);
  const hasGraduateIntent = /(졸업|출신|나온)/.test(text);
  const hasSearchIntent = /(직원|직원목록|직원 목록|졸업자|목록|검색|조회|알려줘|보여줘)/.test(text);
  const hasRegion =
    /(수도권|경상도|전라도|충청도|강원도|제주도|서울|부산|대구|인천|광주|대전|울산|세종|경기|경북|경남|전북|전남|충북|충남|강원|제주)/.test(text) ||
    /[가-힣]+(?:지역|권|소재)/.test(text);

  return hasUniversity && hasGraduateIntent && hasSearchIntent && hasRegion;
}

function extractToolName(tool, providerFormat) {
  if (!tool || typeof tool !== "object") return null;
  switch (providerFormat) {
    case "openai-responses":
    case "anthropic":
      return tool.name || null;
    case "chat-completions":
      return tool.function?.name || null;
    default:
      return tool.name || tool.function?.name || null;
  }
}

module.exports = {
  routeHrToolsForMessage,
  isPersonnelSearchGraduateRegionQuery,
};
