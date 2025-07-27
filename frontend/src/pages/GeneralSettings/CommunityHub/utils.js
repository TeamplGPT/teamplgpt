/**
 * Convert a type to a readable string for the community hub.
 * @param {("agentSkills" | "agentSkill" | "systemPrompts" | "systemPrompt" | "slashCommands" | "slashCommand" | "agentFlows" | "agentFlow")} type
 * @returns {string}
 */
export function readableType(type) {
  switch (type) {
    case "agentSkills":
    case "agentSkill":
      return "community_hub.trending.agent-skills";
    case "systemPrompt":
    case "systemPrompts":
      return "community_hub.trending.system-prompts";
    case "slashCommand":
    case "slashCommands":
      return "community_hub.trending.slash-commands";
    case "agentFlows":
    case "agentFlow":
      return "community_hub.trending.agent-flows";
  }
}

/**
 * Convert a type to a path for the community hub.
 * @param {("agentSkill" | "agentSkills" | "systemPrompt" | "systemPrompts" | "slashCommand" | "slashCommands" | "agentFlow" | "agentFlows")} type
 * @returns {string}
 */
export function typeToPath(type) {
  switch (type) {
    case "agentSkill":
    case "agentSkills":
      return "agent-skills";
    case "systemPrompt":
    case "systemPrompts":
      return "system-prompts";
    case "slashCommand":
    case "slashCommands":
      return "slash-commands";
    case "agentFlow":
    case "agentFlows":
      return "agent-flows";
  }
}
