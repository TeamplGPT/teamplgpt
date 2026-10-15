/**
 * resolveYearPeriod 계약 테스트 (specs/015 contracts/period-resolver.md)
 * 기준일은 인자 now로 주입한다 — 시스템 시계에 의존하지 않는다.
 */
const path = require("path");
const { resolveYearPeriod } = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/periodResolver.js"
  )
);

const NOW = new Date("2026-10-15T12:00:00+09:00");

function monthsOf(year, last) {
  return Array.from({ length: last }, (_, i) => `${year}${String(i + 1).padStart(2, "0")}`);
}

const THIS_YEAR_RECORD = {
  year: "2026",
  start: "20260101",
  end: "20261015",
  months: monthsOf(2026, 10),
  isCurrentYear: true,
  label: "2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)",
};

describe("resolveYearPeriod — 연도 단위 표현", () => {
  it('"2026" record → 1/1~오늘, 10개월', () => {
    expect(resolveYearPeriod("2026", { kind: "record", now: NOW })).toEqual(THIS_YEAR_RECORD);
  });

  it('"2026" schedule → 1/1~12/31, 12개월', () => {
    expect(resolveYearPeriod("2026", { kind: "schedule", now: NOW })).toEqual({
      year: "2026",
      start: "20260101",
      end: "20261231",
      months: monthsOf(2026, 12),
      isCurrentYear: true,
      label: "2026-01-01 ~ 2026-12-31 (2026년 전체)",
    });
  });

  it.each(["2026년", "2026년도", "올해", "금년", "이번년도", "이번 년도", "이번해", "당해", 2026])(
    "%p record → 2026 record와 동일",
    (raw) => {
      expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toEqual(THIS_YEAR_RECORD);
    }
  );

  it.each([
    "이번 연도", "금년도", "당해연도", "당해년도", "올 한해", "올해 전체", "올해 전부",
    "2026년 전체", "2026 전체", "2026년도 전체", "올해 내내", "올 한해 동안",
  ])("%p record → 2026 record와 동일 (흔한 변형·범위 접미사)", (raw) => {
    expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toEqual(THIS_YEAR_RECORD);
  });

  it.each(["작년", "지난해", "전년도", "작년도", "전년", "지난년도", "작년 전체"])("%p record → 2025 전체(과거 연도는 12/31까지)", (raw) => {
    expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toEqual({
      year: "2025",
      start: "20250101",
      end: "20251231",
      months: monthsOf(2025, 12),
      isCurrentYear: false,
      label: "2025-01-01 ~ 2025-12-31 (2025년 전체)",
    });
  });

  it('"재작년" schedule → 2024 전체', () => {
    const p = resolveYearPeriod("재작년", { kind: "schedule", now: NOW });
    expect(p).toMatchObject({ year: "2024", start: "20240101", end: "20241231" });
    expect(p.months).toHaveLength(12);
  });

  it('"내년" record → 2027 전체(미래 연도는 kind 무관 12/31)', () => {
    const p = resolveYearPeriod("내년", { kind: "record", now: NOW });
    expect(p).toMatchObject({ year: "2027", end: "20271231", isCurrentYear: false });
    expect(p.months).toHaveLength(12);
  });

  it('"내후년" schedule → 2028', () => {
    expect(resolveYearPeriod("내후년", { kind: "schedule", now: NOW })).toMatchObject({
      year: "2028",
      start: "20280101",
      end: "20281231",
    });
  });

  it('공백은 모두 무시한다 — " 2 0 2 5 년 " → 2025 전체', () => {
    expect(resolveYearPeriod(" 2 0 2 5 년 ", { kind: "record", now: NOW })).toMatchObject({
      year: "2025",
      start: "20250101",
      end: "20251231",
    });
  });
});

describe("resolveYearPeriod — 연도 단위가 아니면 null (기존 경로 유지)", () => {
  it.each([
    "2026년 3월", "올해 3월", "3월", "지난달", "202503", "2026-03", "이번달", "오늘",
    "3월 전체", "이번달 전체", "2026년 3월 전체", "전체", "2021년 1년", "올해 상반기",
  ])(
    "%p → null",
    (raw) => {
      expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toBeNull();
    }
  );

  it.each([undefined, null, "", "   "])("%p → null", (raw) => {
    expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toBeNull();
  });

  it.each(["0315", "1234", "9999", "1899", "3000"])("%p → null (1900~2999 밖 또는 연도 아님)", (raw) => {
    expect(resolveYearPeriod(raw, { kind: "record", now: NOW })).toBeNull();
  });

  it("kind가 없거나 잘못되면 예외 — 호출부 실수를 조용히 넘기지 않는다", () => {
    expect(() => resolveYearPeriod("2026", { now: NOW })).toThrow(/kind/);
    expect(() => resolveYearPeriod("2026", { kind: "month", now: NOW })).toThrow(/kind/);
  });
});

describe("resolveYearPeriod — 경계 날짜", () => {
  it("1월 1일 올해 record → end 당일, 1개월", () => {
    const p = resolveYearPeriod("올해", { kind: "record", now: new Date("2026-01-01T12:00:00+09:00") });
    expect(p).toMatchObject({ start: "20260101", end: "20260101", months: ["202601"] });
  });

  it("12월 31일 올해 record → end 12/31, 12개월", () => {
    const p = resolveYearPeriod("올해", { kind: "record", now: new Date("2026-12-31T12:00:00+09:00") });
    expect(p.end).toBe("20261231");
    expect(p.months).toHaveLength(12);
  });

  it("서울 자정 직후(UTC로는 전년도 12/31) → 서울 기준 2026년", () => {
    const p = resolveYearPeriod("올해", { kind: "record", now: new Date("2025-12-31T15:30:00Z") });
    expect(p).toMatchObject({ year: "2026", start: "20260101", end: "20260101", months: ["202601"] });
  });

  it("now를 생략하면 현재 시각을 쓴다", () => {
    const p = resolveYearPeriod("올해", { kind: "schedule" });
    expect(p.year).toMatch(/^\d{4}$/);
    expect(p.end).toBe(`${p.year}1231`);
  });

  it("입력 객체를 변경하지 않는다", () => {
    const opts = Object.freeze({ kind: "record", now: NOW });
    expect(() => resolveYearPeriod("올해", opts)).not.toThrow();
  });
});
