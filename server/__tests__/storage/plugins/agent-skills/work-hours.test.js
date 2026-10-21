/**
 * 월 근무시간 (specs/019) — 5240 홈 "월별 근무현황"(Home.do getHomeWorkStatusBarWidgetMap)
 * 계약: specs/019-hr-work-hours-gauge/contracts/tool-output-work-hours.md, data-model.md
 */
const path = require("path");

const SHARED = path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared");
const {
  HOME_PATH,
  HOME_CMD,
  planWorkHours,
  toWorkHours,
  runWorkHours,
  workHoursBlock,
} = require(path.join(SHARED, "workHours.js"));
const { SELF_STAFF_ID_MARKER: SELF } = require(path.join(SHARED, "hrSession.js"));

const NOW = new Date("2026-10-21T10:00:00+09:00");
const OCT = { workT: 82.5, basTime1: 171, basTime2: 53, remT: "88.5", basTime12: 128, staffNo: "E0001", staffNm: "홍길동" };
const SEP = { workT: 176, basTime1: 168, basTime2: 52, remT: "-8", staffNo: "E0001", staffNm: "홍길동" };

const okFetch = (map) => {
  const calls = [];
  const fetch = async (req) => {
    calls.push(req);
    return { records: map };
  };
  return { calls, fetch };
};

const tableRows = (out) => out.split("\n").filter((l) => l.startsWith("|"));

describe("planWorkHours", () => {
  it.each([
    [undefined, { kind: "current", y: 2026, m: 10, baseYmd: "2026-10-21" }],
    ["", { kind: "current", y: 2026, m: 10, baseYmd: "2026-10-21" }],
    ["이번 달", { kind: "current", y: 2026, m: 10, baseYmd: "2026-10-21" }],
    ["9월", { kind: "month", y: 2026, m: 9, baseYmd: "2026-09-30" }],
    ["지난달", { kind: "month", y: 2026, m: 9, baseYmd: "2026-09-30" }],
    ["2025년 2월", { kind: "month", y: 2025, m: 2, baseYmd: "2025-02-28" }],
    ["202409", { kind: "month", y: 2024, m: 9, baseYmd: "2024-09-30" }],
  ])("%p → %p", (ym, expected) => {
    expect(planWorkHours(ym, NOW)).toMatchObject(expected);
  });

  it("오지 않은 달은 future", () => {
    expect(planWorkHours("11월", NOW)).toMatchObject({ kind: "future", label: "11월" });
    expect(planWorkHours("2027년 1월", NOW)).toMatchObject({ kind: "future", label: "2027년 1월" });
  });

  it("연 단위는 year", () => {
    expect(planWorkHours("올해", NOW)).toMatchObject({ kind: "year" });
    expect(planWorkHours("2025년", NOW)).toMatchObject({ kind: "year" });
  });
});

describe("toWorkHours — 본인 한 명 분만 (research R3·R5)", () => {
  const cur = planWorkHours(undefined, NOW);
  const sep = planWorkHours("9월", NOW);

  it("정상 Map", () => {
    expect(toWorkHours(OCT, cur)).toEqual({ ok: true, worked: 82.5, normal: 171, max: 224, toNormal: 88.5 });
  });

  it("길이 1 배열도 받는다, 대문자 원본 키도 받는다", () => {
    expect(toWorkHours([OCT], cur).ok).toBe(true);
    expect(toWorkHours({ WORK_T: "82.5", BAS_TIME1: "171", BAS_TIME2: "53" }, cur)).toMatchObject({ ok: true, worked: 82.5, max: 224 });
  });

  it.each([[null], [{}], [[]], [[OCT, SEP]], [{ workT: null, basTime1: null }], [{ workT: "abc", basTime1: 171 }], [{ workT: 82.5 }]])(
    "쓸 수 없는 응답 %p → ok=false",
    (records) => {
      expect(toWorkHours(records, cur)).toEqual({ ok: false, worked: null, normal: null, max: null, toNormal: null });
    }
  );

  it("basTime2가 없으면 최대 가능만 null", () => {
    expect(toWorkHours({ workT: 82.5, basTime1: 171 }, cur)).toMatchObject({ ok: true, max: null });
  });

  it.each([["88.5", 88.5], ["88:30", 88.5], ["-8:15", -8.3], ["x", null], [null, null]])("remT %p → %p", (remT, expected) => {
    expect(toWorkHours({ ...OCT, remT }, cur).toNormal).toBe(expected);
  });

  it("지난 달은 소정까지를 쓰지 않는다", () => {
    expect(toWorkHours(SEP, sep).toNormal).toBeNull();
  });
});

