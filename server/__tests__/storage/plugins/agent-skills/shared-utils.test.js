/**
 * _shared 유틸리티 단위테스트
 * - unwrapResponse
 * - parseErrorMessage
 */

const path = require("path");

const { unwrapResponse } = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/unwrapResponse.js"
  )
);
const { parseErrorMessage } = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/parseErrorMessage.js"
  )
);

describe("unwrapResponse", () => {
  it("래퍼 형태 성공 응답을 올바르게 unwrap해야 한다", () => {
    const result = unwrapResponse({
      success: true,
      data: [{ name: "홍길동" }],
      message: null,
    });
    expect(result.isEmpty).toBe(false);
    expect(result.records).toEqual([{ name: "홍길동" }]);
  });

  it("래퍼 형태 실패 응답을 isEmpty로 반환해야 한다", () => {
    const result = unwrapResponse({
      success: false,
      data: null,
      message: "에러 발생",
    });
    expect(result.isEmpty).toBe(true);
    expect(result.records).toBeNull();
  });

  it("빈 배열 데이터를 isEmpty로 반환해야 한다", () => {
    const result = unwrapResponse({
      success: true,
      data: [],
      message: null,
    });
    expect(result.isEmpty).toBe(true);
    expect(result.records).toEqual([]);
  });

  it("null 데이터를 isEmpty로 반환해야 한다", () => {
    const result = unwrapResponse({
      success: true,
      data: null,
      message: null,
    });
    expect(result.isEmpty).toBe(true);
  });

  it("단일 객체 데이터를 올바르게 unwrap해야 한다", () => {
    const result = unwrapResponse({
      success: true,
      data: { name: "홍길동", position: "부장" },
      message: null,
    });
    expect(result.isEmpty).toBe(false);
    expect(result.records).toEqual({ name: "홍길동", position: "부장" });
  });

  it("기존 에러 형태 (code: -1)를 isEmpty로 반환해야 한다", () => {
    const result = unwrapResponse({ code: "-1", message: "에러" });
    expect(result.isEmpty).toBe(true);
  });

  it("기존 정상 응답 (passthrough)을 반환해야 한다", () => {
    const data = [{ a: 1 }, { a: 2 }];
    const result = unwrapResponse(data);
    expect(result.isEmpty).toBe(false);
    expect(result.records).toBe(data);
  });
});

describe("parseErrorMessage", () => {
  it("JSON 응답에서 message를 추출해야 한다", async () => {
    const mockResponse = {
      json: async () => ({ message: "사원번호가 유효하지 않습니다" }),
    };
    const result = await parseErrorMessage(mockResponse, "기본 에러");
    expect(result).toContain("사원번호가 유효하지 않습니다");
  });

  it("JSON 파싱 실패 시 fallback 메시지를 반환해야 한다", async () => {
    const mockResponse = {
      json: async () => {
        throw new Error("Invalid JSON");
      },
    };
    const result = await parseErrorMessage(mockResponse, "> ⚠️ 기본 에러");
    expect(result).toBe("> ⚠️ 기본 에러");
  });

  it("message 필드가 없으면 fallback 메시지를 반환해야 한다", async () => {
    const mockResponse = {
      json: async () => ({ code: 500 }),
    };
    const result = await parseErrorMessage(mockResponse, "> ⚠️ 서버 에러");
    expect(result).toBe("> ⚠️ 서버 에러");
  });
});
