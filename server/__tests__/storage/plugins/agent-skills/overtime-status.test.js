/**
 * 연장근무 한도·사용·잔여 (specs/017) — _shared/overtimeStatus
 * 계약: specs/017-hr-overtime-limit/contracts/tool-output-overtime.md
 */
const path = require("path");
const { freezeClock } = require("./helpers/hrHandlerHarness");

const MOD = path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared/overtimeStatus.js");
const load = () => require(MOD);

const LIMIT = "/getMBLDclzWorkOtSchdul.do";
const PERSON = "/getMBLDclzWorkOtSchdulPerson.do";
const MARKER = "$SELF_STAFF_ID";

const self = (extra = {}) => ({
  staffNo: "20260001", staffNm: "오사공", orgNm: "개발팀", posNm: "책임",
  lmtOt: 12, useOt: 4, remOt: 8, lmtOt2: 52, useOt2: 10, remOt2: 42, ...extra,
});
const team = [
  { staffNo: "20260002", staffNm: "노지용", orgNm: "개발팀", lmtOt: 12, useOt: 9, remOt: 3, lmtOt2: 52, useOt2: 30, remOt2: 22 },
  { staffNo: "20260003", staffNm: "김기현", orgNm: "개발팀", lmtOt: 12, useOt: 7, remOt: 5, lmtOt2: 52, useOt2: 20, remOt2: 32 },
];
const entries = [
  { workYmd: "20261015", staHm: "1800", endHm: "2000", otTime: "02:00", wktypeNm: "통상근무", reason: "" },
  { workYmd: "20261002", staHm: "1800", endHm: "2100", otTime: "03:00", wktypeNm: "통상근무", reason: "배포 대응" },
];

const ok = (records) => ({ records, isEmpty: !records || records.length === 0 });

// fetch 스텁 — 요청을 기록하고 경로별 응답을 준다
function stubFetch({ limit = () => [self()], person = () => entries } = {}) {
  const calls = [];
  const fetch = async (req) => {
    calls.push(req);
    if (req.path === LIMIT) {
      const r = limit(req.form);
      return r && r.errorMessage ? r : ok(r);
    }
    if (req.path === PERSON) return ok(person(req.form));
    throw new Error(`unexpected path ${req.path}`);
  };
  return { calls, fetch };
}

beforeEach(() => freezeClock());
afterEach(() => jest.useRealTimers());

describe("본인 한정 (US4)", () => {
  it.each([
    ["이번 달", undefined],
    ["지난 달", "2026-03"],
  ])("%s: 한도 응답이 여러 행이면 다른 직원 값 없이 확인 실패 안내만", async (_, ym) => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self(), ...team] });
    const out = await runOvertime(planOvertime(ym), fetch);
    expect(out).toContain("본인 연장근무 현황을 확인하지 못했습니다");
    for (const leak of ["노지용", "김기현", "20260002", "20260003", "20260001", "오사공"]) {
      expect(out).not.toContain(leak);
    }
  });

  it("한도 응답이 0행이어도 확인 실패", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("본인 연장근무 현황을 확인하지 못했습니다");
  });

  it.each([undefined, "2026-03", "올해"])("모든 요청에 본인 마커를 넣는다 (%p)", async (ym) => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch();
    await runOvertime(planOvertime(ym), fetch);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.form.cmmSearchStaffId).toBe(MARKER);
  });

  it("toLimit: 1행일 때만 값, 아니면 failed", () => {
    const { toLimit } = load();
    expect(toLimit([self()], "week")).toMatchObject({ limit: 12, used: 4, remain: 8, failed: false });
    expect(toLimit([self()], "month")).toMatchObject({ limit: 52, used: 10, remain: 42, failed: false });
    expect(toLimit([self(), ...team], "month").failed).toBe(true);
    expect(toLimit([], "month").failed).toBe(true);
    expect(toLimit(self(), "month").failed).toBe(false); // 단일 객체 응답
  });
});

describe("planOvertime — 질문 기간별 계획 (data-model §5)", () => {
  it.each([
    [undefined, "current"],
    ["이번달", "current"],
    ["2026-10", "current"],
    ["2026-03", "month"],
    ["3월", "month"],
    ["2026-12", "future"],
    ["올해", "year"],
    ["작년", "year"],
    ["2026년", "year"],
    ["내년", "future"],
  ])("%p → %s", (ym, kind) => {
    expect(load().planOvertime(ym).kind).toBe(kind);
  });
});

