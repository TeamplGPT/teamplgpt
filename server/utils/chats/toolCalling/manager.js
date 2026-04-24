const ImportedPlugin = require("../../agents/imported");

/**
 * ChatToolsManager — active agent skill을 LLM provider별 tool 스키마로 변환.
 *
 * plugin.json의 entrypoint 정보를 OpenAI Responses API, Anthropic Messages API,
 * Chat Completions API (OpenRouter 등) 형식으로 변환하여 반환한다.
 */
class ChatToolsManager {
  /**
   * Get active imported plugins as tool definitions for the given provider format.
   * @param {"openai-responses"|"anthropic"|"chat-completions"} providerFormat
   * @returns {Array} provider별 tool 스키마 배열 (빈 배열이면 tool 없음)
   */
  static getToolDefinitions(providerFormat) {
    const plugins = ImportedPlugin.listImportedPlugins().filter(
      (p) => p.active
    );
    if (plugins.length === 0) return [];

    const converters = {
      "openai-responses": this.#toOpenAiResponsesTool,
      anthropic: this.#toAnthropicTool,
      "chat-completions": this.#toChatCompletionsTool,
    };
    const convert = converters[providerFormat];
    if (!convert) {
      console.warn(
        `[ChatToolsManager] Unknown provider format: ${providerFormat}`
      );
      return [];
    }

    const tools = [];
    for (const pluginConfig of plugins) {
      try {
        tools.push(convert(pluginConfig));
      } catch (err) {
        console.error(
          `[ChatToolsManager] Failed to convert plugin "${pluginConfig.hubId}":`,
          err.message
        );
      }
    }

    // OpenAI Responses API built-in tool 자동 주입.
    // active plugin 중 metadata.enable_web_search === true가 1개라도 있으면
    // web_search_preview를 추가해 LLM이 자체 지식 보강이 필요할 때 자율 호출하도록 함.
    // Anthropic/chat-completions는 해당 built-in tool을 인식하지 못하므로 주입 금지.
    if (providerFormat === "openai-responses") {
      const needsWebSearch = plugins.some(
        (p) => p?.metadata?.enable_web_search === true
      );
      if (needsWebSearch) {
        tools.push({ type: "web_search_preview" });
      }
    }

    return tools;
  }

  /**
   * Build JSON Schema properties from plugin entrypoint params.
   * @param {object} pluginConfig
   * @returns {{ properties: object, required: string[] }}
   */
  static #buildSchema(pluginConfig) {
    const params = pluginConfig.entrypoint?.params ?? {};
    const properties = {};
    for (const [key, def] of Object.entries(params)) {
      const prop = { type: def.type || "string" };
      if (def.description) prop.description = def.description;
      if (def.enum) prop.enum = def.enum;

      if (prop.type === "array") {
        if (def.items) {
          prop.items = def.items;
        } else {
          console.warn(
            `[ChatToolsManager] Plugin "${pluginConfig.hubId}" param "${key}" ` +
              `is array type but missing "items". Falling back to { type: "string" }.`
          );
          prop.items = { type: "string" };
        }
      }

      if (prop.type === "object" && def.properties) {
        prop.properties = def.properties;
        if (def.required) prop.required = def.required;
      }

      if (def.default !== undefined) prop.default = def.default;
      if (typeof def.minItems === "number") prop.minItems = def.minItems;
      if (typeof def.maxItems === "number") prop.maxItems = def.maxItems;

      properties[key] = prop;
    }
    return {
      properties,
      required: pluginConfig.entrypoint?.required ?? [],
    };
  }

  /**
   * plugin.json → OpenAI Responses API tool format.
   * @param {object} pluginConfig
   * @returns {object}
   */
  static #toOpenAiResponsesTool(pluginConfig) {
    const { properties, required } = ChatToolsManager.#buildSchema(pluginConfig);
    return {
      type: "function",
      name: pluginConfig.hubId,
      description: pluginConfig.description || "",
      parameters: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
      strict: false,
    };
  }

  /**
   * plugin.json → Anthropic Messages API tool format.
   * @param {object} pluginConfig
   * @returns {object}
   */
  static #toAnthropicTool(pluginConfig) {
    const { properties, required } = ChatToolsManager.#buildSchema(pluginConfig);
    return {
      name: pluginConfig.hubId,
      description: pluginConfig.description || "",
      input_schema: {
        type: "object",
        properties,
        required,
      },
    };
  }

  /**
   * plugin.json → OpenAI Chat Completions API tool format (OpenRouter 등).
   * @param {object} pluginConfig
   * @returns {object}
   */
  static #toChatCompletionsTool(pluginConfig) {
    const { properties, required } = ChatToolsManager.#buildSchema(pluginConfig);
    return {
      type: "function",
      function: {
        name: pluginConfig.hubId,
        description: pluginConfig.description || "",
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
  }
}

module.exports = { ChatToolsManager };
