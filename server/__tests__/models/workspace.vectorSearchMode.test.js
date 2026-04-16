/* eslint-env jest, node */

/**
 * workspace.js의 vectorSearchMode 검증 회귀 테스트
 * - hybrid-search-default: "hybrid" 값은 더 이상 허용되지 않고 "default"로 강등됨
 * - "default", "rerank"는 여전히 유효
 */

const { Workspace } = require("../../models/workspace");

describe("Workspace.validations.vectorSearchMode", () => {
  test('W1: "hybrid"는 "default"로 강등된다', () => {
    expect(Workspace.validations.vectorSearchMode("hybrid")).toBe("default");
  });

  test('W2: "default"는 그대로 반환된다', () => {
    expect(Workspace.validations.vectorSearchMode("default")).toBe("default");
  });

  test('W3: "rerank"는 그대로 반환된다', () => {
    expect(Workspace.validations.vectorSearchMode("rerank")).toBe("rerank");
  });

  test('W4: null → "default"', () => {
    expect(Workspace.validations.vectorSearchMode(null)).toBe("default");
  });

  test('undefined → "default"', () => {
    expect(Workspace.validations.vectorSearchMode(undefined)).toBe("default");
  });

  test('빈 문자열 → "default"', () => {
    expect(Workspace.validations.vectorSearchMode("")).toBe("default");
  });

  test('미지원 문자열 → "default"', () => {
    expect(Workspace.validations.vectorSearchMode("unknown")).toBe("default");
  });

  test("숫자 등 비문자열 → \"default\"", () => {
    expect(Workspace.validations.vectorSearchMode(42)).toBe("default");
    expect(Workspace.validations.vectorSearchMode({})).toBe("default");
  });
});
