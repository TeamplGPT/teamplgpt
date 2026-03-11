// hr-salary-info/handler.js
module.exports.runtime = {
  handler: async function ({ emp_no, sta_ymd, end_ymd, site_id }) {
    try {
      // 1. Validate required parameter
      if (!emp_no || emp_no.trim() === "") {
        return "사원번호(emp_no)가 필요합니다. 사원번호를 알려주세요.";
      }

      const baseUrl =
        this.runtimeArgs["HR_API_BASE_URL"] ||
        "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });
      if (sta_ymd && sta_ymd.trim() !== "")
        params.append("sta_ymd", sta_ymd.trim());
      if (end_ymd && end_ymd.trim() !== "")
        params.append("end_ymd", end_ymd.trim());
      if (site_id && site_id.trim() !== "")
        params.append("site_id", site_id.trim());

      const url = `${baseUrl}/api/v1/salary/info?${params.toString()}`;
      this.introspect(
        `HR API에서 사원번호 ${emp_no}의 급여정보를 조회하고 있습니다...`
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
        return `사원번호 ${emp_no}에 해당하는 급여정보가 없습니다. 사원번호와 조회기간을 확인해주세요.`;
      }

      // 4. Format response - must return string (AnythingLLM requirement)
      this.introspect(
        `사원번호 ${emp_no}의 급여정보를 성공적으로 조회했습니다.`
      );
      const result = formatSalaryInfo(data, emp_no, sta_ymd, end_ymd);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    } catch (e) {
      this.introspect(`급여정보 조회 중 오류 발생: ${e.message}`);
      this.logger("Error in hr-salary-info", e.message);
      if (e.name === "TimeoutError") {
        return "HR API 서버 응답 시간이 초과되었습니다. 서버 상태를 확인해주세요.";
      }
      return `급여정보 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatSalaryInfo(data, empNo, staYmd, endYmd) {
  // Handle both single object and array response
  const records = Array.isArray(data) ? data : [data];

  if (records.length === 0) {
    return `사원번호 ${empNo}의 급여정보가 없습니다.`;
  }

  const fields = [
    ["사원번호", "emp_no"],
    ["귀속년월", "stat_ym"],
    ["급여일자", "sal_ymd"],
    ["근무시간", "work_time"],
    ["시급", "hourly_amt"],
    ["일급", "daily_amt"],
    ["평일연장수당", "over_amt"],
    ["평일야간수당", "night_amt"],
    ["휴일근무수당", "hwork_amt"],
    ["휴일연장수당", "hover_amt"],
    ["휴일야간수당", "hnight_amt"],
    ["과세금액", "tax_earn_amt"],
    ["비과세금액", "ntax_earn_amt"],
    ["지급액", "pay_amt"],
    ["실지급액", "rpay_amt"],
  ];

  let period = "";
  if (staYmd && endYmd) period = ` (${staYmd} ~ ${endYmd})`;
  else if (staYmd) period = ` (${staYmd} ~)`;

  let result = `[급여정보] 사원번호: ${empNo}${period}\n`;
  result += "─".repeat(30) + "\n";

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (records.length > 1) {
      result += `\n▶ ${i + 1}건${record.stat_ym ? ` (${record.stat_ym})` : ""}\n`;
    }
    for (const [label, key] of fields) {
      if (record[key] !== undefined && record[key] !== null) {
        let val;
        if (typeof record[key] === "object") val = JSON.stringify(record[key]);
        else if (typeof record[key] === "number") val = record[key].toLocaleString();
        else val = String(record[key]);
        result += `  ${label}: ${val}\n`;
      }
    }
  }

  result += `\n총 ${records.length}건 조회됨`;
  return result.trim();
}
