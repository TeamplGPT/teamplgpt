/**
 * HR 날짜는 서버 시간대와 무관하게 한국 시간으로 해석한다.
 * 서버가 UTC로 돌면 서울 기준 매월 1일 00:00~08:59에 "이번달"이 지난달로 해석되던 문제.
 *
 * 시간대는 프로세스 시작 때 정해져야 해서(jest 안에서 process.env.TZ를 바꾸면 반영되지 않음)
 * TZ를 준 별도 node 프로세스에서 시각을 고정해 돌린다.
 */
const path = require("path");
const { execFileSync } = require("child_process");

const SHARED = path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared");

// 서울 2026-11-01 01:30 = UTC 2026-10-31 16:30
const SEOUL_NOV_1_0130 = new Date("2026-11-01T01:30:00+09:00").getTime();

const PROBE = `
const FIXED = Number(process.env.FAKE_NOW);
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
};
const shared = process.env.SHARED;
const out = {};
try {
  const { seoulWallClock } = require(shared + "/seoulClock.js");
  const d = seoulWallClock();
  out.wall = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];
} catch (e) { out.wall = "ERR " + e.message.split("\\n")[0]; }
const { resolveDateParam } = require(shared + "/dateResolver.js");
out.thisMonth = resolveDateParam("이번달", "year_month");
out.lastMonth = resolveDateParam("지난달", "year_month");
out.march = resolveDateParam("3", "year_month");
const s = require(shared + "/hrSession.js");
out.today = s.todayYmd();
out.todayDashed = s.todayDashed();
out.monthsAgo18 = s.monthsAgoFirstYmd(18);
process.stdout.write(JSON.stringify(out));
`;

function probe(tz) {
  const raw = execFileSync(process.execPath, ["-e", PROBE], {
    env: { ...process.env, TZ: tz, FAKE_NOW: String(SEOUL_NOV_1_0130), SHARED },
    encoding: "utf8",
  });
  return JSON.parse(raw);
}

describe.each([["UTC"], ["America/New_York"], ["Asia/Seoul"]])("서버 시간대 %s, 서울 11/1 01:30", (tz) => {
  let out;
  beforeAll(() => {
    out = probe(tz);
  });

  it("seoulWallClock의 로컬 날짜가 서울 날짜와 같다", () => {
    expect(out.wall).toEqual([2026, 11, 1, 1]);
  });

  it("'이번달' → 202611, '지난달' → 202610, '3' → 202603", () => {
    expect([out.thisMonth, out.lastMonth, out.march]).toEqual(["202611", "202610", "202603"]);
  });

  it("오늘 날짜·N개월 전 1일도 서울 기준", () => {
    expect([out.today, out.todayDashed, out.monthsAgo18]).toEqual(["20261101", "2026-11-01", "20250501"]);
  });
});
