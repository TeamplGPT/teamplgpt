// hr-employee-basic/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

module.exports.runtime = {
  handler: async function ({ emp_no }) {
    try {
      if (!emp_no || emp_no.trim() === "") {
        return "> ⚠️ 사원번호(emp_no)가 필요합니다. 사원번호를 알려주세요.";
      }

      const baseUrl = this.runtimeArgs["HR_API_BASE_URL"] || "http://host.docker.internal:8000";
      const params = new URLSearchParams({ emp_no: emp_no.trim() });

      const url = `${baseUrl}/api/v1/employee/basic?${params.toString()}`;
      this.introspect(`사원번호 ${emp_no}의 기본정보를 조회하고 있습니다...`);

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return await parseErrorMessage(response, `> ⚠️ HR API 호출 실패 (HTTP ${response.status}). 서버 상태를 확인해주세요.`);
      }

      const data = await response.json();
      const { isEmpty, records } = unwrapResponse(data);

      if (isEmpty) {
        return `> ⚠️ 사원번호 **${emp_no}**에 해당하는 직원 정보가 존재하지 않습니다.`;
      }

      this.introspect(`사원번호 ${emp_no}의 기본정보 조회 완료.`);
      return formatEmployeeBasic(records, emp_no);
    } catch (e) {
      this.logger("Error in hr-employee-basic", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 직원 기본정보 조회 중 오류가 발생했습니다: ${e.message}`;
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

  let md = `## HR 직원 기본정보 - 사원번호: ${empNo}\n\n`;
  md += "| 항목 | 값 |\n|------|-----|\n";

  for (const [label, key] of fields) {
    if (data[key] !== null && data[key] !== undefined && data[key] !== "") {
      const val = typeof data[key] === "object" ? JSON.stringify(data[key]) : data[key];
      md += `| ${label} | ${val} |\n`;
    }
  }

  // 알 수 없는 필드 동적 추가
  const knownKeys = new Set(fields.map(([, k]) => k).concat(["code", "message"]));
  for (const [key, value] of Object.entries(data)) {
    if (!knownKeys.has(key) && value !== null && value !== undefined) {
      const val = typeof value === "object" ? JSON.stringify(value) : value;
      md += `| ${key} | ${val} |\n`;
    }
  }

  md += "\n> 조회 완료";
  return md;
}
