/**
 * hr-personnel-search handler.js 단위테스트
 *
 * 테스트 범위:
 * - Guard: query_type / university_names 유효성
 * - POST + JSON body 전송 (university_names + 선택 region)
 * - 응답 3 variant 처리 (A.3.1 중첩/ A.3.2 빈 배열 / A.3.3 실패)
 * - Truncation (MAX_RESULTS=200)
 * - 에러 분기 (HTTP non-ok / Timeout)
 */

global.fetch = jest.fn();

const path = require("path");
const handlerPath = path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/hr-personnel-search/handler.js"
);

beforeEach(() => {
  jest.resetModules();
  global.fetch.mockReset();
});

function loadHandler() {
  delete require.cache[handlerPath];
  return require(handlerPath);
}

function createMockContext(baseUrl = "http://test-hr-api:8000") {
  return {
    runtimeArgs: { HR_API_BASE_URL: baseUrl },
    introspect: jest.fn(),
    logger: jest.fn(),
  };
}

function mockFetchOk(responseJson) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => responseJson,
  });
}

function mockFetchError(status, body) {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  });
}

function getLastCall() {
  return global.fetch.mock.calls[0];
}

describe("hr-personnel-search handler", () => {
  // ── Guard ──────────────────────────────────────────────────────────────────
  describe("Guard: query_type 유효성", () => {
    it("query_type이 없으면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(createMockContext(), {
        university_names: ["서울대학교"],
      });
      expect(result).toContain("query_type이 올바르지 않습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("query_type이 enum에 없으면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "invalid_type",
        university_names: ["서울대학교"],
      });
      expect(result).toContain("query_type이 올바르지 않습니다");
      expect(result).toContain("graduates_by_region");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Guard: university_names 유효성", () => {
    const baseArgs = { query_type: "graduates_by_region" };

    it("university_names가 누락되면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(
        createMockContext(),
        baseArgs
      );
      expect(result).toContain("대학교 목록이 비어 있습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("university_names가 빈 배열이면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(createMockContext(), {
        ...baseArgs,
        university_names: [],
      });
      expect(result).toContain("대학교 목록이 비어 있습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("university_names가 배열이 아니면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(createMockContext(), {
        ...baseArgs,
        university_names: "서울대학교",
      });
      expect(result).toContain("대학교 목록이 비어 있습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("university_names 원소가 모두 공백·빈문자열이면 에러를 반환해야 한다", async () => {
      const mod = loadHandler();
      const result = await mod.runtime.handler.call(createMockContext(), {
        ...baseArgs,
        university_names: ["", "   ", null, undefined],
      });
      expect(result).toContain("대학교 목록이 비어 있습니다");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── POST + Body ────────────────────────────────────────────────────────────
  describe("POST + JSON body 전송", () => {
    it("university_names만 있을 때 POST body에 배열만 포함하고 region은 생략한다", async () => {
      const mod = loadHandler();
      mockFetchOk({
        success: true,
        data: { items: [{ emp_no: "1", name: "A", graduated_university: "서울대학교", degree: "학사" }], total: 1 },
      });

      await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교", "연세대학교"],
      });

      const [url, opts] = getLastCall();
      expect(url).toBe("http://test-hr-api:8000/api/v1/personnel/search/graduates");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        university_names: ["서울대학교", "연세대학교"],
      });
      expect(body).not.toHaveProperty("region");
    });

    it("region이 제공되면 POST body에 함께 포함한다", async () => {
      const mod = loadHandler();
      mockFetchOk({
        success: true,
        data: { items: [{ emp_no: "1", name: "A" }], total: 1 },
      });

      await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["경북대학교", "부산대학교"],
        region: "경상도",
      });

      const [, opts] = getLastCall();
      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        university_names: ["경북대학교", "부산대학교"],
        region: "경상도",
      });
    });

    it("university_names 원소의 공백을 trim하고 빈 원소를 제외한다", async () => {
      const mod = loadHandler();
      mockFetchOk({ success: true, data: { items: [{ emp_no: "1" }], total: 1 } });

      await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["  서울대학교  ", "", "   ", "연세대학교"],
      });

      const [, opts] = getLastCall();
      const body = JSON.parse(opts.body);
      expect(body.university_names).toEqual(["서울대학교", "연세대학교"]);
    });

    it("region이 공백문자열이면 body에서 제외한다", async () => {
      const mod = loadHandler();
      mockFetchOk({ success: true, data: { items: [{ emp_no: "1" }], total: 1 } });

      await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
        region: "   ",
      });

      const [, opts] = getLastCall();
      const body = JSON.parse(opts.body);
      expect(body).not.toHaveProperty("region");
    });

    it("baseUrl runtimeArgs가 없으면 default docker 주소를 사용한다", async () => {
      const mod = loadHandler();
      mockFetchOk({ success: true, data: { items: [{ emp_no: "1" }], total: 1 } });

      const ctx = { runtimeArgs: {}, introspect: jest.fn(), logger: jest.fn() };
      await mod.runtime.handler.call(ctx, {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      const [url] = getLastCall();
      expect(url).toBe(
        "http://kiwibox-hr-api:8000/api/v1/personnel/search/graduates"
      );
    });
  });

  // ── Response variants ──────────────────────────────────────────────────────
  describe("응답 처리 — A.3.1 `{success, data:{items, total}}` (중첩)", () => {
    it("items 배열을 표로 렌더링하고 total을 요약에 반영한다", async () => {
      const mod = loadHandler();
      mockFetchOk({
        success: true,
        data: {
          items: [
            { emp_no: "10234", name: "홍길동", graduated_university: "경북대학교", degree: "학사" },
            { emp_no: "10567", name: "김영희", graduated_university: "부산대학교", degree: "석사" },
          ],
          total: 12,
        },
      });

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["경북대학교", "부산대학교"],
        region: "경상도",
      });

      expect(result).toContain("HR 지역-대학-졸업자 검색 - 경상도");
      expect(result).toContain("홍길동");
      expect(result).toContain("경북대학교");
      expect(result).toContain("김영희");
      // total 12 이지만 실제 렌더링 행은 2건
      expect(result).toContain("총 **12건** 중 **2건** 표시");
    });
  });

  describe("응답 처리 — A.3.2 `{success, data:[]}` (결과 없음)", () => {
    it("빈 배열 응답이면 결과 없음 메시지를 반환한다", async () => {
      const mod = loadHandler();
      mockFetchOk({ success: true, data: [], message: "no matches" });

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["제주대학교"],
        region: "제주도",
      });

      expect(result).toContain("결과가 존재하지 않습니다");
      expect(result).toContain("제주도");
      expect(result).toContain("검색 대학 1개");
    });
  });

  // ── Truncation ─────────────────────────────────────────────────────────────
  describe("Truncation (MAX_RESULTS=200)", () => {
    it("items 210건이면 상위 200건만 표시하고 cap 안내를 포함한다", async () => {
      const mod = loadHandler();
      const items = Array.from({ length: 210 }, (_, i) => ({
        emp_no: String(10000 + i),
        name: `직원${i + 1}`,
        graduated_university: "서울대학교",
        degree: "학사",
      }));
      mockFetchOk({
        success: true,
        data: { items, total: 210 },
      });

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      // 200번째 직원은 표시되고 201번째(직원201)는 미표시
      expect(result).toContain("직원200");
      expect(result).not.toContain("| 직원201 |");
      expect(result).toContain("총 **210건** 중 **200건** 표시");
      expect(result).toContain("상위 200건 cap 적용");
    });

    it("items 30건이면 cap 메시지 없이 전량 표시한다", async () => {
      const mod = loadHandler();
      const items = Array.from({ length: 30 }, (_, i) => ({
        emp_no: String(10000 + i),
        name: `직원${i + 1}`,
      }));
      mockFetchOk({
        success: true,
        data: { items, total: 30 },
      });

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      expect(result).toContain("총 **30건** 중 **30건** 표시");
      expect(result).not.toContain("cap 적용");
    });
  });

  // ── Error branches ─────────────────────────────────────────────────────────
  describe("에러 분기", () => {
    it("HTTP 400 실패 응답은 parseErrorMessage로 message를 추출한다 (A.3.3)", async () => {
      const mod = loadHandler();
      mockFetchError(400, {
        success: false,
        data: null,
        message: "university_names is required",
      });

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      expect(result).toContain("university_names is required");
    });

    it("HTTP 500 실패이고 message가 없으면 fallback 메시지를 반환한다", async () => {
      const mod = loadHandler();
      mockFetchError(500, {});

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      expect(result).toContain("HR API 호출 실패 (HTTP 500)");
    });

    it("AbortSignal TimeoutError는 타임아웃 안내 메시지를 반환한다", async () => {
      const mod = loadHandler();
      const err = new Error("Aborted");
      err.name = "TimeoutError";
      global.fetch.mockRejectedValueOnce(err);

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      expect(result).toContain("HR API 서버 응답 시간이 초과되었습니다");
    });

    it("기타 예외는 일반 에러 메시지를 반환한다", async () => {
      const mod = loadHandler();
      global.fetch.mockRejectedValueOnce(new Error("unexpected network"));

      const result = await mod.runtime.handler.call(createMockContext(), {
        query_type: "graduates_by_region",
        university_names: ["서울대학교"],
      });

      expect(result).toContain("직원 검색 중 오류가 발생했습니다");
      expect(result).toContain("unexpected network");
    });
  });
});
