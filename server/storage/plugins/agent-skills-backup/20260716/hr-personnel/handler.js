// hr-personnel/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

const ENDPOINT_MAP = {
  address:             "/api/v1/personnel/address",
  appointment_current: "/api/v1/personnel/appointment/current",
  career:              "/api/v1/personnel/career",
  contact:             "/api/v1/personnel/contact",
  disciplines:         "/api/v1/personnel/disciplines",
  education:           "/api/v1/personnel/education",
  employment:          "/api/v1/personnel/employment",
  family:              "/api/v1/personnel/family",
  licenses:            "/api/v1/personnel/licenses",
  rewards:             "/api/v1/personnel/rewards",
  visa:                "/api/v1/personnel/visa",
};

const QUERY_LABELS = {
  address:             "주소 목록",
  appointment_current: "현재 직위/직급",
  career:              "전직경력",
  contact:             "연락처",
  disciplines:         "징계이력",
  education:           "학력사항",
  employment:          "입사일/근속연수",
  family:              "가족정보",
  licenses:            "자격증 목록",
  rewards:             "포상이력",
  visa:                "비자 정보",
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
      return formatPersonnel(records, label, emp_no);
    } catch (e) {
      this.logger("Error in hr-personnel", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 인사기록 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatPersonnel(data, label, staffId) {
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 인사기록 - ${label} (사번: ${staffId})\n\n`;

  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
