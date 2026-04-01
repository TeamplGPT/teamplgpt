/* eslint-env jest, node */

/**
 * workspace.js의 queryRewriteMode 관련 단위 테스트
 * - queryRewriteMode validation
 * - writable 필드 포함 확인
 * - 유효/무효 값 처리
 */

const { Workspace } = require("../../models/workspace");

describe("Workspace.validations.queryRewriteMode", () => {
  // ── 유효한 값 ───────────────────────────────────────────

  it('"off"를 "off"로 반환한다', () => {
    expect(Workspace.validations.queryRewriteMode("off")).toBe("off");
  });

  it('"rule"을 "rule"로 반환한다', () => {
    expect(Workspace.validations.queryRewriteMode("rule")).toBe("rule");
  });

  it('"llm"을 "llm"으로 반환한다', () => {
    expect(Workspace.validations.queryRewriteMode("llm")).toBe("llm");
  });

  // ── 무효한 값 → "off" 기본값 ────────────────────────────

  it("null을 'off'로 반환한다", () => {
    expect(Workspace.validations.queryRewriteMode(null)).toBe("off");
  });

  it("undefined를 'off'로 반환한다", () => {
    expect(Workspace.validations.queryRewriteMode(undefined)).toBe("off");
  });

  it('빈 문자열을 "off"로 반환한다', () => {
    expect(Workspace.validations.queryRewriteMode("")).toBe("off");
  });

  it('존재하지 않는 모드를 "off"로 반환한다', () => {
    expect(Workspace.validations.queryRewriteMode("hybrid")).toBe("off");
    expect(Workspace.validations.queryRewriteMode("auto")).toBe("off");
    expect(Workspace.validations.queryRewriteMode("advanced")).toBe("off");
  });

  it('대문자 입력을 "off"로 반환한다 (대소문자 구분)', () => {
    expect(Workspace.validations.queryRewriteMode("OFF")).toBe("off");
    expect(Workspace.validations.queryRewriteMode("Rule")).toBe("off");
    expect(Workspace.validations.queryRewriteMode("LLM")).toBe("off");
  });

  it("숫자를 'off'로 반환한다", () => {
    expect(Workspace.validations.queryRewriteMode(0)).toBe("off");
    expect(Workspace.validations.queryRewriteMode(1)).toBe("off");
    expect(Workspace.validations.queryRewriteMode(123)).toBe("off");
  });

  it("불리언을 'off'로 반환한다", () => {
    expect(Workspace.validations.queryRewriteMode(true)).toBe("off");
    expect(Workspace.validations.queryRewriteMode(false)).toBe("off");
  });

  it("객체를 'off'로 반환한다", () => {
    expect(Workspace.validations.queryRewriteMode({})).toBe("off");
    expect(Workspace.validations.queryRewriteMode([])).toBe("off");
  });
});

describe("Workspace.writable - queryRewriteMode", () => {
  it("queryRewriteMode가 writable 필드에 포함되어 있다", () => {
    expect(Workspace.writable).toContain("queryRewriteMode");
  });
});
