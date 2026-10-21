/**
 * 시간 표시 자릿수 — 5240이 준 값 그대로(2026-10-21 사용자 확인).
 * 5240 홈 "금월잔여연장"은 53.14(소수 둘째 자리 절사)인데 챗봇은 53.1로 반올림해 보여줘 숫자가 달라 보였다.
 */
const path = require("path");
const { formatHours } = require(path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared/monthHours.js"));

describe("formatHours", () => {
  it.each([
    [53.14, "53.14"],
    ["53.14", "53.14"],
    [52, "52.0"],
    ["52", "52.0"],
    [53.1, "53.1"],
    [82.5, "82.5"],
    [53.149, "53.14"],
    [53.1428571, "53.14"],
    [-8, "-8.0"],
    [-8.25, "-8.25"],
    [0, "0.0"],
    ["1,234.5", "1234.5"],
  ])("%p → %p", (v, expected) => {
    expect(formatHours(v)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["abc"], ["0x10"]])("%p → —", (v) => {
    expect(formatHours(v)).toBe("—");
  });
});