describe("runWorkHours — 출력 계약 §1~§4", () => {
  it("§1 이번 달: 표 1줄 + 단위 안내 + 응답 형식 줄 + 요청 form", async () => {
    const { calls, fetch } = okFetch(OCT);
    const out = await runWorkHours(planWorkHours(undefined, NOW), fetch);
    expect(out.startsWith("## HR 근태 - 근무시간\n\n")).toBe(true);
    expect(tableRows(out)).toEqual([
      "| 구분 | 누적 근로 | 월간 소정 | 최대 가능 | 소정까지 |",
      "| --- | --- | --- | --- | --- |",
      "| 이번 달(10월) | 82.5 | 171.0 | 224.0 | 88.5 |",
    ]);
    expect(out).toContain("> 단위는 시간이며, 누적 근로에는 연장근무 시간이 포함됩니다.");
    expect(out).toMatch(/> \[응답 형식\] 근무시간을 물으면 누적 근로를 첫 문장에/);
    expect(out).toContain("[응답 지침]");
    expect(calls).toEqual([
      { path: HOME_PATH, form: { cmd: HOME_CMD, searchYmd: "2026-10-21", cmmSearchStaffId: SELF } },
    ]);
  });

  it("§2 지난 달: 올해면 '9월', 기준일 말일, 소정까지 —", async () => {
    const { calls, fetch } = okFetch(SEP);
    const out = await runWorkHours(planWorkHours("9월", NOW), fetch);
    expect(tableRows(out)[2]).toBe("| 9월 | 176.0 | 168.0 | 220.0 | — |");
    expect(calls[0].form.searchYmd).toBe("2026-09-30");
  });

  it("§2 다른 해: '2025년 9월'", async () => {
    const { fetch } = okFetch(SEP);
    const out = await runWorkHours(planWorkHours("2025년 9월", NOW), fetch);
    expect(tableRows(out)[2]).toBe("| 2025년 9월 | 176.0 | 168.0 | 220.0 | — |");
  });

  it.each([
    ["빈 Map", async () => ({ isEmpty: true, records: null })],
    ["오류", async () => ({ errorMessage: "> ⚠️ HR 서버 응답 오류(500)" })],
    ["2개 행", async () => ({ records: [OCT, SEP] })],
    ["예외", async () => { throw new Error("boom"); }],
  ])("§3 %s → — 줄 + 조회하지 못했습니다, 0으로 채우지 않음", async (_label, fetch) => {
    const out = await runWorkHours(planWorkHours(undefined, NOW), fetch);
    expect(tableRows(out)[2]).toBe("| 이번 달(10월) | — | — | — | — |");
    expect(out).toContain("> 근무시간을 조회하지 못했습니다.");
    expect(out).not.toMatch(/\| 0(\.0)? \|/);
  });

  it("§4 오지 않은 달·연 단위는 조회하지 않는다", async () => {
    const { calls, fetch } = okFetch(OCT);
    expect(await runWorkHours(planWorkHours("11월", NOW), fetch)).toBe(
      "> ⚠️ 11월은 아직 지나지 않은 달이라 근무시간이 없습니다."
    );
    expect(await runWorkHours(planWorkHours("올해", NOW), fetch)).toBe(
      '> ⚠️ 근무시간은 월 단위로만 조회할 수 있습니다. "9월 근무시간"처럼 달을 지정해 주세요.'
    );
    expect(calls).toHaveLength(0);
  });

  it("§6 신상 칸·응답 키 이름이 나가지 않는다", async () => {
    const { fetch } = okFetch(OCT);
    const out = await runWorkHours(planWorkHours(undefined, NOW), fetch);
    expect(out).not.toMatch(/홍길동|E0001|workT|basTime|remT/);
  });

  it("0으로 온 값은 0.0으로 표시한다(받지 못한 것과 구분)", async () => {
    const { fetch } = okFetch({ workT: 0, basTime1: 171, basTime2: 53, remT: "171" });
    const out = await runWorkHours(planWorkHours(undefined, NOW), fetch);
    expect(tableRows(out)[2]).toBe("| 이번 달(10월) | 0.0 | 171.0 | 224.0 | 171.0 |");
  });
});

