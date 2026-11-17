/**
 * 할일·미결 건수(todo_count) — 실측 응답 래퍼 {"todoCnt":[{cnt1,cnt2,cnt3}]} (5240corp, 2026-11-18)
 * 래퍼를 못 풀어 건수가 하나도 안 나오고 "남은 일 없음"으로 답하던 문제.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

describe("todo_count 실측 응답", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  it("todoCnt 래퍼를 풀어 할일·쪽지·미결 결재 건수를 표로 보여준다", async () => {
    const { output } = await runHandler("hr-personnel", { query_type: "todo_count" }, () => ({
      todoCnt: [{ cnt1: 2, cnt2: 1, cnt3: 3 }],
    }));
    expect(output).toMatch(/\| 미확인 할일 \| 미확인 쪽지 \| 미결 결재 \|/);
    expect(output).toMatch(/\| 2 \| 1 \| 3 \|/);
  });

  it("건수가 모두 0이어도 '조회 결과 없음'이 아니라 0건으로 보여준다", async () => {
    const { output } = await runHandler("hr-personnel", { query_type: "todo_count" }, () => ({
      todoCnt: [{ cnt1: 0, cnt2: 0, cnt3: null }],
    }));
    expect(output).toMatch(/\| 0 \| 0 \|/);
  });
});
