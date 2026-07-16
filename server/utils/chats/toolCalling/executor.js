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
   * @param {Object<string,string>} [options.runtimeOverrides] - runtimeArgs 덮어쓰기 (null/undefined 값은 무시).
   *   Call-site별 runtime param override 용도 (e.g., E2E test에서 HR_API_BASE_URL을 mock 포트로 override).
   *   plugin.json의 setup_args.value는 변경되지 않음 (읽기 전용 기본값 유지).
   * @param {Function} [options.clientToolTransport] - R1 클라이언트 실행 위임 transport.
   *   (spec) => Promise<{ok, status, body}>. 존재하면 handler가 this.clientToolTransport로
   *   kiwibox 등 외부 호출을 브라우저 브리지에 위임할 수 있다 (specs/003).
   * @returns {Promise<string>} 실행 결과 문자열
   */
  static async execute(toolCall, options = {}) {
    try {
      const plugin = ImportedPlugin.loadPluginByHubId(toolCall.name);
      if (!plugin) return `Error: Tool "${toolCall.name}" not found.`;

      if (!plugin.config.active) {
        return `Error: Tool "${toolCall.name}" is not active.`;
      }

      const baseRuntimeArgs = plugin.parseCallOptions();
      const runtimeArgs = ToolExecutor.#mergeRuntimeOverrides(
        baseRuntimeArgs,
        options.runtimeOverrides
      );
      const context = {
        runtimeArgs,
        introspect: options.logger || (() => {}),
        logger: options.logger || console.log,
        clientToolTransport: options.clientToolTransport || null,
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

  /**
   * Merge runtime overrides into base runtimeArgs without mutating either input.
   * null/undefined values in overrides are ignored (they would silently blank legitimate params otherwise).
   * @param {Object<string,string>} baseRuntimeArgs
   * @param {Object<string,string>|null|undefined} overrides
   * @returns {Object<string,string>}
   */
  static #mergeRuntimeOverrides(baseRuntimeArgs, overrides) {
    if (!overrides || typeof overrides !== "object") return baseRuntimeArgs;
    const merged = { ...baseRuntimeArgs };
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === undefined) continue;
      merged[k] = v;
    }
    return merged;
  }
}

module.exports = { ToolExecutor };
