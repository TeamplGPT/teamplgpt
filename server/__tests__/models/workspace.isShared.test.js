/* eslint-env jest, node */

// workspace.js의 isShared 관련 기능 단위 테스트
// - isShared validation
// - getShared() 캐시 동작
// - update()의 isShared 검증 로직

const { Workspace } = require("../../models/workspace");

describe("Workspace.validations.isShared", () => {
  it('true를 true로 반환한다', () => {
    expect(Workspace.validations.isShared(true)).toBe(true);
  });

  it('"true" 문자열을 true로 반환한다', () => {
    expect(Workspace.validations.isShared("true")).toBe(true);
  });

  it('false를 false로 반환한다', () => {
    expect(Workspace.validations.isShared(false)).toBe(false);
  });

  it('"false" 문자열을 false로 반환한다', () => {
    expect(Workspace.validations.isShared("false")).toBe(false);
  });

  it('null을 false로 반환한다', () => {
    expect(Workspace.validations.isShared(null)).toBe(false);
  });

  it('undefined를 false로 반환한다', () => {
    expect(Workspace.validations.isShared(undefined)).toBe(false);
  });

  it('"on" (HTML checkbox default)을 false로 반환한다', () => {
    expect(Workspace.validations.isShared("on")).toBe(false);
  });

  it('빈 문자열을 false로 반환한다', () => {
    expect(Workspace.validations.isShared("")).toBe(false);
  });

  it('숫자 1을 false로 반환한다', () => {
    expect(Workspace.validations.isShared(1)).toBe(false);
  });
});

describe("Workspace.validateFields - isShared", () => {
  it('isShared가 writable 필드에 포함되어 있다', () => {
    expect(Workspace.writable).toContain("isShared");
  });

  it('isShared: true를 검증하여 포함시킨다', () => {
    const result = Workspace.validateFields({ isShared: true });
    expect(result).toHaveProperty("isShared", true);
  });

  it('isShared: "true"를 검증하여 true로 변환한다', () => {
    const result = Workspace.validateFields({ isShared: "true" });
    expect(result).toHaveProperty("isShared", true);
  });

  it('isShared: "false"를 검증하여 false로 변환한다', () => {
    const result = Workspace.validateFields({ isShared: "false" });
    expect(result).toHaveProperty("isShared", false);
  });

  it('isShared: false를 검증하여 포함시킨다', () => {
    const result = Workspace.validateFields({ isShared: false });
    expect(result).toHaveProperty("isShared", false);
  });

  it('알 수 없는 필드는 무시한다', () => {
    const result = Workspace.validateFields({ unknownField: "value" });
    expect(result).not.toHaveProperty("unknownField");
  });
});

describe("Workspace._sharedCache", () => {
  beforeEach(() => {
    // 각 테스트 전 캐시 초기화
    Workspace._invalidateSharedCache();
  });

  it('초기 캐시는 value가 undefined이다', () => {
    expect(Workspace._sharedCache.value).toBeUndefined();
  });

  it('_invalidateSharedCache가 캐시를 초기화한다', () => {
    Workspace._sharedCache = { value: { id: 1 }, timestamp: Date.now() };
    Workspace._invalidateSharedCache();
    expect(Workspace._sharedCache.value).toBeUndefined();
    expect(Workspace._sharedCache.timestamp).toBe(0);
  });

  it('TTL 상수가 30초이다', () => {
    expect(Workspace._SHARED_CACHE_TTL).toBe(30000);
  });
});