describe("formatHours / resolveUsed", () => {
  it.each([
    [12, "12.0"],
    ["3.5", "3.5"],
    [0, "0.0"],
    [-2, "-2.0"],
    [null, "—"],
    [undefined, "—"],
    ["", "—"],
    ["abc", "—"],
  ])("formatHours(%p) → %p", (v, s) => {
    expect(load().formatHours(v)).toBe(s);
  });

  // research R5 — 사용이 비었는데 그 기간 내역이 0건이면 0, 내역이 있으면 모른다(null)
  it("resolveUsed", () => {
    const { resolveUsed } = load();
    expect(resolveUsed(4, 2)).toBe(4);
    expect(resolveUsed(null, 0)).toBe(0);
    expect(resolveUsed(null, 2)).toBeNull();
    expect(resolveUsed(null, null)).toBeNull(); // 내역 조회 안 함·실패
  });
});

describe("이번 달 (US1, 계약 §1)", () => {
  it("주간·월간 2줄 표 + 이번 달 내역 + 사실 문장 + 응답 형식", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch();
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("## HR 근태 - 연장근무 현황");
    expect(out).toContain("| 구분 | 한도 | 사용 | 잔여 |");
    expect(out).toContain("| 이번 주(10/15 기준) | 12.0 | 4.0 | 8.0 |");
    expect(out).toContain("| 이번 달(10월) | 52.0 | 10.0 | 42.0 |");
    expect(out).toContain("> 사용 시간에는 결재 중인 신청 건이 포함됩니다.");
    expect(out).toContain("### 10월 연장근무 내역");
    expect(out).toContain("| 일자 | 시작 | 종료 | 연장시간 | 근무유형 | 사유 |");
    // 오래된 순, M/D(요일), HH:MM, 빈 사유 —
    const first = out.indexOf("| 10/2(금) | 18:00 | 21:00 | 03:00 | 통상근무 | 배포 대응 |");
    const second = out.indexOf("| 10/15(목) | 18:00 | 20:00 | 02:00 | 통상근무 | — |");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(out).toMatch(/\[응답 형식\][^\n]*잔여를 첫 문장/);
    expect(out).not.toMatch(/20260001|staffNo|오사공|getMBL|searchType/);
  });

  it("요청: 주간·월간 기준일 = 오늘, 내역 = 1일~오늘, 셋을 동시에 보낸다", async () => {
    const { planOvertime, runOvertime } = load();
    let inFlight = 0;
    let maxInFlight = 0;
    const calls = [];
    const fetch = async (req) => {
      calls.push(req);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return ok(req.path === LIMIT ? [self()] : entries);
    };
    await runOvertime(planOvertime(undefined), fetch);
    expect(maxInFlight).toBe(3);
    const forms = calls.map((c) => ({ path: c.path, ...c.form }));
    expect(forms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: LIMIT, searchType: "2", searchBaseSYmd: "2026-10-15" }),
        expect.objectContaining({ path: LIMIT, searchType: "3", searchBaseSYmd: "2026-10-15" }),
        expect.objectContaining({ path: PERSON, searchBaseSYmd: "2026-10-01", searchBaseEYmd: "2026-10-15" }),
      ])
    );
    for (const c of calls) expect(c.form).not.toHaveProperty("cmd");
  });

  it("한도가 비어 있으면 0.0이 아니라 —", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ lmtOt: null, lmtOt2: null })] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 주(10/15 기준) | — | 4.0 | 8.0 |");
    expect(out).toContain("| 이번 달(10월) | — | 10.0 | 42.0 |");
  });

  it("한도 조회 오류는 그 오류 문구를 그대로 돌려준다", async () => {
    const { planOvertime, runOvertime } = load();
    const err = "> ⚠️ HR 세션이 만료되었습니다. 다시 로그인해 주세요.";
    const { fetch } = stubFetch({ limit: () => ({ errorMessage: err }) });
    expect(await runOvertime(planOvertime(undefined), fetch)).toBe(err);
  });

  it("내역 조회만 실패하면 한도 표는 보이고 내역을 조회하지 못했다고 적는다", async () => {
    const { planOvertime, runOvertime } = load();
    const calls = [];
    const fetch = async (req) => {
      calls.push(req);
      return req.path === LIMIT ? ok([self()]) : { errorMessage: "> ⚠️ 조회 실패." };
    };
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 달(10월) | 52.0 | 10.0 | 42.0 |");
    expect(out).toContain("> 10월 연장근무 내역은 조회하지 못했습니다.");
    expect(out).not.toContain("기록이 없습니다");
  });
});

