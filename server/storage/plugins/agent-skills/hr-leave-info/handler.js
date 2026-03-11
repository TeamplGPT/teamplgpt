// hr-leave-info/handler.js
module.exports.runtime = {
  handler: async function ({ emp_no, leav_cd, base_ymd, site_id }) {
    try {
      // 1. Validate required parameter
      if (!emp_no || emp_no.trim() === "") {
        return "사원번호(emp_no)가 필요합니다. 사원번호를 알려주세요.";
      }

      const baseUrl =
        this.runtimeArgs["HR_API_BASE_URL"] ||
        "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });
      if (leav_cd && leav_cd.trim() !== "")
        params.append("leav_cd", leav_cd.trim());
      if (base_ymd && base_ymd.trim() !== "")
        params.append("base_ymd", base_ymd.trim());
      if (site_id && site_id.trim() !== "")
        params.append("site_id", site_id.trim());

      const url = `${baseUrl}/api/v1/leave/info?${params.toString()}`;
      this.introspect(
        `HR API에서 사원번호 ${emp_no}의 휴가/휴직 정보를 조회하고 있습니다...`
      );
      this.logger(`Fetching: ${url}`);

      // 2. Call HR API
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return `HR API 호출 실패 (HTTP ${response.status}). 서버 상태를 확인해주세요.`;
      }

      const data = await response.json();

      // 3. Check business error
      if (data.code === "-1" || data.code === -1) {
        return `사원번호 ${emp_no}에 해당하는 휴가/휴직 정보가 없습니다. 사원번호를 확인해주세요.`;
      }

      // 4. Format response - must return string (AnythingLLM requirement)
      this.introspect(
        `사원번호 ${emp_no}의 휴가/휴직 정보를 성공적으로 조회했습니다.`
      );
      const result = formatLeaveInfo(data, emp_no);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    } catch (e) {
      this.introspect(`휴가/휴직 정보 조회 중 오류 발생: ${e.message}`);
      this.logger("Error in hr-leave-info", e.message);
      if (e.name === "TimeoutError") {
        return "HR API 서버 응답 시간이 초과되었습니다. 서버 상태를 확인해주세요.";
      }
      return `휴가/휴직 정보 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatLeaveInfo(data, empNo) {
  // Handle both single object and array response
  const records = Array.isArray(data) ? data : [data];

  if (records.length === 0) {
    return `사원번호 ${empNo}의 휴가/휴직 정보가 없습니다.`;
  }

  const fields = [
    ["사원번호", "emp_no"],
    ["근태코드", "leav_cd"],
    ["근태종류", "leav_nm"],
    ["시작일자", "sta_ymd"],
    ["종료일자", "end_ymd"],
    ["연차번호", "yy_num"],
    ["신청사유", "reason"],
    ["근무유형코드", "wktype_cd"],
    ["근무유형명", "wktype_nm"],
    ["조직코드", "org_cd"],
    ["조직명", "org_nm"],
    ["직위코드", "pos_cd"],
    ["직위명", "pos_nm"],
    ["상태코드", "status_cd"],
    ["비고", "note"],
  ];

  let result = `[휴가/휴직 정보] 사원번호: ${empNo}\n`;
  result += "─".repeat(30) + "\n";

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (records.length > 1) {
      const period = record.sta_ymd
        ? ` (${record.sta_ymd}${record.end_ymd ? " ~ " + record.end_ymd : ""})`
        : "";
      result += `\n▶ ${i + 1}건${period}\n`;
    }
    for (const [label, key] of fields) {
      if (
        record[key] !== undefined &&
        record[key] !== null &&
        record[key] !== ""
      ) {
        const val = typeof record[key] === "object" ? JSON.stringify(record[key]) : String(record[key]);
        result += `  ${label}: ${val}\n`;
      }
    }
  }

  result += `\n총 ${records.length}건 조회됨`;
  return result.trim();
}
