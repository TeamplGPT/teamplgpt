const {
  isChatHistoryOnlyRequest,
  filterToolsForChatHistoryOnly,
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

  // ── High 잔여: FN(미탐) → 취업규칙 RAG 재유입 막기
  it.each([
    "대화 요약해줘",
    "지금까지 대화 요약해줘",
    "이 채팅 요약해줘",
    "지난 대화 요약",
    "우리 대화 정리해줘",
    "please summarize previous messages",
  ])("대화 회상 FN 보강: %s → true", (msg) => {
    expect(isChatHistoryOnlyRequest(msg)).toBe(true);
  });

  // ── High 잔여: FP(오탐) → 규정/급여 "다시 설명"에 RAG가 꺼지면 안 됨
  it.each([
    "급여명세서 다시 설명해줘",
    "규정 다시 설명해줘",
    "취업규칙 다시 설명해줘",
    "다시 설명해줘",
  ])("다시 설명만으로는 false: %s", (msg) => {
    expect(isChatHistoryOnlyRequest(msg)).toBe(false);
  });

  it("방금/이전 대화 맥락의 다시 설명은 true", () => {
    expect(
      isChatHistoryOnlyRequest("방금 말한 내용 다시 설명해줘")
    ).toBe(true);
    expect(
      isChatHistoryOnlyRequest("이전 대화 다시 설명해줘")
    ).toBe(true);
  });
});

describe("filterToolsForChatHistoryOnly", () => {
  const tools = [
    { type: "function", name: "hr-personnel" },
    { type: "function", name: "hr-attendance" },
    { type: "function", name: "web_search_preview" },
    { type: "web_search_preview" },
  ];

  it("history-only면 HR tool을 뺀다", () => {
    expect(
      filterToolsForChatHistoryOnly(tools, "이전 대화만 요약해줘")
    ).toEqual([
      { type: "function", name: "web_search_preview" },
      { type: "web_search_preview" },
    ]);
  });

  it("일반 질문이면 tools 그대로", () => {
    expect(filterToolsForChatHistoryOnly(tools, "내 연차 알려줘")).toEqual(
      tools
    );
  });

  it("agent skill 이름 배열에서도 rag-memory·hr- 를 뺀다", () => {
    expect(
      filterToolsForChatHistoryOnly(
        ["rag-memory", "@@hr-personnel", "web-scraping"],
        "지금까지 뭐 물어봤지?"
      )
    ).toEqual(["web-scraping"]);
  });
});