describe("지난 달 (US1, 계약 §2)", () => {
  it("월간 1줄 + 그 달 내역, 주간 줄 없음, 기준일 = 말일", async () => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch();
    const out = await runOvertime(planOvertime("2026-03"), fetch);
    expect(out).toContain("| 3월 | 52.0 | 10.0 | 42.0 |");
    expect(out).not.toContain("이번 주");
    expect(out).toContain("### 3월 연장근무 내역");
    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c.path === LIMIT).form).toMatchObject({ searchType: "3", searchBaseSYmd: "2026-03-31" });
    expect(calls.find((c) => c.path === PERSON).form).toMatchObject({ searchBaseSYmd: "2026-03-01", searchBaseEYmd: "2026-03-31" });
  });

  it("다른 해의 달은 연도를 붙인다", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch();
    const out = await runOvertime(planOvertime("2025-02"), fetch);
    expect(out).toContain("| 2025년 2월 | 52.0 | 10.0 | 42.0 |");
    expect(out).toContain("### 2025년 2월 연장근무 내역");
  });

  it("미래 달은 조회하지 않는다", async () => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch();
    const out = await runOvertime(planOvertime("2026-12"), fetch);
    expect(calls).toHaveLength(0);
    expect(out).toContain("2026년 12월은 아직 연장근무 기록이 없습니다");
  });
});

describe("연장근무 없음 (US2, 계약 §1-a)", () => {
  it("이번 달 내역 0건 → 기록 없음 문장 + 응답 형식, '1건' 없음", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt: 0, remOt: 12, useOt2: 0, remOt2: 52 })], person: () => [] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 주(10/15 기준) | 12.0 | 0.0 | 12.0 |");
    expect(out).toContain("| 이번 달(10월) | 52.0 | 0.0 | 52.0 |");
    expect(out).toContain("> 이번 달(10월) 연장근무 기록이 없습니다.");
    expect(out).toMatch(/\[응답 형식\][^\n]*"1건"/);
    expect(out).not.toContain("### 10월 연장근무 내역");
    expect(out.replace(/\[응답 형식\][^\n]*/g, "")).not.toContain("1건");
  });

  it("지난 달 → 'N월 연장근무 기록이 없습니다'", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt2: 0, remOt2: 52 })], person: () => [] });
    const out = await runOvertime(planOvertime("2026-02"), fetch);
    expect(out).toContain("> 2월 연장근무 기록이 없습니다.");
  });

  it("한도 0/0/0도 그대로 보인다", async () => {
    const { planOvertime, runOvertime } = load();
    const zero = { lmtOt: 0, useOt: 0, remOt: 0, lmtOt2: 0, useOt2: 0, remOt2: 0 };
    const { fetch } = stubFetch({ limit: () => [self(zero)], person: () => [] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 달(10월) | 0.0 | 0.0 | 0.0 |");
  });

  it("사용이 비어 있고 내역 0건이면 0.0 (R5)", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt: null, useOt2: null })], person: () => [] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 달(10월) | 52.0 | 0.0 | 42.0 |");
  });

  it("사용이 비어 있고 내역이 있으면 — (R5)", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt2: null })] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 달(10월) | 52.0 | — | 42.0 |");
  });
});

describe("연 단위 (US3, 계약 §3)", () => {
  // 1월 정상, 2월 무연장, 3월 오류, 5월 팀 혼입, 7월 0행(재직 전 등), 나머지 사용 10
  const yearLimit = (form) => {
    const m = form.searchBaseSYmd.slice(5, 7);
    if (m === "02") return [self({ useOt2: 0, remOt2: 52 })];
    if (m === "03") return { errorMessage: "> ⚠️ HR 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
    if (m === "05") return [self(), ...team];
    if (m === "07") return [];
    return [self()];
  };

  it("월별 표 + 합계 줄 + 없는 달 + 실패 달", async () => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch({ limit: yearLimit });
    const out = await runOvertime(planOvertime("올해"), fetch);
    expect(calls.every((c) => c.path === LIMIT && c.form.searchType === "3")).toBe(true);
    expect(calls.map((c) => c.form.searchBaseSYmd)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
      "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-15",
    ]);
    expect(out).toContain("> 조회 기간: 2026-01 ~ 2026-10");
    expect(out).toContain("| 월 | 한도 | 사용 | 잔여 |");
    expect(out).toContain("| 2026-01 | 52.0 | 10.0 | 42.0 |");
    expect(out).toContain("| 2026-02 | 52.0 | 0.0 | 52.0 |");
    expect(out).toContain("| 2026-03 | — | — | — |");
    expect(out).toContain("| 2026-05 | — | — | — |");
    expect(out).toContain("> 조회되지 않은 달: 2026-03, 2026-05 (표에 —로 표시)");
    expect(out).not.toMatch(/조회되지 않은 달:[^\n]*오류/);
    expect(out).not.toContain("조회 실패");
    expect(out).toContain("| 2026-07 | — | — | — |");
    expect(out).toContain("| 합계 (조회된 8개월) | — | 60.0 | — |");
    expect(out).toContain("> 연장근무가 없는 달: 2월");
    expect(out).toContain("> 조회되지 않은 달:");
    expect(out).toMatch(/\[응답 형식\][^\n]*합계는 표의 마지막 줄/);
    expect(out).not.toMatch(/노지용|김기현|2026000[123]/);
  });

  it("작년 → 12개월, 기준일 = 각 달 말일", async () => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch();
    const out = await runOvertime(planOvertime("작년"), fetch);
    expect(calls).toHaveLength(12);
    expect(calls[1].form.searchBaseSYmd).toBe("2025-02-28");
    expect(calls[11].form.searchBaseSYmd).toBe("2025-12-31");
    expect(out).toContain("| 합계 | — | 120.0 | — |");
  });

  it("모든 달 0 → 'YYYY년 연장근무 기록이 없습니다'", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt2: 0, remOt2: 52 })] });
    const out = await runOvertime(planOvertime("올해"), fetch);
    expect(out).toContain("> 2026년 연장근무 기록이 없습니다.");
    expect(out).not.toContain("연장근무가 없는 달:");
  });

  it("내년 → 조회 없음", async () => {
    const { planOvertime, runOvertime } = load();
    const { calls, fetch } = stubFetch();
    const out = await runOvertime(planOvertime("내년"), fetch);
    expect(calls).toHaveLength(0);
    expect(out).toContain("2027년은 아직 연장근무 기록이 없습니다");
  });

  it("첫 달 오류는 그 오류 문구를 그대로 돌려준다(runMonthly 승계)", async () => {
    const { planOvertime, runOvertime } = load();
    const err = "> ⚠️ HR 세션이 만료되었습니다.";
    const { fetch } = stubFetch({ limit: () => ({ errorMessage: err }) });
    expect(await runOvertime(planOvertime("올해"), fetch)).toBe(err);
  });
});

