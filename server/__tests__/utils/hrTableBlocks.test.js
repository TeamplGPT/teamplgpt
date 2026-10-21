/**
 * HR 표 직접 출력 규칙 (specs/018 contracts/final-answer.md §1~§4)
 * tool 결과에서 사용자에게 보일 표 블록만 뽑고, 모델 문장을 거르고, 최종 답변을 조립한다.
 */
const {
  extractTableBlock,
  toModelResult,
  sanitizeModelText,
  joinFinalAnswer,
  TABLE_NOTICE,
} = require("../../utils/hrTableBlocks");
const { ANSWER_GUIDE } = require("../../storage/plugins/agent-skills/_shared/formatTable");

const ATT = "hr-attendance";

const OVERTIME = [
  "## HR 근태 - 연장근무 현황",
  "",
  "| 구분 | 한도 | 사용 | 잔여 |",
  "| --- | --- | --- | --- |",
  "| 이번 주(10/19 기준) | 12.0 | 4.0 | 8.0 |",
  "| 이번 달(10월) | 52.0 | 10.0 | 42.0 |",
  "",
  "> 사용 시간에는 결재 중인 신청 건이 포함됩니다.",
  "",
  "### 10월 연장근무 내역",
  "",
  "| 일자 | 시작 | 종료 | 연장시간 | 근무유형 | 사유 |",
  "| --- | --- | --- | --- | --- | --- |",
  "| 10/2(금) | 18:00 | 21:00 | 03:00 | 통상근무 | 배포 대응 |",
  "| 10/15(목) | 18:00 | 20:00 | 02:00 | 통상근무 | — |",
  "",
  "> [응답 형식] 위 한도 표는 표 그대로 보여주세요. 이 줄은 답변에 포함하지 마세요.",
].join("\n") + ANSWER_GUIDE;

