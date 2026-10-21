/**
 * 서버 쪽 본인 사번 관문 — hrFetch가 사번 키 없는 HR 요청을 보내지 않는다.
 * kiwibox SQL 다수(근무현황·연장근무 등)는 대상 직원이 비면 조회 권한 범위 직원 전체를 돌려준다.
 * 브리지(위젯·HR 시스템 내부)와 같은 규칙을 서버에도 둔다(다층 방어, specs/017 보안 리뷰 후속).
 */
const path = require("path");

const SHARED = path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared");
const { hrFetch, SELF_STAFF_ID_MARKER: SELF } = require(path.join(SHARED, "hrSession.js"));
const { REQUIRED_STAFF_PARAMS, requiredStaffKeys } = require(path.join(SHARED, "staffParams.js"));

function ctxWithTransport() {
  const calls = [];
  return {
    calls,
    ctx: {
      runtimeArgs: {},
      logger: () => {},
      clientToolTransport: async (req) => {
        calls.push(req);
        return { ok: true, status: 200, body: JSON.stringify({ DATA: [{ a: 1 }] }) };
      },
    },
  };
}

describe("hrFetch 본인 사번 관문", () => {
  it("근무현황을 사번 키 없이 요청하면 보내지 않고 안내만 돌려준다", async () => {
    const { ctx, calls } = ctxWithTransport();
    const res = await hrFetch(ctx, { path: "/TAAWrkTimeStatusMgr.do", form: { cmd: "getTAAWrkTimeStatusMgrList" } });
    expect(calls).toHaveLength(0);
    expect(res.errorMessage).toMatch(/본인 정보를 확인할 수 없어/);
  });

  it.each([["OTHER_STAFF_999"], [""], ["  "]])("사번 키 값이 본인 마커가 아니면(%p) 보내지 않는다", async (v) => {
    const { ctx, calls } = ctxWithTransport();
    const res = await hrFetch(ctx, { path: "/TAAWrkTimeStatusMgr.do", form: { cmd: "getTAAWrkTimeStatusMgrList", cmmSearchStaffId: v } });
    expect(calls).toHaveLength(0);
    expect(res.errorMessage).toBeTruthy();
  });

  it("필수 키가 여러 개인 경로는 하나라도 빠지면 보내지 않는다", async () => {
    const { ctx, calls } = ctxWithTransport();
    await hrFetch(ctx, { path: "/TAADclzVcatnList.do", form: { cmd: "getTAADclzVcatnList1", cmmSearchStaffId: SELF } });
    expect(calls).toHaveLength(0);
  });

  it("월 근무시간(/Home.do)을 사번 키 없이 요청하면 보내지 않는다 (specs/019)", async () => {
    const { ctx, calls } = ctxWithTransport();
    const res = await hrFetch(ctx, { path: "/Home.do", form: { cmd: "getHomeWorkStatusBarWidgetMap", searchYmd: "2026-10-21" } });
    expect(calls).toHaveLength(0);
    expect(res.errorMessage).toMatch(/본인 정보를 확인할 수 없어/);
    expect(requiredStaffKeys("/Home.do")).toEqual(["cmmSearchStaffId"]);
  });

  it("본인 마커가 있으면 그대로 보낸다", async () => {
    const { ctx, calls } = ctxWithTransport();
    const res = await hrFetch(ctx, { path: "/TAAWrkTimeStatusMgr.do", form: { cmd: "getTAAWrkTimeStatusMgrList", cmmSearchStaffId: SELF } });
    expect(calls).toHaveLength(1);
    expect(res.errorMessage).toBeFalsy();
  });

  it("사번 키가 필요 없는 경로(조직도·결재 건수)는 그대로 보낸다", async () => {
    const { ctx, calls } = ctxWithTransport();
    await hrFetch(ctx, { path: "/getTodoIconCnt.do", form: {} });
    await hrFetch(ctx, { path: "/getMBLHrBassiemOrgList.do", form: {} });
    expect(calls).toHaveLength(2);
  });

  it("서버 직접 호출(폴백)에서도 같은 관문을 지난다", async () => {
    const ctx = { runtimeArgs: { HR_SESSION_COOKIE: "JSESSIONID=x", HR_STAFF_ID: "S1" }, logger: () => {} };
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("호출되면 안 됨");
    });
    try {
      const res = await hrFetch(ctx, { path: "/TAAWrkTimeStatusMgr.do", form: { cmd: "getTAAWrkTimeStatusMgrList" } });
      expect(res.errorMessage).toMatch(/본인 정보를 확인할 수 없어/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("연말정산 경로는 컨트롤러별 키(InDctMgr만 searchStaffId)", () => {
    expect(requiredStaffKeys("/YTASummaryMgr2025.do")).toEqual(["cmmSearchStaffId"]);
    expect(requiredStaffKeys("/YTAInDctMgr2024.do")).toEqual(["searchStaffId"]);
    expect(requiredStaffKeys("/getTodoIconCnt.do")).toEqual([]);
    expect(REQUIRED_STAFF_PARAMS["/CTIMcrtfIssuMgr.do"]).toEqual(["staffIdNm"]);
  });
});
