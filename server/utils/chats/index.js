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
 * Shares the common block with `ai-provider.js::hrSkillPeriodGuard()` (@agent/aibitat path)
 * via `utils/hrSkillGuard.js` — chat path appends the [HR_TABLE_OUTPUT] rules on top.
 * but applies to chat/query mode's systemPrompt. Injects HR-specific instructions
 * to override workspace-level "ambiguity check → ask back" rules that would otherwise
 * prevent tool-calls when user speech lacks scope (department / period) but has the
 * domain key (e.g., region name for hr-personnel-search).
 *
 * Trigger: at least one active plugin name starts with `@@hr-` (or, when
 * `allowedToolNames` is given, at least one allowed tool name starts with `hr-`).
 *
 * @param {string[]} [allowedToolNames] embed 대화 단위 허용 도구 목록 — 주어지면
 *   워크스페이스 전역 대신 이 목록 기준으로 판단한다(임베드에서 HR skill이 전부
 *   차단됐는데도 tool_call 지시가 들어가 내부 형식이 노출되던 문제 방지).
 * @returns {string|null} guard text to append, or null if no HR skill active.
 */
function hrSkillChatGuard(allowedToolNames) {
  const {
    hrSkillActive,
    hrDateContextLine,
    hrSkillCommonLines,
  } = require("../hrSkillGuard");
  if (!hrSkillActive(allowedToolNames)) return null;
  return [
    hrDateContextLine(),
    ...hrSkillCommonLines(),
    "[HR_TABLE_OUTPUT] HR skill의 tool 응답은 markdown 표(`| col1 | col2 | ... |`) 형식의 조회 데이터이며, 그대로 출력하라는 지시가 아닙니다. 표 하단 [응답 지침]의 3분기를 따르세요: 특정 값·특정 일자를 묻는 질문은 해당 값/행만 발췌해 답변, 내역·현황을 묻는 질문은 관련 행·열만 추린 표로 제시, 사용자가 전체/상세/표 전체를 명시 요청한 경우에만 전체 표 출력. 표·행을 제시할 때 셀 값은 paraphrase·수정하지 말고 원본 그대로 사용하세요. '위 표에서 확인하실 수 있습니다', '다음 항목을 기준으로 확인할 수 있습니다' 같은 표현으로 데이터 제시를 대체하지 마세요. workspace 시스템 프롬프트의 '매뉴얼 안내' 톤보다 본 지시가 우선합니다.",
    "[HR_TABLE_OUTPUT_ENRICHMENT] 단, 사용자가 '추가해줘', '같이', '더해줘', '붙여줘' 등으로 결과 표에 컬럼 추가 또는 메타데이터 보강을 명시적으로 요청한 경우(예: '주소 추가해줘', '전공 영문명도 같이', '연락처 컬럼 더해줘'), 원본 표의 모든 행과 기존 컬럼 헤더·셀 값은 절대 변경하지 말고, 신규 컬럼만 표 우측에 추가하세요. 신규 컬럼 값은 자체 지식 또는 web_search_preview tool 결과로 즉시 채우고, 어느 데이터를 채울지 사용자에게 되묻지 마세요. 검색 결과가 모호하거나 확신이 없으면 해당 셀에 'N/A' 또는 '미확인'을 표기하세요. 원본 셀 값은 절대 수정·요약·paraphrase하지 마세요. 본 enrichment 트리거가 없는 발화에서는 [HR_TABLE_OUTPUT] 원칙(질문 유형 적응 답변, 셀 값 원본 유지) 그대로 적용됩니다.",
  ].join("\n");
}

/**
 * Returns the base prompt for the chat. This method will also do variable
 * substitution on the prompt if there are any defined variables in the prompt.
 * When HR skills are active, appends `hrSkillChatGuard()` (L2 layer).
 * @param {Object|null} workspace - the workspace object
 * @param {Object|null} user - the user object
 * @param {string[]} [allowedToolNames] - embed 대화 단위 허용 도구 목록(있으면 전달)
 * @returns {Promise<string>} - the base prompt (+ optional HR guard)
 */
async function chatPrompt(workspace, user = null, allowedToolNames) {
  const { SystemSettings } = require("../../models/systemSettings");
  const basePrompt =
    workspace?.openAiPrompt ?? SystemSettings.saneDefaultSystemPrompt;
  const expanded = await SystemPromptVariables.expandSystemPromptVariables(
    basePrompt,
    user?.id,
    workspace?.id
  );
  const hrGuard = hrSkillChatGuard(allowedToolNames);
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
  hrSkillChatGuard,
  grepCommand,
  grepAllSlashCommands,
  VALID_COMMANDS,
};
