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

  describe("hr-personnel", () => {
    const plugin = loadPluginJson("hr-personnel");

    it("required에 emp_no와 query_type만 있어야 한다", () => {
      expect(plugin.entrypoint.required).toEqual(["emp_no", "query_type"]);
    });

    it("선택 파라미터가 없어야 한다 (emp_no, query_type만)", () => {
      const paramKeys = Object.keys(plugin.entrypoint.params);
      expect(paramKeys).toEqual(["emp_no", "query_type"]);
    });

    it("description에 행동 지시문이 없어야 한다", () => {
      expect(plugin.description).not.toContain("절대 묻지");
      expect(plugin.description).not.toContain("즉시 호출");
      expect(plugin.description).not.toContain("두 가지 파라미터만");
    });
  });

  describe("전체 plugin description 품질", () => {
    const SKILLS = ["hr-attendance", "hr-salary", "hr-year-end-tax", "hr-personnel"];

    describe("description에 행동 지시문/날짜규칙 블록이 없어야 한다", () => {
      for (const skill of SKILLS) {
        it(`${skill}: description에 중요-날짜규칙 블록이 없어야 한다`, () => {
          const plugin = loadPluginJson(skill);
          expect(plugin.description).not.toContain("[중요-날짜규칙]");
          expect(plugin.description).not.toContain("YYYYMM");
          expect(plugin.description).not.toContain("되묻지 마세요");
        });
      }
    });

    describe("query_type description에 enum 매핑이 포함되어야 한다", () => {
      for (const skill of SKILLS) {
        it(`${skill}: query_type description에 첫 번째 enum 값이 포함되어야 한다`, () => {
          const plugin = loadPluginJson(skill);
          const firstEnum = plugin.entrypoint.params.query_type.enum[0];
          expect(plugin.entrypoint.params.query_type.description).toContain(firstEnum);
        });
      }
    });

    describe("examples에 YYYYMM 형식이 없어야 한다", () => {
      const YYYYMM_PATTERN = /^\d{6}$/;
      const DATE_PARAMS = ["year_month", "current_month", "previous_month", "base_date", "cal_yy"];

      for (const skill of SKILLS) {
        it(`${skill}: examples의 날짜 파라미터에 YYYYMM 패턴이 없어야 한다`, () => {
          const plugin = loadPluginJson(skill);
          for (const ex of plugin.examples || []) {
            const call = JSON.parse(ex.call);
            for (const param of DATE_PARAMS) {
              if (call[param]) {
                expect(call[param]).not.toMatch(YYYYMM_PATTERN);
              }
            }
          }
        });
      }
    });
  });
});
