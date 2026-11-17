/**
 * E2E 시나리오 날짜 자리표시자 — 실행하는 날에 따라 답이 바뀌는 시나리오용(specs/020).
 * {{LAST_MONTH_M}}: "지난달 근무현황"처럼 지난달 월(앞 0 없는 숫자) — EC-ALLOW-39가 "9월"로 고정돼 낡았다.
 */
const { fillDates, placeholderValues } = require("../../scripts/e2e-hr-skill/helpers/datePlaceholders");

// 서울 기준 날짜를 만든다(UTC 15:00 = 서울 다음날 00:00이라 정오로 둔다)
const seoulNoon = (ymd) => new Date(`${ymd}T12:00:00+09:00`);

describe("E2E 날짜 자리표시자", () => {
  it("{{LAST_MONTH_M}}는 서울 기준 지난달 월", () => {
    expect(placeholderValues(seoulNoon("2026-11-17")).LAST_MONTH_M).toBe("10");
    expect(placeholderValues(seoulNoon("2026-03-31")).LAST_MONTH_M).toBe("2");
  });

  it("1월이면 지난달은 12월", () => {
    expect(placeholderValues(seoulNoon("2027-01-05")).LAST_MONTH_M).toBe("12");
  });

  it("기대값 문자열 안의 자리표시자를 바꾼다", () => {
    const values = placeholderValues(seoulNoon("2026-11-17"));
    expect(fillDates(["\\| {{LAST_MONTH_M}}월 \\|"], values)).toEqual(["\\| 10월 \\|"]);
  });

  it("기존 자리표시자는 그대로 동작한다", () => {
    const values = placeholderValues(seoulNoon("2026-11-17"));
    expect(values.TODAY).toBe("20261117");
    expect(values.YESTERDAY_MD).toBe("11-16");
  });
});
