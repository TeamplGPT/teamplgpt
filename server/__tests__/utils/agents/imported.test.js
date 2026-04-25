/**
 * ImportedPlugin.updateImportedPlugin — metadata deep-merge 검증
 *
 * Feature: hr-skill-web-search-toggle-ui (2026-04-25)
 *
 * - T1: metadata 부재 skill에 metadata 없는 update 전달 → 기존 구조 보존
 * - T2: metadata 존재 + partial metadata update → deep merge (다른 키 보존)
 * - T3: config.metadata 배열 주입 → Array.isArray 가드 작동 (deep merge skip)
 * - T4: setup_args는 얕은 머지 유지 (regression guard)
 */

process.env.NODE_ENV = "test";
process.env.STORAGE_DIR = process.env.STORAGE_DIR || __dirname;

jest.mock("../../../utils/collectorApi", () => {
  return {
    CollectorApi: jest.fn().mockImplementation(() => ({})),
  };
});
jest.mock("../../../utils/files", () => ({
  isWithin: jest.fn(() => true),
  normalizePath: (p = "") => String(p).trim(),
}));

const fs = require("fs");
const ImportedPlugin = require("../../../utils/agents/imported");

describe("ImportedPlugin.updateImportedPlugin — metadata deep merge", () => {
  const FAKE_PATH = "/fake/plugins/hr-personnel-search/plugin.json";

  let readSpy;
  let writeSpy;
  let validSpy;

  function armMocks(currentConfig) {
    readSpy = jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue(JSON.stringify(currentConfig));
    writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    validSpy = jest
      .spyOn(ImportedPlugin, "isValidLocation")
      .mockReturnValue(true);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // T1 ----------------------------------------------------------------
  it("T1: metadata 부재 skill에 metadata 없는 update 전달 시 기존 구조 보존", () => {
    const current = {
      hubId: "some-skill",
      active: true,
      setup_args: { X: { value: "v1" } },
    };
    armMocks(current);

    const result = ImportedPlugin.updateImportedPlugin("some-skill", {
      active: false,
    });

    expect(result).toEqual({
      hubId: "some-skill",
      active: false,
      setup_args: { X: { value: "v1" } },
    });
    expect(result.metadata).toBeUndefined();
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  // T2 ----------------------------------------------------------------
  it("T2: metadata 존재 + partial update 시 deep merge (다른 metadata 키 보존)", () => {
    const current = {
      hubId: "hr-personnel-search",
      active: true,
      metadata: {
        enable_web_search: true,
        other_flag: "preserved",
      },
    };
    armMocks(current);

    const result = ImportedPlugin.updateImportedPlugin(
      "hr-personnel-search",
      { metadata: { enable_web_search: false } }
    );

    expect(result.metadata).toEqual({
      enable_web_search: false,
      other_flag: "preserved",
    });
  });

  // T3 ----------------------------------------------------------------
  it("T3: metadata가 배열이면 Array.isArray 가드로 deep merge skip (얕은 머지만)", () => {
    const current = {
      hubId: "hr-personnel-search",
      metadata: { enable_web_search: true },
    };
    armMocks(current);

    const result = ImportedPlugin.updateImportedPlugin(
      "hr-personnel-search",
      { metadata: ["invalid"] }
    );

    // 얕은 머지로 덮어써야 함 (deep merge 미적용)
    expect(result.metadata).toEqual(["invalid"]);
  });

  // T4 ----------------------------------------------------------------
  it("T4: setup_args 얕은 머지 유지 — metadata 특수 분기가 다른 필드에 영향 없음", () => {
    const current = {
      hubId: "hr-personnel-search",
      setup_args: {
        HR_API_BASE_URL: { value: "http://old:8000" },
        LEGACY_ARG: { value: "legacy" },
      },
      metadata: { enable_web_search: true },
    };
    armMocks(current);

    const result = ImportedPlugin.updateImportedPlugin(
      "hr-personnel-search",
      {
        setup_args: {
          HR_API_BASE_URL: { value: "http://new:8000" },
        },
      }
    );

    // setup_args는 전체 교체 (얕은 머지)
    expect(result.setup_args).toEqual({
      HR_API_BASE_URL: { value: "http://new:8000" },
    });
    expect(result.setup_args.LEGACY_ARG).toBeUndefined();
    // metadata는 변경 안 되고 유지
    expect(result.metadata).toEqual({ enable_web_search: true });
  });

  it("T5: metadata 부재 current + 신규 metadata 주입 시 신규 생성 (currentConfig.metadata = undefined 안전)", () => {
    const current = {
      hubId: "new-skill",
      active: true,
    };
    armMocks(current);

    const result = ImportedPlugin.updateImportedPlugin("new-skill", {
      metadata: { enable_web_search: true },
    });

    expect(result.metadata).toEqual({ enable_web_search: true });
  });
});
