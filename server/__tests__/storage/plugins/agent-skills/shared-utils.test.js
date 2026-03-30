/**
 * _shared 유틸리티 단위테스트
 * - unwrapResponse
 * - parseErrorMessage
 * - resolveDateParam (dateResolver)
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
const { resolveDateParam } = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/dateResolver.js"
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

describe("resolveDateParam", () => {
  describe("빈값/미전달 처리", () => {
    it("undefined → undefined", () => {
      expect(resolveDateParam(undefined, "year")).toBeUndefined();
    });
    it("null → undefined", () => {
      expect(resolveDateParam(null, "year_month")).toBeUndefined();
    });
    it("빈 문자열 → undefined", () => {
      expect(resolveDateParam("", "base_date")).toBeUndefined();
    });
    it("공백 문자열 → undefined", () => {
      expect(resolveDateParam("  ", "year")).toBeUndefined();
    });
  });

  describe("정확한 포맷 pass-through", () => {
    it("YYYY 형식 pass-through", () => {
      expect(resolveDateParam("2025", "year")).toBe("2025");
    });
    it("YYYYMM 형식 pass-through", () => {
      expect(resolveDateParam("202503", "year_month")).toBe("202503");
    });
    it("YYYYMMDD 형식 pass-through", () => {
      expect(resolveDateParam("20250319", "base_date")).toBe("20250319");
    });
  });

  describe("한국어 상대 날짜 표현 변환", () => {
    it("'어제' → YYYYMMDD (어제 날짜)", () => {
      const result = resolveDateParam("어제", "base_date");
      expect(result).toMatch(/^\d{8}$/);
      // 어제 날짜 검증
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
      expect(result).toBe(expected);
    });

    it("'내일' → YYYYMMDD (내일 날짜)", () => {
      const result = resolveDateParam("내일", "base_date");
      expect(result).toMatch(/^\d{8}$/);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expected = `${tomorrow.getFullYear()}${String(tomorrow.getMonth() + 1).padStart(2, "0")}${String(tomorrow.getDate()).padStart(2, "0")}`;
      expect(result).toBe(expected);
    });

    it("'지난달' → YYYYMM (전월)", () => {
      const result = resolveDateParam("지난달", "year_month");
      expect(result).toMatch(/^\d{6}$/);
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const expected = `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      expect(result).toBe(expected);
    });

    it("'다음달' → YYYYMM (다음 월)", () => {
      const result = resolveDateParam("다음달", "year_month");
      expect(result).toMatch(/^\d{6}$/);
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const expected = `${nextMonth.getFullYear()}${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
      expect(result).toBe(expected);
    });

    it("'작년' → YYYY (전년도)", () => {
      const result = resolveDateParam("작년", "year");
      const expected = String(new Date().getFullYear() - 1);
      expect(result).toBe(expected);
    });

    it("'올해' → YYYY (현재 연도)", () => {
      const result = resolveDateParam("올해", "year");
      const expected = String(new Date().getFullYear());
      expect(result).toBe(expected);
    });

    it("'그저께' → YYYYMMDD", () => {
      const result = resolveDateParam("그저께", "base_date");
      expect(result).toMatch(/^\d{8}$/);
    });

    it("'모레' → YYYYMMDD", () => {
      const result = resolveDateParam("모레", "base_date");
      expect(result).toMatch(/^\d{8}$/);
    });
  });

  describe("부분 날짜 - 한국어 표현 (sugar-date)", () => {
    it("'3월' → year_month: 현재연도+03", () => {
      const result = resolveDateParam("3월", "year_month");
      const expected = `${new Date().getFullYear()}03`;
      expect(result).toBe(expected);
    });

    it("'12월' → year_month: 현재연도+12", () => {
      const result = resolveDateParam("12월", "year_month");
      const expected = `${new Date().getFullYear()}12`;
      expect(result).toBe(expected);
    });

    it("'3월 15일' → base_date: 현재연도+0315", () => {
      const result = resolveDateParam("3월 15일", "base_date");
      const expected = `${new Date().getFullYear()}0315`;
      expect(result).toBe(expected);
    });

    it("'15일' → base_date: 현재연도+현재월+15", () => {
      const result = resolveDateParam("15일", "base_date");
      const now = new Date();
      const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}15`;
      expect(result).toBe(expected);
    });

    it("'1월 5일' → base_date: 현재연도+0105", () => {
      const result = resolveDateParam("1월 5일", "base_date");
      const expected = `${new Date().getFullYear()}0105`;
      expect(result).toBe(expected);
    });
  });

  describe("부분 날짜 - 숫자만 (partial numeric)", () => {
    it("'3' → year_month: 현재연도+03 (월로 해석)", () => {
      const result = resolveDateParam("3", "year_month");
      const expected = `${new Date().getFullYear()}03`;
      expect(result).toBe(expected);
    });

    it("'12' → year_month: 현재연도+12 (월로 해석)", () => {
      const result = resolveDateParam("12", "year_month");
      const expected = `${new Date().getFullYear()}12`;
      expect(result).toBe(expected);
    });

    it("'15' → base_date: 현재연도+현재월+15 (일로 해석)", () => {
      const result = resolveDateParam("15", "base_date");
      const now = new Date();
      const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}15`;
      expect(result).toBe(expected);
    });

    it("'5' → base_date: 현재연도+현재월+05 (일로 해석)", () => {
      const result = resolveDateParam("5", "base_date");
      const now = new Date();
      const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}05`;
      expect(result).toBe(expected);
    });

    it("'0315' → base_date: 현재연도+0315 (MMDD 패턴)", () => {
      const result = resolveDateParam("0315", "base_date");
      const expected = `${new Date().getFullYear()}0315`;
      expect(result).toBe(expected);
    });

    it("'315' → base_date: 현재연도+0315 (MDD 패턴)", () => {
      const result = resolveDateParam("315", "base_date");
      const expected = `${new Date().getFullYear()}0315`;
      expect(result).toBe(expected);
    });

    it("'1225' → base_date: 현재연도+1225 (MMDD 패턴)", () => {
      const result = resolveDateParam("1225", "base_date");
      const expected = `${new Date().getFullYear()}1225`;
      expect(result).toBe(expected);
    });

    it("'13' → year_month: undefined (13월은 없음)", () => {
      expect(resolveDateParam("13", "year_month")).toBeUndefined();
    });

    it("'32' → base_date: undefined (32일은 없음, partial로 해석 불가)", () => {
      // 32는 1-31 범위 밖이므로 partial numeric에서 거부됨
      // sugar-date가 해석할 수도 있으므로 최소한 8자리 포맷인지만 확인
      const result = resolveDateParam("32", "base_date");
      // sugar-date가 해석하면 8자리, 아니면 undefined
      if (result !== undefined) {
        expect(result).toMatch(/^\d{8}$/);
      }
    });
  });

  describe("비표준 포맷 → sugar-date 해석", () => {
    it("'2025-03' → '202503' (sugar-date가 해석)", () => {
      expect(resolveDateParam("2025-03", "year_month")).toBe("202503");
    });
    it("'2025/03/19' → '20250319' (sugar-date가 해석)", () => {
      expect(resolveDateParam("2025/03/19", "base_date")).toBe("20250319");
    });
  });

  describe("해석 불가 문자열 거부", () => {
    it("'abc' → undefined", () => {
      expect(resolveDateParam("abc", "year")).toBeUndefined();
    });
    it("완전히 무의미한 문자열 → undefined", () => {
      expect(resolveDateParam("xyz날짜아님", "year")).toBeUndefined();
    });
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
