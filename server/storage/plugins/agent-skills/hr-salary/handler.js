// hr-salary/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/004 r2·003).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md §4.5 + kiwibox SQL 실측.
//  - 급여명세는 2단계: pay_periods(월→지급건 목록) → searchItem(급여일자+유형 복합키)로 명세 조회.
//  - searchItem = SAL_YMD(8) + SAL_TYPE_CD, 콤보 getSalYmdTypeCdList2의 CODE 값(체이닝).
//  - 전 항목 데스크탑 정본(b, 게이트). 계좌 항목 미제공(§7). searchType=mobile 차단.
//  - 대상 식별자는 LLM 미노출: $SELF_STAFF_ID 마커 → 브리지(ssnStaffId)/HR_STAFF_ID(폴백) 치환.
const { resolveDateParam } = require("../_shared/dateResolver");
const {
  hrFetch,
  monthRange,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// 1단계: 지급 건 목록(급여일자+유형) — pay_item(searchItem)의 유효값 소스
const PAY_PERIODS = {
  path: "/CommonCode.do",
  cmd: "getCommonNSCodeList",
  gate: false,
};

// 2단계: pay_item(=searchItem 복합키) 필요한 명세 endpoint
const ENDPOINT_MAP = {
  payslip: {
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrList",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
  },
  deductions: {
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrList2",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
  },
  payslip_summary: {
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrMap",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
  },
  salary_statement: {
    path: "/SALSalaryDtstmnMgr.do", cmd: "getSALSalaryDtstmnMgrList",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
  },
  daylabor: {
    path: "/SALDaylabMgr.do", cmd: "getSALDaylabMgrList",
    needsPayItem: false, period: "range", staffParam: "cmmSearchStaffId", gate: true,
  },
};

const QUERY_LABELS = {
  pay_periods: "급여 지급 건 목록",
  payslip: "급여 지급항목 명세",
  deductions: "급여 공제내역",
  payslip_summary: "급여 요약(지급/공제/실수령 합계)",
  salary_statement: "기간 급여명세",
  daylabor: "일용직 급여 내역",
};

const FORBIDDEN_FIXED_VALUES = { searchType: ["mobile"] };

module.exports.runtime = {
  handler: async function ({ query_type, year_month, pay_item }) {
    try {
      const valid = ["pay_periods", ...Object.keys(ENDPOINT_MAP)];
      if (!query_type || !valid.includes(query_type)) {
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${valid.join(", ")}`;
      }

      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      const label = QUERY_LABELS[query_type];

      // --- 1단계: 지급 건 목록 ---
      if (query_type === "pay_periods") {
        const applCd = String(this.runtimeArgs["HR_SAL_APPL_CD"] || "").trim();
        const form = {
          cmd: PAY_PERIODS.cmd,
          queryId: "getSalYmdTypeCdList2",
          closeChk: "Y",
          searchYm: ym,
          staffId: SELF_STAFF_ID_MARKER,
        };
        if (applCd) form.applCd = applCd;

        this.introspect(`${label} 조회 중...`);
        const { errorMessage, records, isEmpty } = await hrFetch(this, {
          path: PAY_PERIODS.path,
          form,
          gate: PAY_PERIODS.gate,
        });
        if (errorMessage) return errorMessage;
        if (isEmpty) {
          return `> ⚠️ **${label}**: 해당 월에 지급된 급여 건이 없습니다.`;
        }
        return formatPayPeriods(records);
      }

      // --- 2단계: 명세 조회 ---
      const spec = ENDPOINT_MAP[query_type];
      const form = {};
      if (spec.cmd) form.cmd = spec.cmd;

      if (spec.needsPayItem) {
        const item = String(pay_item || "").trim();
        if (!item) {
          return "> ⚠️ 급여 건(pay_item)이 필요합니다. 먼저 query_type=pay_periods로 지급 건 목록을 조회한 뒤, 그 결과의 코드값(CODE)으로 다시 요청하세요.";
        }
        form.searchItem = item;
      } else if (spec.period === "range") {
        const [sYmd, eYmd] = monthRange(ym);
        form.searchDateSYmd = sYmd;
        form.searchDateEYmd = eYmd;
      }

      if (spec.staffParam) form[spec.staffParam] = SELF_STAFF_ID_MARKER;

      for (const [k, v] of Object.entries(spec.fixed || {})) {
        if ((FORBIDDEN_FIXED_VALUES[k] || []).includes(v)) continue;
        form[k] = v;
      }

      this.introspect(`${label} 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: spec.path,
        form,
        gate: spec.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`;
      }

      this.introspect(`${label} 조회 완료.`);
      return formatSalary(records, label);
    } catch (e) {
      this.logger("Error in hr-salary", e.message);
      return `> ⚠️ 급여 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatPayPeriods(data) {
  // 콤보 응답: [{ CODE_NM: "2026-06-25 정기급여", CODE: "20260625NN", ... }]
  const list = Array.isArray(data) ? data : data ? [data] : [];
  let md = `## HR 급여 - 지급 건 목록\n\n`;
  if (list.length === 0) return md + "> 지급된 급여 건이 없습니다.";
  md += "아래 급여 건 중 하나를 선택해 상세를 조회할 수 있습니다.\n\n";
  md += "| 급여 건 | 코드(pay_item) |\n|---|---|\n";
  for (const it of list) {
    const nm = it.CODE_NM ?? it.codeNm ?? it.code_nm ?? "";
    const code = it.CODE ?? it.code ?? "";
    md += `| ${nm} | \`${code}\` |\n`;
  }
  md += `\n> 총 **${list.length}건**. 특정 건 상세는 query_type=payslip/deductions/payslip_summary/salary_statement + pay_item=코드값.`;
  return md;
}

function formatSalary(data, label) {
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 급여 - ${label}\n\n`;
  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
