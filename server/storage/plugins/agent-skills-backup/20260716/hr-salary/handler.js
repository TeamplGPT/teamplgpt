// hr-salary/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");
const { resolveDateParam } = require("../_shared/dateResolver");

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

const PARAMS_MAP = {
  payslip:        ["year_month"],
  deductions:     ["year_month"],
  compare:        ["current_month", "previous_month"],
  retroactive:    ["year_month", "limit"],
  annual_total:   ["year"],
  bonus:          ["year"],
  account:        [],
  base_amount:    [],
  leave_pay_rate: [],
  pay_step:       [],
};

const DATE_FORMAT_MAP = {
  year: "year",
  year_month: "year_month",
  current_month: "year_month",
  previous_month: "year_month",
};

module.exports.runtime = {
  handler: async function ({ emp_no, query_type, year, year_month, current_month, previous_month, limit }) {
    try {
      if (!emp_no || emp_no.trim() === "") {
        return "> ⚠️ 사원번호(emp_no)가 필요합니다.";
      }
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const baseUrl = this.runtimeArgs["HR_API_BASE_URL"] || "http://kiwibox-hr-api:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });
      const allOptional = { year, year_month, current_month, previous_month, limit };
      const validKeys = PARAMS_MAP[query_type] || [];
      for (const key of validKeys) {
        let val = allOptional[key];
        if (DATE_FORMAT_MAP[key]) {
          val = resolveDateParam(val, DATE_FORMAT_MAP[key]);
        }
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          params.append(key, String(val).trim());
        }
      }

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
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 급여 - ${label} (사번: ${staffId})\n\n`;

  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows, { boldNumbers: true });
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
