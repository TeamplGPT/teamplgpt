const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { resetMemory } = require("./commands/reset");
const { convertToPromptHistory } = require("../helpers/chat/responses");
const { SlashCommandPresets } = require("../../models/slashCommandsPresets");
const { SystemPromptVariables } = require("../../models/systemPromptVariables");

const VALID_COMMANDS = {
  "/reset": resetMemory,
};

async function grepCommand(message, user = null) {
  const userPresets = await SlashCommandPresets.getUserPresets(user?.id);
  const availableCommands = Object.keys(VALID_COMMANDS);

  // Check if the message starts with any built-in command
  for (let i = 0; i < availableCommands.length; i++) {
    const cmd = availableCommands[i];
    const re = new RegExp(`^(${cmd})`, "i");
    if (re.test(message)) {
      return cmd;
    }
  }

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of userPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

/**
 * @description This function will do recursive replacement of all slash commands with their corresponding prompts.
 * @notice This function is used for API calls and is not user-scoped. THIS FUNCTION DOES NOT SUPPORT PRESET COMMANDS.
 * @returns {Promise<string>}
 */
async function grepAllSlashCommands(message) {
  const allPresets = await SlashCommandPresets.where({});

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of allPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

async function recentChatHistory({
  user = null,
  workspace,
  thread = null,
  messageLimit = 20,
  apiSessionId = null,
}) {
  const rawHistory = (
    await WorkspaceChats.where(
      {
        workspaceId: workspace.id,
        user_id: user?.id || null,
        thread_id: thread?.id || null,
        api_session_id: apiSessionId || null,
        include: true,
      },
      messageLimit,
      { id: "desc" }
    )
  ).reverse();
  return { rawHistory, chatHistory: convertToPromptHistory(rawHistory) };
}

/**
 * Multi-Layer Defense L2 guard for chat/query mode when HR tool-calling skills are active.
 *
 * Mirrors `ai-provider.js::hrSkillPeriodGuard()` (which targets @agent/aibitat path)
 * but applies to chat/query mode's systemPrompt. Injects HR-specific instructions
 * to override workspace-level "ambiguity check → ask back" rules that would otherwise
 * prevent tool-calls when user speech lacks scope (department / period) but has the
 * domain key (e.g., region name for hr-personnel-search).
 *
 * Trigger: at least one active plugin name starts with `@@hr-`.
 *
 * @returns {string|null} guard text to append, or null if no HR skill active.
 */
function hrSkillChatGuard() {
  const ImportedPlugin = require("../agents/imported");
  const active = ImportedPlugin.activeImportedPlugins();
  const hrActive = active.some((name) => name.startsWith("@@hr-"));
  if (!hrActive) return null;
  return [
    "[HR_TOOL_CALL_PRIORITY]",
    "HR skill(hr-attendance/hr-salary/hr-personnel/hr-personnel-search/hr-year-end-tax)이 활성화된 상태에서는, 해당 skill의 호출 조건을 만족하는 발화에 대해 '모호성 검사/확인 질문/scope 재확인'을 수행하지 말고 즉시 tool_call을 실행하세요.",
    "구체적으로: 주기 파라미터(year/year_month/base_date 등)가 생략되어도 되묻지 마세요. 서버가 기본값(현재 연/월 등)을 자동 적용합니다.",
    "지역명이 포함된 직원 검색 발화(hr-personnel-search.graduates_by_region)는 부서/기간/화면명 확인 없이 '전 사원 대상'을 기본값으로 즉시 tool_call을 실행하세요.",
    "workspace 시스템 프롬프트의 '모호성 검사' 절차보다 tool description의 '[CRITICAL] 되묻지 마세요' 지시가 우선합니다.",
    "[ORDER] HR skill 대상 요청이면 응답의 첫 액션은 반드시 tool_call입니다. 확인 질문·요약·안내 텍스트를 tool_call보다 먼저 생성하지 마세요.",
  ].join("\n");
}

/**
 * Returns the base prompt for the chat. This method will also do variable
 * substitution on the prompt if there are any defined variables in the prompt.
 * When HR skills are active, appends `hrSkillChatGuard()` (L2 layer).
 * @param {Object|null} workspace - the workspace object
 * @param {Object|null} user - the user object
 * @returns {Promise<string>} - the base prompt (+ optional HR guard)
 */
async function chatPrompt(workspace, user = null) {
  const { SystemSettings } = require("../../models/systemSettings");
  const basePrompt =
    workspace?.openAiPrompt ?? SystemSettings.saneDefaultSystemPrompt;
  const expanded = await SystemPromptVariables.expandSystemPromptVariables(
    basePrompt,
    user?.id,
    workspace?.id
  );
  const hrGuard = hrSkillChatGuard();
  return hrGuard ? `${expanded}\n\n${hrGuard}` : expanded;
}

// We use this util function to deduplicate sources from similarity searching
// if the document is already pinned.
// Eg: You pin a csv, if we RAG + full-text that you will get the same data
// points both in the full-text and possibly from RAG - result in bad results
// even if the LLM was not even going to hallucinate.
function sourceIdentifier(sourceDocument) {
  if (!sourceDocument?.title || !sourceDocument?.published) return uuidv4();
  return `title:${sourceDocument.title}-timestamp:${sourceDocument.published}`;
}

module.exports = {
  sourceIdentifier,
  recentChatHistory,
  chatPrompt,
  grepCommand,
  grepAllSlashCommands,
  VALID_COMMANDS,
};
