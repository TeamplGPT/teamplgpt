/**
 * responses.js — L3 guard unit tests
 * Design §8.1 T-L3-1 ~ T-L3-9.
 */

const {
  isResponseWritable,
  writeResponseChunk,
} = require("../responses");

function mockResponse({ writable = true, writableEnded = false } = {}) {
  return {
    writable,
    writableEnded,
    write: jest.fn(),
  };
}

describe("isResponseWritable — boundary matrix (T-L3-1~5)", () => {
  test("T-L3-1: null → false", () => {
    expect(isResponseWritable(null)).toBe(false);
  });

  test("T-L3-2: undefined → false", () => {
    expect(isResponseWritable(undefined)).toBe(false);
  });

  test("T-L3-3: writable=true, writableEnded=false → true", () => {
    expect(
      isResponseWritable({ writable: true, writableEnded: false })
    ).toBe(true);
  });

  test("T-L3-4: writable=false → false", () => {
    expect(
      isResponseWritable({ writable: false, writableEnded: false })
    ).toBe(false);
  });

  test("T-L3-5: writableEnded=true → false", () => {
    expect(
      isResponseWritable({ writable: true, writableEnded: true })
    ).toBe(false);
  });
});

describe("writeResponseChunk — guarded write (T-L3-6~9)", () => {
  let debugSpy;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  test("T-L3-6: writable response → response.write called once", () => {
    const res = mockResponse();
    writeResponseChunk(res, {
      uuid: "u1",
      type: "textResponseChunk",
      textResponse: "hi",
    });
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write.mock.calls[0][0]).toContain('"textResponse":"hi"');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  test("T-L3-7: writableEnded=true → noop + debug log", () => {
    const res = mockResponse({ writableEnded: true });
    writeResponseChunk(res, { uuid: "u1", type: "textResponseChunk" });
    expect(res.write).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0][0]).toContain("STREAM GUARD");
  });

  test("T-L3-8: writable=false → noop", () => {
    const res = mockResponse({ writable: false });
    writeResponseChunk(res, { uuid: "u1", type: "textResponseChunk" });
    expect(res.write).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  test("T-L3-9: null response → noop, no throw", () => {
    expect(() =>
      writeResponseChunk(null, { uuid: "u1", type: "textResponseChunk" })
    ).not.toThrow();
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