describe("workHoursBlock — 근무현황에 붙일 블록(계약 §5)", () => {
  it("표 + 단위 안내만(제목·응답 지침 없음)", async () => {
    const { fetch } = okFetch(OCT);
    const block = await workHoursBlock(planWorkHours(undefined, NOW), fetch);
    expect(block).toBe(
      [
        "| 구분 | 누적 근로 | 월간 소정 | 최대 가능 | 소정까지 |",
        "| --- | --- | --- | --- | --- |",
        "| 이번 달(10월) | 82.5 | 171.0 | 224.0 | 88.5 |",
        "",
        "> 단위는 시간이며, 누적 근로에는 연장근무 시간이 포함됩니다.",
      ].join("\n")
    );
  });

  it("실패해도 예외 없이 — 블록", async () => {
    const block = await workHoursBlock(planWorkHours(undefined, NOW), async () => { throw new Error("x"); });
    expect(block).toContain("| 이번 달(10월) | — | — | — | — |");
    expect(block).toContain("> 근무시간을 조회하지 못했습니다.");
  });

  it("오지 않은 달·연 단위는 빈 문자열(근무현황에 붙이지 않음)", async () => {
    const { calls, fetch } = okFetch(OCT);
    expect(await workHoursBlock(planWorkHours("11월", NOW), fetch)).toBe("");
    expect(await workHoursBlock(planWorkHours("올해", NOW), fetch)).toBe("");
    expect(calls).toHaveLength(0);
  });
});

describe("handler — 근무현황(work_status)에 근무시간 블록 (계약 §5, US1)", () => {
  const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");
  beforeAll(() => freezeClock(NOW));
  afterAll(() => jest.useRealTimers());

  const WS_ROWS = [
    { workYmd: "20261019", week: "MON", workComment: "출근", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", inTime: "0855", outTime: "1810" },
  ];
  const respondWith = ({ home = () => ({ Map: OCT }), ws = () => ({ DATA: WS_ROWS }) } = {}) => (req) => {
    if (req.path === HOME_PATH) return home(req);
    if (req.path === "/TAAWrkTimeStatusMgr.do") return ws(req);
    throw new Error(`unexpected ${req.path}`);
  };

  it("근무시간 표 → 근무현황 표 순서", async () => {
    const { output, calls } = await runHandler("hr-attendance", { query_type: "work_status" }, respondWith());
    const iHome = output.indexOf("| 이번 달(10월) | 82.5 | 171.0 | 224.0 | 88.5 |");
    const iWs = output.indexOf("| 일자 |");
    expect(output.startsWith("## HR 근태 - 근무현황 요약\n\n| 구분 | 누적 근로 |")).toBe(true);
    expect(iHome).toBeGreaterThan(0);
    expect(iWs).toBeGreaterThan(iHome);
    expect(calls.map((c) => c.path).sort()).toEqual([HOME_PATH, "/TAAWrkTimeStatusMgr.do"].sort());
  });

  it("두 조회를 동시에 시작한다(근무현황 응답이 근무시간 요청을 기다려도 멈추지 않음)", async () => {
    let homeAsked;
    const homeSeen = new Promise((r) => (homeAsked = r));
    const respond = respondWith({
      home: () => {
        homeAsked();
        return { Map: OCT };
      },
      ws: async () => {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("sequential")), 300));
        await Promise.race([homeSeen, timeout]);
        return { DATA: WS_ROWS };
      },
    });
    const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, respond);
    expect(output).toContain("| 일자 |");
    expect(output).toContain("82.5");
  });

  it("근무시간 실패 → — 줄 + 안내, 근무현황 표는 그대로", async () => {
    const respond = respondWith({ home: () => ({ __raw: { ok: false, status: 500, body: "x" } }) });
    const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, respond);
    expect(output).toContain("| 이번 달(10월) | — | — | — | — |");
    expect(output).toContain("> 근무시간을 조회하지 못했습니다.");
    expect(output).toContain("| 일자 |");
  });

  it("근무현황 오류 → 기존 오류 문구만(근무시간 표 없음)", async () => {
    const respond = respondWith({ ws: () => ({ __raw: { ok: false, status: 500, body: "x" } }) });
    const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, respond);
    expect(output).not.toContain("누적 근로");
    expect(output).toMatch(/⚠️/);
  });

  it("연 단위 근무현황에는 근무시간을 붙이지 않는다(조회도 안 함)", async () => {
    const { output, calls } = await runHandler("hr-attendance", { query_type: "work_status", year_month: "올해" }, respondWith());
    expect(output).not.toContain("누적 근로");
    expect(calls.some((c) => c.path === HOME_PATH)).toBe(false);
  });

  it("지난 달 근무현황은 그 달 말일 기준 근무시간", async () => {
    const { output, calls } = await runHandler("hr-attendance", { query_type: "work_status", year_month: "9월" }, respondWith({ home: () => ({ Map: SEP }) }));
    expect(output).toContain("| 9월 | 176.0 | 168.0 | 220.0 | — |");
    expect(calls.find((c) => c.path === HOME_PATH).form.searchYmd).toBe("2026-09-30");
  });

  it("work_hours는 근무시간 표만(근무현황 조회 없음)", async () => {
    const { output, calls } = await runHandler("hr-attendance", { query_type: "work_hours" }, respondWith());
    expect(calls.map((c) => c.path)).toEqual([HOME_PATH]);
    expect(output).toContain("| 이번 달(10월) | 82.5 |");
    expect(output).not.toContain("| 일자 |");
  });
});

