/**
 * HR 시스템 내부 브리지(extras/kiwibox-bridge/teamplgpt-hr-bridge.js) — 연장근무현황 규칙 (specs/017)
 * 브라우저 IIFE라 node:vm 샌드박스에 window·fetch 스텁을 두고 로드한다.
 * 같은 규칙의 위젯 브리지 테스트: okrservice widgets/client/messenger/widget/__tests__/hrBridge.test.ts
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../../extras/kiwibox-bridge/teamplgpt-hr-bridge.js"),
  "utf8"
);
const ORIGIN = "https://widgets.example.com";
const OT_LIMIT = "/getMBLDclzWorkOtSchdul.do";
const OT_PERSON = "/getMBLDclzWorkOtSchdulPerson.do";

function loadBridge(config = {}) {
  const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("BODY") });
  const window = { addEventListener: () => {}, removeEventListener: () => {} };
  const sandbox = { window, document: {}, fetch, URLSearchParams, setTimeout, clearTimeout, AbortController };
  vm.runInNewContext(SRC, sandbox);
  const replies = [];
  const bridge = new window.TeamplGPTHRBridge({
    widgetOrigin: ORIGIN,
    iframe: { contentWindow: { postMessage: (msg) => replies.push(msg) } },
    staffId: "STAFF123",
    ...config,
  });
  const send = async (spec, callId = "c1") => {
    bridge._onMessage({ origin: ORIGIN, data: { type: "teamplgpt:hr-tool-request", callId, spec } });
    await new Promise((r) => setImmediate(r));
    return replies[replies.length - 1];
  };
  return { fetch, send };
}

describe("teamplgpt-hr-bridge 연장근무현황 (specs/017)", () => {
  it("본인 마커가 있으면 두 경로 모두 본인 STAFF_ID로 조회한다", async () => {
    const { fetch, send } = loadBridge();
    await send({ path: OT_LIMIT, form: { searchType: "3", searchBaseSYmd: "2026-10-15", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    await send({ path: OT_PERSON, form: { searchBaseSYmd: "2026-10-01", searchBaseEYmd: "2026-10-15", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe(OT_LIMIT);
    expect(fetch.mock.calls[0][1].body).toBe("searchType=3&searchBaseSYmd=2026-10-15&cmmSearchStaffId=STAFF123");
    expect(fetch.mock.calls[1][1].body).toBe("searchBaseSYmd=2026-10-01&searchBaseEYmd=2026-10-15&cmmSearchStaffId=STAFF123");
  });

  it.each([OT_LIMIT, OT_PERSON])("%s: 사번 키가 없으면 fetch 없이 거부한다", async (p) => {
    const { fetch, send } = loadBridge();
    const reply = await send({ path: p, form: { searchType: "2", searchBaseSYmd: "2026-10-15" } });
    expect(reply.body).toBe("bridge: staff param required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("사번이 빈 값이면 거부한다", async () => {
    const { fetch, send } = loadBridge();
    const reply = await send({ path: OT_LIMIT, form: { searchType: "2", cmmSearchStaffId: "" } });
    expect(reply.body).toBe("bridge: staff param must be self");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([["1"], [undefined]])("한도 경로 searchType=%p는 거부한다", async (t) => {
    const { fetch, send } = loadBridge();
    const form = { cmmSearchStaffId: "$SELF_STAFF_ID", ...(t === undefined ? {} : { searchType: t }) };
    const reply = await send({ path: OT_LIMIT, form });
    expect(reply.body).toBe("bridge: param not allowed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cmd를 붙이면 거부한다", async () => {
    const { fetch, send } = loadBridge();
    const reply = await send({ path: OT_LIMIT, form: { cmd: "x", searchType: "2", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    expect(reply.body).toBe("bridge: cmd not allowed");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("teamplgpt-hr-bridge 사번 키 필수·설정 경로 (specs/017 보안 리뷰)", () => {
  it.each([
    ["/TAAWrkTimeStatusMgr.do", { cmd: "getTAAWrkTimeStatusMgrList" }],
    ["/TAADclzWorkOtSchdul.do", { cmd: "getTAADclzWorkOtSchdulList", searchType: "2", searchYm: "202610" }],
    ["/TAADclzVcatnList.do", { cmd: "getTAADclzVcatnList1", cmmSearchStaffId: "$SELF_STAFF_ID" }],
    ["/CTIMcrtfIssuMgr.do", { cmd: "getCTIMcrtfIssuMgrList" }],
    ["/YTASummaryMgr2025.do", { cmd: "getYTASummaryMgrList" }],
    ["/YTAInDctMgr2025.do", { cmd: "getYTAInDctMgrTab06List", cmmSearchStaffId: "$SELF_STAFF_ID" }],
  ])("%s: 필수 사번 키가 없으면 거부한다", async (p, form) => {
    const { fetch, send } = loadBridge();
    const reply = await send({ path: p, form });
    expect(reply.body).toBe("bridge: staff param required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("증명서 검색 칸(staffIdNm)은 본인 마커만 — 마커면 본인 ID로 바꿔 보낸다", async () => {
    const { fetch, send } = loadBridge();
    expect((await send({ path: "/CTIMcrtfIssuMgr.do", form: { cmd: "getCTIMcrtfIssuMgrList", staffIdNm: "" } })).body)
      .toBe("bridge: staff param must be self");
    await send({ path: "/CTIMcrtfIssuMgr.do", form: { cmd: "getCTIMcrtfIssuMgrList", staffIdNm: "$SELF_STAFF_ID" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body).toBe("cmd=getCTIMcrtfIssuMgrList&staffIdNm=STAFF123");
  });

  it("정해진 키 외의 파라미터는 거부한다", async () => {
    const { fetch, send } = loadBridge();
    const reply = await send({ path: OT_LIMIT, form: { searchType: "2", x0: "1", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    expect(reply.body).toBe("bridge: param key not allowed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("설정의 본인 사번이 공백뿐이면 마커를 치환하지 않고 거부한다", async () => {
    const { fetch, send } = loadBridge({ staffId: "   " });
    const reply = await send({ path: OT_LIMIT, form: { searchType: "2", searchBaseSYmd: "2026-10-15", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    expect(reply.body).toBe("bridge: staffId not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("설정의 allowedPaths는 기본 목록 안의 경로만 인정한다(빠진 경로를 되살리지 못함)", async () => {
    const { fetch, send } = loadBridge({ allowedPaths: ["/TAADclzVcatnCldrMgr.do", OT_LIMIT] });
    expect((await send({ path: "/TAADclzVcatnCldrMgr.do", form: { cmd: "getTAADclzVcatnCldrMgr" } })).body)
      .toBe("bridge: path not allowed");
    await send({ path: OT_LIMIT, form: { searchType: "3", searchBaseSYmd: "2026-10-15", cmmSearchStaffId: "$SELF_STAFF_ID" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("예약어 키(constructor)가 와도 예외로 멈추지 않고 응답한다", async () => {
    const { send } = loadBridge();
    const reply = await send({ path: "/getTodoIconCnt.do", form: { constructor: "x" } });
    expect(reply).toBeDefined();
  });
});
