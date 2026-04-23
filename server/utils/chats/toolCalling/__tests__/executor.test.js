/**
 * ToolExecutor — runtimeOverrides 병합 단위 테스트 (embed-tool-runtime-override 피처)
 *
 * 검증 대상:
 *   - ToolExecutor.execute(toolCall, { runtimeOverrides }) 인자 경로
 *   - parseCallOptions() 결과에 runtimeOverrides가 shallow merge되는지
 *   - null/undefined 값은 무시 (기본값 보존)
 *   - overrides 미제공 시 기존 동작(plugin.json setup_args.value 그대로) 회귀 없음
 */

jest.mock("../../../agents/imported", () => ({
  loadPluginByHubId: jest.fn(),
}));

const ImportedPlugin = require("../../../agents/imported");
const { ToolExecutor } = require("../executor");

function mockPlugin({ name = "hr-attendance", active = true, setupArgs = {} } = {}) {
  const parseCallOptions = jest.fn(() => {
    const out = {};
    for (const [k, v] of Object.entries(setupArgs)) {
      out[k] = v.value ?? v.default ?? null;
    }
    return out;
  });
  const handlerFn = jest.fn(function handler(args) {
    // `this` 컨텍스트에 바인딩된 runtimeArgs 포착 (테스트가 assert)
    return JSON.stringify({ runtimeArgs: this.runtimeArgs, args });
  });
  return {
    name,
    config: { active, setup_args: setupArgs },
    parseCallOptions,
    handler: { runtime: { handler: handlerFn } },
    _handlerFn: handlerFn,
  };
}

describe("ToolExecutor.execute — runtimeOverrides 병합", () => {
  beforeEach(() => {
    ImportedPlugin.loadPluginByHubId.mockReset();
  });

  test("TC-E1: overrides 미제공 → parseCallOptions 결과 그대로 (기존 동작 회귀 없음)", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    const result = await ToolExecutor.execute({
      name: "hr-attendance",
      arguments: { emp_no: "123" },
    });

    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs).toEqual({ HR_API_BASE_URL: "http://localhost:8000" });
  });

  test("TC-E2: overrides가 setup_args.value 덮어쓰기 (plugin 설정 무변경)", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: { emp_no: "123" } },
      { runtimeOverrides: { HR_API_BASE_URL: "http://localhost:8001" } }
    );

    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs.HR_API_BASE_URL).toBe("http://localhost:8001");
    // plugin.config.setup_args 원본은 변경되지 않음
    expect(plugin.config.setup_args.HR_API_BASE_URL.value).toBe(
      "http://localhost:8000"
    );
  });

  test("TC-E3: override 키가 base에 없으면 신규 키로 추가", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: {} },
      { runtimeOverrides: { EXTRA_FLAG: "dev" } }
    );
    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs).toEqual({
      HR_API_BASE_URL: "http://localhost:8000",
      EXTRA_FLAG: "dev",
    });
  });

  test("TC-E4: override 값이 null/undefined면 무시 (기본값 보존, 실수로 비우는 것 방지)", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: {} },
      {
        runtimeOverrides: {
          HR_API_BASE_URL: null,
          EXTRA_FLAG: undefined,
        },
      }
    );
    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs).toEqual({
      HR_API_BASE_URL: "http://localhost:8000",
    });
  });

  test("TC-E5: overrides가 빈 객체면 base 그대로", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: {} },
      { runtimeOverrides: {} }
    );
    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs).toEqual({ HR_API_BASE_URL: "http://localhost:8000" });
  });

  test("TC-E6: plugin 미존재 → Error 문자열 반환 (overrides 무관)", async () => {
    ImportedPlugin.loadPluginByHubId.mockReturnValue(null);
    const result = await ToolExecutor.execute(
      { name: "missing-tool", arguments: {} },
      { runtimeOverrides: { HR_API_BASE_URL: "http://localhost:8001" } }
    );
    expect(result).toMatch(/^Error: Tool "missing-tool" not found\./);
  });

  test("TC-E7: plugin inactive → Error 문자열 반환", async () => {
    const plugin = mockPlugin({ active: false });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);
    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: {} },
      { runtimeOverrides: { HR_API_BASE_URL: "http://localhost:8001" } }
    );
    expect(result).toMatch(/not active/);
  });

  test("TC-E8: base runtimeArgs 객체 mutation 금지 (불변성)", async () => {
    const baseSnapshot = { HR_API_BASE_URL: "http://localhost:8000" };
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    plugin.parseCallOptions = jest.fn(() => baseSnapshot);
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);

    await ToolExecutor.execute(
      { name: "hr-attendance", arguments: {} },
      { runtimeOverrides: { HR_API_BASE_URL: "http://localhost:8001" } }
    );
    // parseCallOptions 반환값(baseSnapshot)은 원본 보존
    expect(baseSnapshot).toEqual({ HR_API_BASE_URL: "http://localhost:8000" });
  });

  test("TC-E9: string arguments (OpenAI Responses format) JSON.parse 경로 정상 + override 적용", async () => {
    const plugin = mockPlugin({
      setupArgs: {
        HR_API_BASE_URL: { value: "http://localhost:8000" },
      },
    });
    ImportedPlugin.loadPluginByHubId.mockReturnValue(plugin);
    const result = await ToolExecutor.execute(
      { name: "hr-attendance", arguments: '{"emp_no":"123"}' },
      { runtimeOverrides: { HR_API_BASE_URL: "http://localhost:8001" } }
    );
    const parsed = JSON.parse(result);
    expect(parsed.runtimeArgs.HR_API_BASE_URL).toBe("http://localhost:8001");
    expect(parsed.args).toEqual({ emp_no: "123" });
  });
});
