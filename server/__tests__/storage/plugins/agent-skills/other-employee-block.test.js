/**
 * 다른 직원 정보 차단 (specs/016 contracts/blocked-query-types.md)
 */
const path = require("path");
const {
  OTHER_EMPLOYEE_REFUSAL,
  isBlockedQueryType,
} = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/otherEmployee.js"
  )
);

describe("otherEmployee 모듈 — 제공 중단 조회 판정", () => {
  it.each([
    ["hr-attendance", "vacation_calendar"],
    ["hr-personnel", "birthday"],
    ["hr-approval", "pending"],
    ["hr-approval", "completed"],
    ["hr-approval", "rejected"],
    ["hr-approval", "referenced"],
  ])("%s %s → 제공 중단", (skill, qt) => {
    expect(isBlockedQueryType(skill, qt)).toBe(true);
  });

  it.each([
    ["hr-attendance", "annual_leave_balance"],
    ["hr-attendance", "leave_requests"],
    ["hr-attendance", "work_calendar"],
    ["hr-personnel", "org_members"],
    ["hr-personnel", "org_tree"],
    ["hr-personnel", "todo_count"],
    ["hr-personnel", "schedule_day"],
    ["hr-personnel", "schedule_titles"],
    ["hr-approval", "drafted"],
    ["hr-salary", "pending"],
    ["hr-attendance", undefined],
  ])("%s %s → 유지", (skill, qt) => {
    expect(isBlockedQueryType(skill, qt)).toBe(false);
  });

  it("거절 문구는 고정이며 가드 메시지 접두(> ⚠️)를 쓴다", () => {
    expect(OTHER_EMPLOYEE_REFUSAL).toBe(
      '> ⚠️ 다른 직원의 정보는 조회할 수 없어요. 본인 정보는 "내 연차 알려줘"처럼 물어봐 주세요.'
    );
  });

  it("실행 계층(utils/hrSelfDataNotice)의 거절 문구와 같다", () => {
    const notice = require(path.resolve(__dirname, "../../../../utils/hrSelfDataNotice"));
    expect(notice.OTHER_EMPLOYEE_REFUSAL).toBe(OTHER_EMPLOYEE_REFUSAL);
  });
});

// ─── handler 진입부 거절 (US2) ─────────────────────────────────────────────
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const ANY_DATA = () => ({ DATA: [{ title: "홍길동 연차", STAFF_NM: "김철수", APPL_STAFF_NM: "이건종", TITLE: "연차 신청" }] });

describe("제공 중단 조회는 HR 호출 없이 거절한다 (US2)", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  it.each([
    ["hr-attendance", "vacation_calendar", {}],
    ["hr-attendance", "vacation_calendar", { year_month: "올해" }],
    ["hr-personnel", "birthday", {}],
    ["hr-personnel", "birthday", { year_month: "3월" }],
    ["hr-approval", "pending", {}],
    ["hr-approval", "completed", { year_month: "작년" }],
    ["hr-approval", "rejected", {}],
    ["hr-approval", "referenced", {}],
  ])("%s %s %p → 호출 0건 + 거절 문구", async (skill, query_type, extra) => {
    const { calls, output } = await runHandler(skill, { query_type, ...extra }, ANY_DATA);
    expect(calls).toHaveLength(0);
    expect(output).toBe(OTHER_EMPLOYEE_REFUSAL);
  });

  it.each([
    ["hr-attendance", "vacation_calendar"],
    ["hr-personnel", "birthday"],
    ["hr-approval", "pending"],
  ])("%s 잘못된 query_type 안내에 제공 중단 값(%s)이 나오지 않는다", async (skill, removed) => {
    const { output } = await runHandler(skill, { query_type: "nope" }, ANY_DATA);
    expect(output).toMatch(/query_type이 올바르지 않습니다/);
    expect(output).not.toContain(removed);
  });

  // Object 원형 키가 ENDPOINT_MAP 조회를 통과해 HR을 호출하던 우회(코드 리뷰 H1)
  it.each([
    ["hr-attendance", "constructor"],
    ["hr-attendance", "__proto__"],
    ["hr-personnel", "toString"],
    ["hr-personnel", "hasOwnProperty"],
    ["hr-approval", "constructor"],
    ["hr-approval", "valueOf"],
  ])("%s 원형 키 query_type(%s)은 HR 호출 없이 잘못된 값으로 처리한다", async (skill, query_type) => {
    const { calls, output } = await runHandler(skill, { query_type }, ANY_DATA);
    expect(calls).toHaveLength(0);
    expect(output).toMatch(/query_type이 올바르지 않습니다/);
  });

  it.each([
    ["hr-attendance", 1],
    ["hr-personnel", ["org_tree"]],
    ["hr-approval", { drafted: true }],
  ])("%s 문자열이 아닌 query_type(%p)은 HR 호출 없이 거절한다", async (skill, query_type) => {
    const { calls, output } = await runHandler(skill, { query_type }, ANY_DATA);
    expect(calls).toHaveLength(0);
    expect(output).toMatch(/query_type이 올바르지 않습니다/);
  });

  it("기안함(drafted)은 그대로 조회한다", async () => {
    const { calls, output } = await runHandler("hr-approval", { query_type: "drafted" }, ANY_DATA);
    expect(calls).toHaveLength(1);
    expect(calls[0].form.selectGubun).toBe("2");
    expect(output).toContain("연차 신청");
  });

  it("미결 건수(todo_count)는 그대로 조회한다", async () => {
    const { calls } = await runHandler("hr-personnel", { query_type: "todo_count" }, () => ({ DATA: [{ CNT1: "1", CNT2: "0", CNT3: "2" }] }));
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/getTodoIconCnt.do");
  });
});

// ─── 조직도는 이름·소속·직위·직책만 (US3) ─────────────────────────────────
describe("org_members 렌더 (US3)", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  it("성명·소속·직위·직책만 보이고 사번·회사·근무정보·근무상황은 나오지 않는다", async () => {
    const { output } = await runHandler(
      "hr-personnel",
      { query_type: "org_members", org_cd: "0303" },
      () => ({
        DATA: [
          { STAFF_NM: "홍길동", STAFF_NO: "20260002", ORG_NM: "개발1팀", POS_NM: "팀장", RES_NM: "팀장", CORP_NM: "오이사공", WORK_TYPE: "육아단축근무", WORK_INFO: "출장" },
        ],
      })
    );
    expect(output).toContain("| 성명 | 소속 | 직위 | 직책 |");
    expect(output).toContain("홍길동");
    for (const hidden of ["20260002", "오이사공", "육아단축근무", "출장", "사번", "근무정보", "근무상황", "회사"]) {
      expect(output).not.toContain(hidden);
    }
  });
});
