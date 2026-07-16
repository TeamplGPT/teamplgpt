// hr-personnel/handler.js
// 5240 HR(kiwibox) 직접 호출 버전. 스펙: specs/002-hr-personnel-kiwibox/spec.md
// 근거 카탈로그: kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md §4.8~4.9
//  - 사원증 계열 searchStaffId는 emp_no로 self 강제 — LLM에 타인 사번 파라미터 미노출.
//  - family(주민번호 반환 SCIRegDependent)는 카탈로그 §7 등록 금지 — 미노출.
//  - 인증: JSESSIONID 쿠키 pass-through (계층1 세션 파라미터는 서버가 자동 주입).
const { resolveDateParam } = require("../_shared/dateResolver");

// staffParam: 사원증 계열 self 강제 대상. gate: b게이트 — HR_ACTIVE_MENU_CD 선세팅 대상.
// dateParam: "today"=searchSymd 오늘, "month-range"=staYmd/endYmd(월초~말일)
const ENDPOINT_MAP = {
  profile: {
    path: "/getMBLPrtEmpCard.do", staffParam: "searchStaffId", gate: false,
  },
  profile_detail: {
    path: "/getMBLPrtEmpCardPop.do", staffParam: "searchStaffId", gate: true,
  },
  org_tree: {
    path: "/getMBLHrBassiemOrgList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "cmmSearchOrgCd", required: false },
  },
  org_members: {
    path: "/getMBLHrBassiemMemberList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "searchOrgCd", required: true },
  },
  todo_count: {
    path: "/getTodoIconCnt.do", staffParam: null, gate: false, // 범위 a — 세션 신원
  },
  schedule_day: {
    path: "/getScheduleDay.do", staffParam: null, gate: false, // 범위 a
    dateParam: "month-range",
  },
  contact_directory: {
    path: "/getContactList.do", staffParam: null, gate: false, // 공개 디렉터리
  },
};

const QUERY_LABELS = {
  profile: "사원 기본정보(사원증)",
  profile_detail: "인사카드 상세",
  org_tree: "조직도",
  org_members: "조직원 목록",
  todo_count: "할일/미결 건수",
  schedule_day: "일정/생일/공휴일 캘린더",
  contact_directory: "운영자 연락처",
};

function monthRange(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const lastDay = new Date(y, m, 0).getDate();
  return [`${ym}01`, `${ym}${String(lastDay).padStart(2, "0")}`];
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
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
  handler: async function ({ emp_no, query_type, year_month, org_cd }) {
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

      const form = new URLSearchParams();

      // 대상 사번 self 강제 (카탈로그 §6.1 — d 옵션분기의 타인 검색 경로 차단)
      if (spec.staffParam) form.append(spec.staffParam, staffId);

      // 조직코드: 계층3 체이닝 — org_tree 결과값만 (plugin.json description에서 강제)
      if (spec.orgParam) {
        const org = String(org_cd || "").trim();
        if (spec.orgParam.required && !org) {
          return "> ⚠️ 조직코드(org_cd)가 필요합니다. 먼저 org_tree(조직도)로 조직코드를 조회하세요.";
        }
        if (org) form.append(spec.orgParam.name, org);
      }

      // 날짜 파라미터
      if (spec.dateParam === "today") {
        form.append("searchSymd", todayYmd());
      } else if (spec.dateParam === "month-range") {
        const ym =
          resolveDateParam(year_month, "year_month") ||
          resolveDateParam("이번달", "year_month");
        const [sYmd, eYmd] = monthRange(ym);
        form.append("staYmd", sYmd);
        form.append("endYmd", eYmd);
      }

      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie,
      };

      // b 범위 게이트: 세션 activeMenuCd 기준 (카탈로그 §1.2/§8)
      if (activeMenuCd && spec.gate) {
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
      return formatPersonnel(records, label, staffId);
    } catch (e) {
      this.logger("Error in hr-personnel", e.message);
      if (e.name === "TimeoutError") return "> ⚠️ HR 시스템 응답 시간이 초과되었습니다.";
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
