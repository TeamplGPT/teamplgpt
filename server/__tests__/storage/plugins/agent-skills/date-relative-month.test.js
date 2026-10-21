/**
 * "올해 3월"·"작년 3월"·"3월 전체" 같은 연도 상대 표현 + 월 (2026-10-21 사용자 확인 후 수정)
 * sugar-date 한국어 로케일은 "3월"·"작년"은 알지만 둘이 붙은 표현은 몰라 undefined였다 —
 * 그러면 월 단위 조회가 이번 달로 대체돼 "작년 3월 연장근무"에 이번 달 값이 나갈 수 있었다.
 */
const path = require("path");
const { freezeClock } = require("./helpers/hrHandlerHarness");

const { resolveDateParam } = require(path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills/_shared/dateResolver.js"
));

describe("연도 상대 표현 + 월", () => {
  beforeAll(() => freezeClock(new Date("2026-10-21T10:00:00+09:00")));
  afterAll(() => jest.useRealTimers());

  it.each([
    ["올해 3월", "202603"],
    ["금년 3월", "202603"],
    ["이번 년도 3월", "202603"],
    ["이번년도 3월", "202603"],
    ["올해 3 월", "202603"],
    ["작년 3월", "202503"],
    ["작년 12월", "202512"],
    ["지난해 3월", "202503"],
    ["지난 해 3월", "202503"],
    ["전년 3월", "202503"],
    ["재작년 1월", "202401"],
    ["내년 2월", "202702"],
    ["3월 전체", "202603"],
    ["작년 3월 전체", "202503"],
    ["2025년 3월 전체", "202503"],
    ["9월 한 달", "202609"],
  ])("year_month %p → %p", (input, expected) => {
    expect(resolveDateParam(input, "year_month")).toBe(expected);
  });

  it.each([
    ["저번 달", "202609"],
    ["저번달", "202609"],
    ["전월", "202609"],
    ["지지난달", "202608"],
    ["지지난 달", "202608"],
    ["두 달 전", "202608"],
    ["2달 전", "202608"],
    ["이달", "202610"],
    ["금월", "202610"],
    ["당월", "202610"],
    ["익월", "202611"],
    ["25년 3월", "202503"],
    ["10월달", "202610"],
    ["3월달", "202603"],
    ["시월", "202610"],
    ["유월", "202606"],
    ["십이월", "202612"],
    ["3월 초", "202603"],
    ["3월 중순", "202603"],
    ["3월 말", "202603"],
    ["올해 3월 초", "202603"],
    ["작년 12월 말", "202512"],
    ["이번 달까지", "202610"],
  ])("자주 쓰는 표현 %p → %p (2026-10-21 추가)", (input, expected) => {
    expect(resolveDateParam(input, "year_month")).toBe(expected);
  });

  it.each([["작년 13월"], ["올해 0월"]])("없는 달 %p → undefined", (input) => {
    expect(resolveDateParam(input, "year_month")).toBeUndefined();
  });

  it("year 형식은 연도만", () => {
    expect(resolveDateParam("작년 3월", "year")).toBe("2025");
  });

  it.each([
    ["3월", "202603"],
    ["지난달", "202609"],
    ["2025년 3월", "202503"],
    ["202503", "202503"],
    ["3", "202603"],
  ])("기존 표현은 그대로 %p → %p", (input, expected) => {
    expect(resolveDateParam(input, "year_month")).toBe(expected);
  });
});
