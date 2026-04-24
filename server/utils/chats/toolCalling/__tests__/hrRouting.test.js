"use strict";

const {
  isPersonnelSearchGraduateRegionQuery,
  routeHrToolsForMessage,
} = require("../hrRouting");

describe("hrRouting", () => {
  const openAiTools = [
    { type: "function", name: "hr-attendance" },
    { type: "function", name: "hr-personnel-search" },
    { type: "web_search_preview" },
  ];

  it("지역 대학 졸업자 질의는 hr-personnel-search와 web_search_preview를 남기고 tool_choice required를 반환한다", () => {
    const routed = routeHrToolsForMessage({
      tools: openAiTools,
      providerFormat: "openai-responses",
      message: "경상도 지역 대학교 졸업자들을 알려줘",
    });

    expect(routed.tools).toEqual([
      { type: "function", name: "hr-personnel-search" },
      { type: "web_search_preview" },
    ]);
    expect(routed.toolChoice).toBe("required");
  });

  it("E125 문구도 지역 대학 졸업 직원 검색으로 인식한다", () => {
    expect(
      isPersonnelSearchGraduateRegionQuery(
        "경상도 지역 대학을 졸업한 직원목록 알려줘"
      )
    ).toBe(true);
  });

  it("일반 HR 질의는 도구 목록을 변경하지 않는다", () => {
    const routed = routeHrToolsForMessage({
      tools: openAiTools,
      providerFormat: "openai-responses",
      message: "이번 달 급여명세서 조회해줘",
    });

    expect(routed.tools).toBe(openAiTools);
    expect(routed.toolChoice).toBeNull();
  });

  it("대상 hr-personnel-search function이 없으면 web_search_preview만으로 라우팅하지 않는다", () => {
    const tools = [
      { type: "function", name: "hr-attendance" },
      { type: "web_search_preview" },
    ];
    const routed = routeHrToolsForMessage({
      tools,
      providerFormat: "openai-responses",
      message: "경상도 지역 대학교 졸업자들을 알려줘",
    });

    expect(routed.tools).toBe(tools);
    expect(routed.toolChoice).toBeNull();
  });

  it("chat-completions 형식에서도 function.name으로 대상 도구를 찾는다", () => {
    const routed = routeHrToolsForMessage({
      tools: [
        { type: "function", function: { name: "hr-salary" } },
        { type: "function", function: { name: "hr-personnel-search" } },
      ],
      providerFormat: "chat-completions",
      message: "부산 지역 대학 출신 직원 검색",
    });

    expect(routed.tools).toEqual([
      { type: "function", function: { name: "hr-personnel-search" } },
    ]);
    expect(routed.toolChoice).toBeNull();
  });
});