describe("코드 리뷰 반영 (017 T032)", () => {
  it("주간 줄은 사용이 비어도 0.0으로 바꾸지 않는다 — 주 범위가 이번 달 내역과 다를 수 있다(M-1)", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ limit: () => [self({ useOt: null, remOt: null, useOt2: null })], person: () => [] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 주(10/15 기준) | 12.0 | — | — |");
    expect(out).toContain("| 이번 달(10월) | 52.0 | 0.0 | 42.0 |");
  });

  it("사유에 | 나 줄바꿈이 있어도 표가 깨지지 않는다(M-3)", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ person: () => [{ ...entries[1], reason: "배포|대응\n둘째줄" }] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 10/2(금) | 18:00 | 21:00 | 03:00 | 통상근무 | 배포/대응 둘째줄 |");
  });

  it("사유의 링크 문법은 깨진다(보안 리뷰 M1)", async () => {
    const { planOvertime, runOvertime } = load();
    const { fetch } = stubFetch({ person: () => [{ ...entries[1], reason: "[클릭](javascript:alert(1))" }] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| [클릭] (javascript:alert(1)) |");
    expect(out).not.toMatch(/\]\(/);
  });

  it("대문자 키(LMT_OT2 등) 응답도 끝까지 처리한다(L-7)", async () => {
    const { planOvertime, runOvertime } = load();
    const upper = { STAFF_NO: "1", LMT_OT: 12, USE_OT: 4, REM_OT: 8, LMT_OT2: 52, USE_OT2: 10, REM_OT2: 42 };
    const entry = { WORK_YMD: "20261002", STA_HM: "1800", END_HM: "2100", OT_TIME: "03:00", WKTYPE_NM: "통상근무", REASON: "배포" };
    const { fetch } = stubFetch({ limit: () => [upper], person: () => [entry] });
    const out = await runOvertime(planOvertime(undefined), fetch);
    expect(out).toContain("| 이번 달(10월) | 52.0 | 10.0 | 42.0 |");
    expect(out).toContain("| 10/2(금) | 18:00 | 21:00 | 03:00 | 통상근무 | 배포 |");
  });

  it.each([["0x10"], ["1e2"], ["12시간"]])("숫자가 아닌 형식(%p)은 —(L-3)", (v) => {
    expect(load().formatHours(v)).toBe("—");
  });

  it.each([["202500"], ["202613"]])("잘못된 월(%p)은 이번 달로 처리한다(L-4)", (ym) => {
    expect(load().planOvertime(ym).kind).toBe("current");
  });

  it("연 단위 첫 달 응답이 여러 행이면 고정 실패 문구(L-1)", async () => {
    const { planOvertime, runOvertime, SELF_CHECK_FAIL } = load();
    const { fetch } = stubFetch({ limit: () => [self(), ...team] });
    expect(await runOvertime(planOvertime("2025"), fetch)).toBe(SELF_CHECK_FAIL);
  });
});
