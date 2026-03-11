// hr-salary/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

const ENDPOINT_MAP = {
  account:        "/api/v1/salary/account",
  annual_total:   "/api/v1/salary/annual-total",
  base_amount:    "/api/v1/salary/base-amount",
  bonus:          "/api/v1/salary/bonus",
  compare:        "/api/v1/salary/compare",
  deductions:     "/api/v1/salary/deductions",
  leave_pay_rate: "/api/v1/salary/leave-pay-rate",
  pay_step:       "/api/v1/salary/pay-step",
  payslip:        "/api/v1/salary/payslip",
  retroactive:    "/api/v1/salary/retroactive",
};

const QUERY_LABELS = {
  account:        "급여 이체 계좌",
  annual_total:   "연간 급여 총액",
  base_amount:    "기본급/연봉 기준금액",
  bonus:          "성과급/상여금 내역",
  compare:        "월별 급여 비교",
  deductions:     "급여 공제 항목",
  leave_pay_rate: "휴직 시 급여 지급률",
  pay_step:       "호봉 정보",
  payslip:        "급여명세서",
  retroactive:    "소급 급여 내역",
};

module.exports.runtime = {
  handler: async function ({ emp_no, query_type, year_month, year, current_month, previous_month, limit }) {
    try {
      if (!emp_no || emp_no.trim() === "") {
        return "> ⚠️ 사원번호(emp_no)가 필요합니다.";
      }
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const baseUrl = this.runtimeArgs["HR_API_BASE_URL"] || "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });
      if (year_month) params.append("year_month", year_month.trim());
      if (year) params.append("year", year.trim());
      if (current_month) params.append("current_month", current_month.trim());
      if (previous_month) params.append("previous_month", previous_month.trim());
      if (limit) params.append("limit", limit.trim());

      const endpoint = ENDPOINT_MAP[query_type];
      const url = `${baseUrl}${endpoint}?${params.toString()}`;
      const label = QUERY_LABELS[query_type];

      this.introspect(`${label} 조회 중 (사번: ${emp_no})...`);

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return await parseErrorMessage(response, `> ⚠️ HR API 호출 실패 (HTTP ${response.status}).`);
      }

      const data = await response.json();
      const { isEmpty, records } = unwrapResponse(data);

      if (isEmpty) {
        return `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다 (사번: ${emp_no}).`;
      }

      this.introspect(`${label} 조회 완료.`);
      return formatSalary(records, label, emp_no);
    } catch (e) {
      this.logger("Error in hr-salary", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 급여 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatSalary(data, label, staffId) {
  const records = Array.isArray(data) ? data : [data];
  let md = `## HR 급여 - ${label} (사번: ${staffId})\n\n`;

  if (records.length === 0) return md + "> 조회된 데이터가 없습니다.";

  const keys = Object.keys(records[0]).filter(k => !["code", "message"].includes(k));
  md += `| ${keys.join(" | ")} |\n`;
  md += `| ${keys.map(() => "------").join(" | ")} |\n`;

  for (const rec of records) {
    const row = keys.map(k => {
      const v = rec[k];
      if (v === null || v === undefined) return "-";
      if (typeof v === "number") return `**${v.toLocaleString("ko-KR")}**`;
      return String(v);
    });
    md += `| ${row.join(" | ")} |\n`;
  }

  md += `\n> 총 **${records.length}건** 조회됨`;
  return md;
}
