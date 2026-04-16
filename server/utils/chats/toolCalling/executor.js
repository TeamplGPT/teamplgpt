const ImportedPlugin = require("../../agents/imported");

/**
 * ToolExecutor — LLM tool_call을 받아 plugin handler를 실행하고 결과를 반환.
 *
 * handler.js의 runtime.handler는 `this` 컨텍스트로
 * runtimeArgs, introspect, logger를 기대하므로 이를 바인딩하여 실행한다.
 */
class ToolExecutor {
  /**
   * Execute a tool call by loading the plugin handler and running it.
   * @param {object} toolCall - { name: string, arguments: object }
   * @param {object} options
   * @param {Function} [options.logger] - 로그/introspect 출력 함수
   * @returns {Promise<string>} 실행 결과 문자열
   */
  static async execute(toolCall, options = {}) {
    try {
      const plugin = ImportedPlugin.loadPluginByHubId(toolCall.name);
      if (!plugin) return `Error: Tool "${toolCall.name}" not found.`;

      if (!plugin.config.active) {
        return `Error: Tool "${toolCall.name}" is not active.`;
      }

      const runtimeArgs = plugin.parseCallOptions();
      const context = {
        runtimeArgs,
        introspect: options.logger || (() => {}),
        logger: options.logger || console.log,
      };

      const args =
        typeof toolCall.arguments === "string"
          ? JSON.parse(toolCall.arguments)
          : toolCall.arguments;

      const result = await plugin.handler.runtime.handler.call(context, args);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error) {
      console.error(
        `[ToolExecutor] Error executing ${toolCall.name}:`,
        error.message
      );
      return `Error executing tool "${toolCall.name}": ${error.message}`;
    }
  }
}

module.exports = { ToolExecutor };
