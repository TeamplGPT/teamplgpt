/**
 * 표 칸 값 정리 (specs/018 보안 리뷰 M1·M2) — 018부터 표는 시스템이 사용자 화면에 그대로 붙인다.
 * 칸 값의 | ·줄바꿈은 표를 깨뜨려 표 밖에 임의 줄을 만들고, [텍스트](javascript:…)는 위젯에서 링크가 된다.
 */
const path = require("path");
const { renderWhitelisted, safeCell } = require(path.resolve(__dirname, "../../../../storage/plugins/agent-skills/_shared/formatTable.js"));

describe("safeCell", () => {
  it.each([
    ["배포|대응", "배포/대응"],
    ["첫줄\n둘째줄", "첫줄 둘째줄"],
    ["a\r\n  b", "a b"],
    ["[공지](javascript:alert(1))", "[공지] (javascript:alert(1))"],
    ["[링크](https://evil.example)", "[링크] (https://evil.example)"],
    ["평범한 값", "평범한 값"],
    // 실서버 휴가종류 이름의 이모지는 그대로 둔다(사용자 결정 2026-10-20)
    ["연차✈️", "연차✈️"],
  ])("%p → %p", (input, expected) => {
    expect(safeCell(input)).toBe(expected);
  });
});

describe("renderWhitelisted 칸 값", () => {
  it("한 행이 한 줄로 유지되고 링크 문법이 깨진다", () => {
    const md = renderWhitelisted([{ TITLE: "연차 신청", MEMO: "개인 사유|병원\n[클릭](javascript:alert(1))" }], { TITLE: "제목", MEMO: "사유" });
    const rows = md.split("\n").filter((l) => l.startsWith("| 연차"));
    expect(rows).toEqual(["| 연차 신청 | 개인 사유/병원 [클릭] (javascript:alert(1)) |"]);
    expect(md).not.toMatch(/\]\(/);
  });
});

describe("연차 잔여 표 열 (사용자 결정 2026-10-20: 시작일·종료일 불필요)", () => {
  it("휴가종류·발생·사용·잔여만 나간다", () => {
    const { COLUMNS_BY_QT } = require(path.resolve(__dirname, "../../../../storage/plugins/agent-skills/hr-attendance/handler.js"));
    expect(Object.values(COLUMNS_BY_QT.annual_leave_balance)).toEqual(["휴가종류", "발생일수", "사용일수", "잔여일수"]);
  });
});