describe("extractTableBlock", () => {
  it("제목·응답 형식·공통 응답 지침을 빼고 표·소제목·정보 줄을 글자 그대로 남긴다", () => {
    const block = extractTableBlock(ATT, OVERTIME);
    expect(block).toBe(
      [
        "| 구분 | 한도 | 사용 | 잔여 |",
        "| --- | --- | --- | --- |",
        "| 이번 주(10/19 기준) | 12.0 | 4.0 | 8.0 |",
        "| 이번 달(10월) | 52.0 | 10.0 | 42.0 |",
        "",
        "> 사용 시간에는 결재 중인 신청 건이 포함됩니다.",
        "",
        "### 10월 연장근무 내역",
        "",
        "| 일자 | 시작 | 종료 | 연장시간 | 근무유형 | 사유 |",
        "| --- | --- | --- | --- | --- | --- |",
        "| 10/2(금) | 18:00 | 21:00 | 03:00 | 통상근무 | 배포 대응 |",
        "| 10/15(목) | 18:00 | 20:00 | 02:00 | 통상근무 | — |",
      ].join("\n")
    );
  });

  it("내부 참조 줄과 파라미터 이름이 든 안내 줄은 빠진다(급여 지급 건)", () => {
    const result = [
      "## HR 급여 - 지급 건",
      "",
      "| 급여 건 |",
      "| ------ |",
      "| 2026-03-25 정기급여 |",
      "",
      "> 총 **1건**. 특정 건 상세는 query_type=payslip/deductions/payslip_summary + pay_item=코드값.",
      "> [내부 참조 — 다음 조회에만 쓰고 답변에 절대 쓰지 마세요.] 상세 조회의 pay_item 값: 2026-03-25 정기급여=20260325NN",
    ].join("\n");
    const block = extractTableBlock("hr-salary", result);
    expect(block).toBe("| 급여 건 |\n| ------ |\n| 2026-03-25 정기급여 |");
    expect(block).not.toMatch(/20260325NN|query_type|pay_item|내부 참조/);
  });

  it("조직도 — 내부 참조(조직코드) 줄이 빠진다", () => {
    const result = "## HR 인사 - 조직도\n\n| 조직 | 상위조직 |\n| --- | --- |\n| 개발1팀 | 개발본부 |\n\n> [내부 참조 — …] org_members 조회의 org_cd 값: 개발1팀=0303";
    expect(extractTableBlock("hr-personnel", result)).toBe("| 조직 | 상위조직 |\n| --- | --- |\n| 개발1팀 | 개발본부 |");
  });

  it("기간 머리 줄·[안내]·보조 줄 — 정보는 남기고 지시는 뺀다", () => {
    const result = [
      "## HR 근태 - 연장근무 현황",
      "",
      "> 조회 기간: 2026-01 ~ 2026-10 (2026년 1~10월, 월 단위 조회)",
      "> 조회되지 않은 달: 2026-03 (HR 시스템 호출 실패 (HTTP 500))",
      "> [안내] 답변에서 위 달이 빠졌다는 것만 짧게 밝히고(사유 설명 불필요), 결과를 그해 전체인 것처럼 말하지 마세요.",
      "",
      "| 월 | 한도 | 사용 | 잔여 |",
      "| --- | --- | --- | --- |",
      "| 2026-01 | 52.0 | 10.0 | 42.0 |",
    ].join("\n");
    const block = extractTableBlock(ATT, result);
    expect(block.split("\n").slice(0, 2)).toEqual([
      "> 조회 기간: 2026-01 ~ 2026-10 (2026년 1~10월, 월 단위 조회)",
      "> 조회되지 않은 달: 2026-03 (HR 시스템 호출 실패 (HTTP 500))",
    ]);
    expect(block).not.toMatch(/\[안내\]/);
  });

  it.each([
    ["거절", "hr-other-employee-refusal", "다른 직원의 정보는 조회할 수 없어요."],
    ["조회 불가", "hr-unsupported-info", "> [조회 없음] 이 질문은 HR 조회로 답할 수 있는 내용이 아닙니다."],
    ["오류", ATT, "> ⚠️ HR 세션이 만료되었습니다."],
    ["기록 없음", ATT, "## HR 근태 - 연장근무 현황\n\n> 2026년 연장근무 기록이 없습니다."],
    ["HR 아님", "web-browsing", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
  ])("표가 없거나 대상이 아니면 null — %s", (_, tool, text) => {
    expect(extractTableBlock(tool, text)).toBeNull();
  });

  it("표 머리줄에 파라미터 이름이 있으면 블록 전체를 붙이지 않는다(fail-closed, 018 C1)", () => {
    const result = "| 월 | 급여 건 | 코드(pay_item) |\n|---|---|---|\n| 2026-01 | 정기급여 | `20260125NN` |";
    expect(extractTableBlock("hr-salary", result)).toBeNull();
  });

  it("문자열이 아니면 null", () => {
    expect(extractTableBlock(ATT, undefined)).toBeNull();
    expect(extractTableBlock(ATT, { a: 1 })).toBeNull();
  });
});

describe("toModelResult", () => {
  it("블록이 있으면 [응답 형식] 줄을 지우고 [표 표시] 줄을 붙인다", () => {
    const out = toModelResult(OVERTIME, true);
    expect(out).not.toMatch(/\[응답 형식\]/);
    expect(out.trimEnd().endsWith(TABLE_NOTICE)).toBe(true);
    expect(out).toContain("| 이번 달(10월) | 52.0 | 10.0 | 42.0 |");
  });

  it("블록이 없으면 원문 그대로", () => {
    expect(toModelResult("> ⚠️ 오류", false)).toBe("> ⚠️ 오류");
  });
});

describe("sanitizeModelText", () => {
  it("모델이 쓴 표·제목·숫자 목록은 지우고 문장은 남긴다", () => {
    const text = [
      "이번 달 연장근무는 42시간 남았어요.",
      "",
      "### 연장근무 현황",
      "- **이번 주**: 한도 12.0시간, 사용 4.0시간",
      "1. 10/15: 18:00~20:00, 통상근무",
      "| 구분 | 한도 |",
      "| --- | --- |",
      "- 3월과 5월은 조회되지 않았어요",
      "",
      "",
      "필요하면 말씀해 주세요.",
    ].join("\n");
    expect(sanitizeModelText(text)).toBe(
      "이번 달 연장근무는 42시간 남았어요.\n\n- 3월과 5월은 조회되지 않았어요\n\n필요하면 말씀해 주세요."
    );
  });

  it("빈 값·문자열 아님은 빈 문자열", () => {
    expect(sanitizeModelText("")).toBe("");
    expect(sanitizeModelText(null)).toBe("");
  });
});

describe("joinFinalAnswer", () => {
  it("문장 뒤에 블록을 순서대로, 같은 블록은 한 번", () => {
    expect(joinFinalAnswer("요약 문장.", ["| a |\n| --- |\n| 1 |", "| b |\n| --- |\n| 2 |", "| a |\n| --- |\n| 1 |"])).toBe(
      "요약 문장.\n\n| a |\n| --- |\n| 1 |\n\n| b |\n| --- |\n| 2 |"
    );
  });

  it("문장이 비면 블록만", () => {
    expect(joinFinalAnswer("", ["| a |\n| --- |\n| 1 |"])).toBe("| a |\n| --- |\n| 1 |");
  });

  it("블록이 없으면 문장만", () => {
    expect(joinFinalAnswer("요약", [])).toBe("요약");
  });
});

describe("sanitizeModelText — 코드 리뷰 M-2·M-3", () => {
  it.each([
    ["이번 주: 한도 12.0시간, 사용 4.0시간"],
    ["- 사용: 10"],
  ])("표 값을 다시 늘어놓은 줄은 지운다: %p", (line) => {
    expect(sanitizeModelText(`요약.\n${line}`)).toBe("요약.");
  });

  it.each([
    ["2026. 6. 19. 정기급여 실지급액은 3,000,000원이에요."],
    ["이번 주 8시간, 이번 달 42시간 남았어요."],
    ["- 3월과 5월은 조회되지 않았어요"],
  ])("정상 문장은 남긴다: %p", (line) => {
    expect(sanitizeModelText(line)).toBe(line);
  });
});

describe("dropUnsupportedNumbers — 표·질문에 없는 시간·일 수치가 든 문장은 뺀다 (2026-10-21)", () => {
  const { dropUnsupportedNumbers } = require("../../utils/hrTableBlocks");
  const OT = "| 구분 | 한도 | 사용 | 잔여 |\n| --- | --- | --- | --- |\n| 이번 달(10월) | 53.14 | 0.0 | 53.14 |";

  it.each([
    ["이번 달 연장근무는 53시간 남았어요.", ""],
    ["약 53시간 남았어요.", ""],
    ["이번 달 연장근무는 53.14시간 남았어요.", "이번 달 연장근무는 53.14시간 남았어요."],
    ["아직 사용한 시간은 0시간이에요.", "아직 사용한 시간은 0시간이에요."],
    ["한도 53.14시간 중 0.0시간을 썼어요.", "한도 53.14시간 중 0.0시간을 썼어요."],
  ])("%p → %p", (text, expected) => {
    expect(dropUnsupportedNumbers(text, [OT])).toBe(expected);
  });

  it("여러 줄 중 바뀐 숫자가 든 줄만 뺀다", () => {
    const text = "이번 달 잔여는 53.14시간입니다.\n대략 53시간 정도 더 할 수 있어요.";
    expect(dropUnsupportedNumbers(text, [OT])).toBe("이번 달 잔여는 53.14시간입니다.");
  });

  it("날짜(10월 15일)는 수치로 보지 않는다", () => {
    expect(dropUnsupportedNumbers("10월 15일 기준 53.14시간 남았어요.", [OT])).toBe("10월 15일 기준 53.14시간 남았어요.");
  });

  it("사용자가 말한 수치는 쓸 수 있다", () => {
    const leave = "| 휴가종류 | 발생일수 | 사용일수 | 잔여일수 |\n| --- | --- | --- | --- |\n| 연차 | 23 | 1 | 22 |";
    expect(dropUnsupportedNumbers("3일 쉬어도 연차 22일이 남아 충분해요.", [leave], [3])).toBe("3일 쉬어도 연차 22일이 남아 충분해요.");
    expect(dropUnsupportedNumbers("3일 쉬어도 연차 22일이 남아 충분해요.", [leave], [])).toBe("");
  });

  it("단위 없는 숫자·표가 없으면 그대로", () => {
    expect(dropUnsupportedNumbers("총 2건이에요.", [OT])).toBe("총 2건이에요.");
    expect(dropUnsupportedNumbers("53시간 남았어요.", [])).toBe("53시간 남았어요.");
  });
});
