// hr-employee-basic/handler.js
module.exports.runtime = {
  handler: async function ({ emp_no, site_id }) {
    try {
      // 1. Validate required parameter
      if (!emp_no || emp_no.trim() === "") {
        return "사원번호(emp_no)가 필요합니다. 사원번호를 알려주세요.";
      }

      const baseUrl =
        this.runtimeArgs["HR_API_BASE_URL"] ||
        "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });
      if (site_id && site_id.trim() !== "") {
        params.append("site_id", site_id.trim());
      }

      const url = `${baseUrl}/api/v1/employee/basic?${params.toString()}`;
      this.introspect(
        `HR API에서 사원번호 ${emp_no}의 정보를 조회하고 있습니다...`
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
        return `사원번호 ${emp_no}에 해당하는 직원 정보가 없습니다. 사원번호를 확인해주세요.`;
      }

      // 4. Format response - must return string (AnythingLLM requirement)
      this.introspect(`사원번호 ${emp_no}의 정보를 성공적으로 조회했습니다.`);
      const result = formatEmployeeBasic(data, emp_no);
      return typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
    } catch (e) {
      this.introspect(`직원 정보 조회 중 오류 발생: ${e.message}`);
      this.logger("Error in hr-employee-basic", e.message);
      if (e.name === "TimeoutError") {
        return "HR API 서버 응답 시간이 초과되었습니다. 서버 상태를 확인해주세요.";
      }
      return `직원 정보 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatEmployeeBasic(data, empNo) {
  const fields = [
    ["사원번호", "emp_no"],
    ["이름", "emp_name"],
    ["조직코드", "org_cd"],
    ["조직명", "org_nm"],
    ["직위코드", "pos_cd"],
    ["직위명", "pos_nm"],
    ["직책코드", "res_cd"],
    ["직책명", "res_nm"],
    ["직급코드", "cls_cd"],
    ["직급명", "cls_nm"],
    ["직원구분코드", "emp_type_cd"],
    ["직원구분명", "emp_type_nm"],
    ["사이트ID", "site_id"],
  ];

  let result = `[직원 정보] 사원번호: ${empNo}\n`;
  result += "─".repeat(30) + "\n";

  for (const [label, key] of fields) {
    if (data[key] !== undefined && data[key] !== null) {
      const val =
        typeof data[key] === "object"
          ? JSON.stringify(data[key])
          : String(data[key]);
      result += `${label}: ${val}\n`;
    }
  }

  // Handle unknown fields dynamically
  const knownKeys = new Set(
    fields.map(([, k]) => k).concat(["code", "message"])
  );
  for (const [key, value] of Object.entries(data)) {
    if (!knownKeys.has(key) && value !== null && value !== undefined) {
      const val =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      result += `${key}: ${val}\n`;
    }
  }

  return result.trim();
}
