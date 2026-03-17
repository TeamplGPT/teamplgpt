// hr-attendance/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");

const ENDPOINT_MAP = {
  annual_leave_balance: "/api/v1/attendance/annual-leave/balance",
  annual_leave_plan:    "/api/v1/attendance/annual-leave/plan",
  business_trips:       "/api/v1/attendance/business-trips",
  leave_requests:       "/api/v1/attendance/leave-requests",
  overtime:             "/api/v1/attendance/overtime",
  substitute_leave:     "/api/v1/attendance/substitute-leave",
  timesheet:            "/api/v1/attendance/timesheet",
  timesheet_requests:   "/api/v1/attendance/timesheet-requests",
  work_plan_weekly:     "/api/v1/attendance/work-plan/weekly",
  work_type:            "/api/v1/attendance/work-type",
};

const QUERY_LABELS = {
  annual_leave_balance: "연차 잔여일수",
  annual_leave_plan:    "연차사용계획",
  business_trips:       "출장 신청 내역",
  leave_requests:       "휴가 신청 목록",
  overtime:             "연장근무(OT) 내역",
  substitute_leave:     "대체휴무 신청",
  timesheet:            "출퇴근 기록",
  timesheet_requests:   "출퇴근 변경신청 내역",
  work_plan_weekly:     "주간 근무계획",
  work_type:            "오늘의 근무유형",
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
      return formatAttendance(records, label, emp_no);
    } catch (e) {
      this.logger("Error in hr-attendance", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 근태 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatAttendance(data, label, staffId) {
  const records = Array.isArray(data) ? data : [data];

  let md = `## HR 근태 - ${label} (사번: ${staffId})\n\n`;

  if (records.length === 0) {
    return md + "> 조회된 데이터가 없습니다.";
  }

  // 동적 컬럼 구성: 첫 번째 레코드의 키를 헤더로 사용
  const keys = Object.keys(records[0]).filter(k => !["code", "message"].includes(k));
  md += `| ${keys.join(" | ")} |\n`;
  md += `| ${keys.map(() => "------").join(" | ")} |\n`;

  for (const rec of records) {
    const row = keys.map(k => {
      const v = rec[k];
      return (v === null || v === undefined) ? "-" : String(v);
    });
    md += `| ${row.join(" | ")} |\n`;
  }

  md += `\n> 총 **${records.length}건** 조회됨`;
  return md;
}
