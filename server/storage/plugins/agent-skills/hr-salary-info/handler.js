// hr-salary-info/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

module.exports.runtime = {
  handler: async function ({ emp_no }) {
    try {
      if (!emp_no || emp_no.trim() === "") {
        return "> ⚠️ 사원번호(emp_no)가 필요합니다.";
      }

      const baseUrl = this.runtimeArgs["HR_API_BASE_URL"] || "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });

      const url = `${baseUrl}/api/v1/salary/info?${params.toString()}`;
      this.introspect(`사원번호 ${emp_no}의 급여정보를 조회하고 있습니다...`);

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
        return `> ⚠️ 사원번호 **${emp_no}**의 급여정보가 존재하지 않습니다.`;
      }

      this.introspect(`사원번호 ${emp_no}의 급여정보 조회 완료.`);
      return formatSalaryInfo(records, emp_no);
    } catch (e) {
      this.logger("Error in hr-salary-info", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 급여정보 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatSalaryInfo(data, empNo) {
  const records = Array.isArray(data) ? data : [data];
  if (records.length === 0) return `> ⚠️ 사원번호 **${empNo}**의 급여정보가 없습니다.`;

  let md = `## HR 급여정보 - 사원번호: ${empNo}\n\n`;

  const fields = [
    ["귀속년월", "stat_ym"], ["급여일자", "sal_ymd"], ["근무시간", "work_time"],
    ["시급", "hourly_amt"], ["일급", "daily_amt"], ["평일연장수당", "over_amt"],
    ["평일야간수당", "night_amt"], ["휴일근무수당", "hwork_amt"], ["휴일연장수당", "hover_amt"],
    ["휴일야간수당", "hnight_amt"], ["과세금액", "tax_earn_amt"], ["비과세금액", "ntax_earn_amt"],
    ["지급액", "pay_amt"], ["실지급액", "rpay_amt"],
  ];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (records.length > 1) {
      md += `### ${i + 1}건${rec.stat_ym ? ` - ${rec.stat_ym}` : ""}\n\n`;
    }
    md += "| 항목 | 값 |\n|------|-----|\n";
    for (const [label, key] of fields) {
      if (rec[key] !== null && rec[key] !== undefined) {
        const val = typeof rec[key] === "number" ? rec[key].toLocaleString("ko-KR") : rec[key];
        md += `| ${label} | **${val}** |\n`;
      }
    }
    md += "\n";
  }

  md += `> 총 **${records.length}건** 조회됨`;
  return md.trim();
}
