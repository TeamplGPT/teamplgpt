/**
 * plugin.json 스키마 검증 단위테스트
 *
 * 테스트 범위:
 * - required 배열에 emp_no, query_type만 포함
 * - 선택 파라미터가 params에 정의되어 있는지
 * - 선택 파라미터의 description에 적용 query_type이 명시되어 있는지
 * - hr-personnel은 선택 파라미터가 없는지
 */

const path = require("path");
const fs = require("fs");

const SKILLS_DIR = path.resolve(
  __dirname,
  "../../../../storage/plugins/agent-skills"
);

function loadPluginJson(skillName) {
  const filePath = path.join(SKILLS_DIR, skillName, "plugin.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("plugin.json 스키마 검증", () => {
  describe("hr-attendance", () => {
    const plugin = loadPluginJson("hr-attendance");

    it("required에 emp_no와 query_type만 있어야 한다", () => {
      expect(plugin.entrypoint.required).toEqual(["emp_no", "query_type"]);
    });

    it("선택 파라미터 6개가 params에 정의되어 있어야 한다", () => {
      const params = plugin.entrypoint.params;
      expect(params).toHaveProperty("year");
      expect(params).toHaveProperty("year_month");
      expect(params).toHaveProperty("months");
      expect(params).toHaveProperty("status");
      expect(params).toHaveProperty("base_date");
      expect(params).toHaveProperty("limit");
    });

    it("각 선택 파라미터 description에 적용 query_type이 명시되어 있어야 한다", () => {
      const params = plugin.entrypoint.params;
      expect(params.year.description).toContain("annual_leave_balance");
      expect(params.year_month.description).toMatch(/timesheet.*overtime|overtime.*timesheet/);
      expect(params.months.description).toContain("leave_requests");
      expect(params.status.description).toContain("leave_requests");
      expect(params.base_date.description).toContain("work_plan_weekly");
      expect(params.limit.description).toContain("timesheet_requests");
    });

    it("description에 '두 가지 파라미터만' 문구가 없어야 한다", () => {
      expect(plugin.description).not.toContain("두 가지 파라미터만");
    });

    it("선택 파라미터 포함 예시가 있어야 한다", () => {
      const examplesWithOptional = plugin.examples.filter((ex) => {
        const call = JSON.parse(ex.call);
        const keys = Object.keys(call);
        return keys.some((k) => !["emp_no", "query_type"].includes(k));
      });
      expect(examplesWithOptional.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("hr-salary", () => {
    const plugin = loadPluginJson("hr-salary");

    it("required에 emp_no와 query_type만 있어야 한다", () => {
      expect(plugin.entrypoint.required).toEqual(["emp_no", "query_type"]);
    });

    it("선택 파라미터 5개가 params에 정의되어 있어야 한다", () => {
      const params = plugin.entrypoint.params;
      expect(params).toHaveProperty("year");
      expect(params).toHaveProperty("year_month");
      expect(params).toHaveProperty("current_month");
      expect(params).toHaveProperty("previous_month");
      expect(params).toHaveProperty("limit");
    });

    it("각 선택 파라미터 description에 적용 query_type이 명시되어 있어야 한다", () => {
      const params = plugin.entrypoint.params;
      expect(params.year.description).toMatch(/annual_total|bonus/);
      expect(params.year_month.description).toMatch(/payslip|deductions|retroactive/);
      expect(params.current_month.description).toContain("compare");
      expect(params.previous_month.description).toContain("compare");
      expect(params.limit.description).toContain("retroactive");
    });

    it("description에 '두 가지 파라미터만' 문구가 없어야 한다", () => {
      expect(plugin.description).not.toContain("두 가지 파라미터만");
    });
  });

  describe("hr-year-end-tax", () => {
    const plugin = loadPluginJson("hr-year-end-tax");

    it("required에 emp_no와 query_type만 있어야 한다", () => {
      expect(plugin.entrypoint.required).toEqual(["emp_no", "query_type"]);
    });

    it("cal_yy 파라미터가 params에 정의되어 있어야 한다", () => {
      expect(plugin.entrypoint.params).toHaveProperty("cal_yy");
    });

    it("cal_yy description에 선택적 사용 안내가 명시되어 있어야 한다", () => {
      expect(plugin.entrypoint.params.cal_yy.description).toMatch(/선택|YYYY/);
    });

    it("description에 '두 가지 파라미터만' 문구가 없어야 한다", () => {
      expect(plugin.description).not.toContain("두 가지 파라미터만");
    });
  });

  describe("hr-personnel (변경 없음 확인)", () => {
    const plugin = loadPluginJson("hr-personnel");

    it("required에 emp_no와 query_type만 있어야 한다", () => {
      expect(plugin.entrypoint.required).toEqual(["emp_no", "query_type"]);
    });

    it("선택 파라미터가 없어야 한다 (emp_no, query_type만)", () => {
      const paramKeys = Object.keys(plugin.entrypoint.params);
      expect(paramKeys).toEqual(["emp_no", "query_type"]);
    });

    it("description에 '두 가지 파라미터만' 문구가 있어야 한다", () => {
      expect(plugin.description).toContain("두 가지 파라미터만");
    });
  });
});
