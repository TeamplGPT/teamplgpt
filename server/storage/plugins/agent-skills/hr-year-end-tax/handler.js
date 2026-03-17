// hr-year-end-tax/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

const ENDPOINT_MAP = {
  credit_card:       "/api/v1/year-end-tax/credit-card",
  donation:          "/api/v1/year-end-tax/donation",
  education:         "/api/v1/year-end-tax/education",
  family:            "/api/v1/year-end-tax/family",
  insurance:         "/api/v1/year-end-tax/insurance",
  medical:           "/api/v1/year-end-tax/medical",
  previous_employer: "/api/v1/year-end-tax/previous-employer",
  result:            "/api/v1/year-end-tax/result",
  savings:           "/api/v1/year-end-tax/savings",
  summary:           "/api/v1/year-end-tax/summary",
};

const QUERY_LABELS = {
  credit_card:       "신용카드 사용내역",
  donation:          "기부금 공제 내역",
  education:         "교육비 공제 내역",
  family:            "부양가족 공제 대상",
  insurance:         "보장성보험 공제",
  medical:           "의료비 공제 내역",
  previous_employer: "종전근무지 소득",
  result:            "연말정산 결과",
  savings:           "연금저축/퇴직연금 공제",
  summary:           "연말정산 공제 요약",
};

module.exports.runtime = {
  handler: async function ({ emp_no, query_type }) {
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
      return formatYearEndTax(records, label, emp_no);
    } catch (e) {
      this.logger("Error in hr-year-end-tax", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 연말정산 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatYearEndTax(data, label, staffId) {
  const records = Array.isArray(data) ? data : [data];
  let md = `## HR 연말정산 - ${label} (사번: ${staffId})\n\n`;

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