describe("코드 리뷰 반영 (019 M-2·M-7·L-2)", () => {
  it.each([["abc"], ["13월"], ["202600"]])("해석하지 못한 기간 %p → unknown(조회 안 함, 이번 달로 바꾸지 않음)", async (ym) => {
    const plan = planWorkHours(ym, NOW);
    expect(plan.kind).toBe("unknown");
    const { calls, fetch } = okFetch(OCT);
    expect(await runWorkHours(plan, fetch)).toMatch(/기간을 해석하지 못해/);
    expect(await workHoursBlock(plan, fetch)).toBe("");
    expect(calls).toHaveLength(0);
  });

  it("연장근로 가능(basTime2)이 음수면 최대 가능은 —", () => {
    expect(toWorkHours({ workT: 82.5, basTime1: 171, basTime2: -53 }, planWorkHours(undefined, NOW))).toMatchObject({ ok: true, max: null });
  });

  describe("handler", () => {
    const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");
    beforeAll(() => freezeClock(NOW));
    afterAll(() => jest.useRealTimers());
    const respond = (ws) => (req) => (req.path === HOME_PATH ? { Map: OCT } : ws);

    it("근무현황 0건이어도 근무시간 표는 붙고, 없음 안내가 이어진다(M-7)", async () => {
      const { output } = await runHandler("hr-attendance", { query_type: "work_status" }, respond({ DATA: [] }));
      expect(output.startsWith("## HR 근태 - 근무현황 요약\n\n| 구분 | 누적 근로 |")).toBe(true);
      expect(output).toContain("| 이번 달(10월) | 82.5 |");
      expect(output).toMatch(/근무현황 요약\*\* 조회 결과가 존재하지 않습니다/);
    });

    it("해석하지 못한 기간의 근무현황에는 근무시간을 붙이지 않는다(M-2·M-3)", async () => {
      const { output, calls } = await runHandler("hr-attendance", { query_type: "work_status", year_month: "abc" }, respond({ DATA: [{ workYmd: "20261019", week: "MON", mark: "NORMAL", inTime: "0855", outTime: "1810" }] }));
      expect(calls.some((c) => c.path === HOME_PATH)).toBe(false);
      expect(output).not.toContain("누적 근로");
    });
  });
});
