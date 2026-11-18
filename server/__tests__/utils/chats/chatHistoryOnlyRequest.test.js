const {
  isChatHistoryOnlyRequest,
} = require("../../../utils/chats/chatHistoryOnlyRequest");

describe("isChatHistoryOnlyRequest", () => {
  it("새로 조회하지 말고 이전 대화 요약 → true", () => {
    expect(
      isChatHistoryOnlyRequest(
        "새로 조회하지 말고 이전 대화 내용을 요약해줘."
      )
    ).toBe(true);
  });

  it("이전 대화만 요약 → true", () => {
    expect(isChatHistoryOnlyRequest("이전 대화만 요약해줘")).toBe(true);
  });

  it("이 대화 내용 정리 → true", () => {
    expect(isChatHistoryOnlyRequest("이 대화 내용 정리해줘")).toBe(true);
  });

  it("summarize this conversation → true", () => {
    expect(isChatHistoryOnlyRequest("summarize this conversation")).toBe(true);
  });

  it("근무현황 요약은 데이터 조회라 false", () => {
    expect(isChatHistoryOnlyRequest("올해 근무현황 요약해줘")).toBe(false);
  });

  it("급여 요약 → false", () => {
    expect(isChatHistoryOnlyRequest("이번 달 급여 요약 알려줘")).toBe(false);
  });

  it("지금까지 뭐 물어봤지 → true (요약 단어 없어도)", () => {
    expect(isChatHistoryOnlyRequest("지금까지 뭐 물어봤지?")).toBe(true);
  });

  it("방금 말한 거만 다시 설명해줘 → true", () => {
    expect(isChatHistoryOnlyRequest("방금 말한 거만 다시 설명해줘")).toBe(
      true
    );
  });

  it("일반 질문 → false", () => {
    expect(isChatHistoryOnlyRequest("내 연차 잔여일수 알려줘")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isChatHistoryOnlyRequest("")).toBe(false);
    expect(isChatHistoryOnlyRequest(null)).toBe(false);
  });
});
