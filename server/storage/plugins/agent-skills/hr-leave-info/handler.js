// hr-leave-info/handler.js
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

      const url = `${baseUrl}/api/v1/leave/info?${params.toString()}`;
      this.introspect(`사원번호 ${emp_no}의 휴가/휴직 정보를 조회하고 있습니다...`);

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
        return `> ⚠️ 사원번호 **${emp_no}**의 휴가/휴직 정보가 존재하지 않습니다.`;
      }

      this.introspect(`사원번호 ${emp_no}의 휴가/휴직 정보 조회 완료.`);
      return formatLeaveInfo(records, emp_no);
    } catch (e) {
      this.logger("Error in hr-leave-info", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 휴가/휴직 정보 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatLeaveInfo(data, empNo) {
  const records = Array.isArray(data) ? data : [data];
  if (records.length === 0) return `> ⚠️ 사원번호 **${empNo}**의 휴가/휴직 정보가 없습니다.`;

  let md = `## HR 휴가/휴직 정보 - 사원번호: ${empNo}\n\n`;
  md += "| 근태종류 | 시작일 | 종료일 | 신청사유 | 상태코드 |\n";
  md += "|---------|--------|--------|---------|----------|\n";

  for (const rec of records) {
    const nm = rec.leav_nm || rec.leav_cd || "-";
    const sta = rec.sta_ymd || "-";
    const end = rec.end_ymd || "-";
    const reason = rec.reason || "-";
    const status = rec.status_cd || "-";
    md += `| ${nm} | ${sta} | ${end} | ${reason} | ${status} |\n`;
  }

  md += `\n> 총 **${records.length}건** 조회됨`;
  return md;
}
