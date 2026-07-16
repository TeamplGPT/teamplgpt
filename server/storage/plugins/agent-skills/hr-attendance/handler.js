// hr-attendance/handler.js
// 5240 HR(kiwibox) 직접 호출 버전.
// 근거 카탈로그: kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md
//  - 데스크탑 정본(b, AUTF_SRCH_STAFF_YN 게이트) 우선. 휴가만 모바일 self(a) 정본.
//  - c 범위(searchId)는 handler가 emp_no로 self 강제 — LLM에 별도 사번 파라미터 미노출.
//  - 인증: JSESSIONID 쿠키 pass-through (계층1 세션 파라미터는 서버가 자동 주입).
const { resolveDateParam } = require("../_shared/dateResolver");

// period: "range"=searchBaseSYmd/EYmd, "range-alt"=searchSYmd/EYmd, "ym"=searchYm, "none"
// staffParam: b 범위 cmmSearchStaffId / c 범위 searchId (self 강제) / a 범위 없음(세션 신원)
const ENDPOINT_MAP = {
  timesheet: {
    path: "/TAAWrkTimeListMgrByDate.do", cmd: "getTAAWrkTimeListMgrByDateList",
    period: "range", staffParam: "cmmSearchStaffId",
  },
  work_status: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList",
    period: "range", staffParam: "cmmSearchStaffId",
  },
  work_calendar: {
    path: "/TAADclzWorkSearchCldr.do", cmd: "getTAADclzWorkSearchCldr",
    period: "ym", staffParam: "searchId", // 범위 c — self 강제 필수 (카탈로그 §4.1)
  },
  overtime: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList2",
    period: "range", staffParam: "cmmSearchStaffId", fixed: { searchType: "3" },
  },
  overtime_limit: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList",
    period: "range", staffParam: "cmmSearchStaffId", fixed: { searchType: "3" },
  },
  leave_requests: {
    path: "/getMBLLeavDetailStaff.do", // 범위 a — 순수 self, ssnStaffId 고정 (카탈로그 §4.3)
    period: "none", staffParam: null,
  },
  annual_leave_balance: {
    path: "/getMBLHomeLeaveDetail.do", // 범위 a — searchType=1 고정으로 소속 경로 차단
    period: "none", staffParam: null, fixed: { searchType: "1" },
  },
  vacation_calendar: {
    path: "/TAADclzVcatnCldrMgr.do", cmd: "getTAADclzVcatnCldrMgr",
    period: "range-alt", staffParam: null, // 조직 휴가캘린더(b) — 본인 외 사유 마스킹은 서버 처리
  },
};

const QUERY_LABELS = {
  timesheet: "출퇴근 기록",
  work_status: "근무현황 요약",
  work_calendar: "월 근무캘린더",
  overtime: "연장근무(OT) 신청 내역",
  overtime_limit: "연장근무(OT) 한도/잔여",
  leave_requests: "본인 휴가신청 상세",
  annual_leave_balance: "연차 발생/사용/잔여",
  vacation_calendar: "조직 휴가캘린더",
};

// 게이트 스킵 파라미터 주입 금지 (카탈로그 §4.5 searchType=mobile 게이트 스킵 사례 방어)
const FORBIDDEN_FIXED_VALUES = { searchType: ["mobile"] };

function monthRange(ym) {
  // ym: "YYYYMM" -> [YYYYMM01, YYYYMM<말일>]
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const lastDay = new Date(y, m, 0).getDate();
  return [`${ym}01`, `${ym}${String(lastDay).padStart(2, "0")}`];
}

function normalizeCookie(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return v.includes("=") ? v : `JSESSIONID=${v}`;
}

function isHtmlOrLogin(response, bodyText) {
  const ct = response.headers.get("content-type") || "";
  if (ct.includes("text/html")) return true;
  if (/login|\.jsp/i.test(response.url || "")) return true;
  return typeof bodyText === "string" && /^\s*</.test(bodyText);
}

module.exports.runtime = {
  handler: async function ({ emp_no, query_type, year_month }) {
    try {
      if (!emp_no || emp_no.trim() === "") {
        return "> ⚠️ 사원번호(emp_no)가 필요합니다.";
      }
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const baseUrl = String(
        this.runtimeArgs["HR_BASE_URL"] || "https://ntest.5240.kr"
      ).replace(/\/+$/, "");
      const contextPath = String(
        this.runtimeArgs["HR_CONTEXT_PATH"] ?? "/kiwibox"
      ).replace(/\/+$/, "");
      const cookie = normalizeCookie(this.runtimeArgs["HR_SESSION_COOKIE"]);
      if (!cookie) {
        return "> ⚠️ HR 세션(HR_SESSION_COOKIE)이 설정되지 않았습니다. 5240 HR 로그인 세션(JSESSIONID)을 skill 설정에 등록하세요.";
      }
      const activeMenuCd = String(this.runtimeArgs["HR_ACTIVE_MENU_CD"] || "").trim();

      const spec = ENDPOINT_MAP[query_type];
      const label = QUERY_LABELS[query_type];
      const staffId = emp_no.trim();

      // 계층2 조회조건: LLM은 year_month 하나만 — endpoint별 kiwibox 파라미터로 변환
      const form = new URLSearchParams();
      if (spec.cmd) form.append("cmd", spec.cmd);
      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      if (spec.period === "ym") {
        form.append("searchYm", ym);
      } else if (spec.period === "range" || spec.period === "range-alt") {
        const [sYmd, eYmd] = monthRange(ym);
        if (spec.period === "range") {
          form.append("searchBaseSYmd", sYmd);
          form.append("searchBaseEYmd", eYmd);
        } else {
          form.append("searchSYmd", sYmd);
          form.append("searchEYmd", eYmd);
        }
      }

      // 대상 사번: self 강제 — LLM 노출 파라미터는 emp_no뿐, kiwibox 사번 파라미터는 handler가 주입
      if (spec.staffParam) form.append(spec.staffParam, staffId);

      // endpoint 고정 파라미터 (게이트 스킵 값 방어)
      for (const [k, v] of Object.entries(spec.fixed || {})) {
        if ((FORBIDDEN_FIXED_VALUES[k] || []).includes(v)) continue;
        form.append(k, v);
      }

      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie,
      };

      // b 범위 게이트는 세션 activeMenuCd 기준(카탈로그 §1.2/§8) — 설정 시 메뉴 컨텍스트 선세팅
      if (activeMenuCd && spec.staffParam) {
        await fetch(
          `${baseUrl}${contextPath}/setSessionActiveTabMenuCd.do?tabMenuCd=${encodeURIComponent(activeMenuCd)}`,
          { method: "GET", headers, signal: AbortSignal.timeout(5000) }
        ).catch(() => {});
      }

      const url = `${baseUrl}${contextPath}${spec.path}`;
      this.introspect(`${label} 조회 중 (사번: ${staffId})...`);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: form.toString(),
        signal: AbortSignal.timeout(10000),
      });

      const bodyText = await response.text();
      if (isHtmlOrLogin(response, bodyText)) {
        return "> ⚠️ HR 세션이 만료되었거나 로그인 페이지로 이동되었습니다. HR_SESSION_COOKIE(JSESSIONID)를 갱신하세요.";
      }
      if (!response.ok) {
        return `> ⚠️ HR 시스템 호출 실패 (HTTP ${response.status}).`;
      }

      let data;
      try {
        data = JSON.parse(bodyText);
      } catch {
        return "> ⚠️ HR 시스템 응답을 해석할 수 없습니다 (JSON 아님). 세션 상태를 확인하세요.";
      }

      // kiwibox jsonView: { result: [...] } 또는 { result: {...} }
      const records = data && "result" in data ? data.result : data;
      const isEmpty =
        records === null ||
        records === undefined ||
        (Array.isArray(records) && records.length === 0) ||
        (typeof records === "object" && !Array.isArray(records) && Object.keys(records).length === 0);
      if (isEmpty) {
        return `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다 (사번: ${staffId}).`;
      }

      this.introspect(`${label} 조회 완료.`);
      return formatAttendance(records, label, staffId);
    } catch (e) {
      this.logger("Error in hr-attendance", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR 시스템 응답 시간이 초과되었습니다.";
      return `> ⚠️ 근태 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatAttendance(data, label, staffId) {
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 근태 - ${label} (사번: ${staffId})\n\n`;

  if (rows.length === 0) {
    return md + "> 조회된 데이터가 없습니다.";
  }

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
