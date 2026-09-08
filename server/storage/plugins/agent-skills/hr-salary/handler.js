// hr-salary/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/004 r2·003·011).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md (신판) §1.
//  - 급여명세는 2단계: pay_periods(월→지급건 목록, §1.4) → searchItem(급여일자+유형 복합키)로
//    SAL-0527 명세 조회(§1.1). 필수 BODY: searchYm(YYYY-MM 하이픈, searchItem에서 유도) +
//    searchType=web 고정(mobile 금지). 기간 이력은 SAL-0050 월별지급내역(§1.2 — SAL-0220 폐기 대체).
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
// 컬럼 화이트리스트 근거: docs/03-analysis/hr-column-whitelist-audit.analysis.md
// (kiwibox SALSalaryDtstmnMgr_SQL.xml·SALDaylabMgr_SQL.xml 대조)
const ENDPOINT_MAP = {
  payslip: {
    // SALPayslipNewMgr.do는 kiwibox에 컨트롤러 매핑이 없다(뷰 JSP만 존재) —
    // 실제 데이터 cmd는 SALSalaryDtstmnMgr.do의 getSALSalaryDtstmnMgrList 계열(실측).
    path: "/SALSalaryDtstmnMgr.do", cmd: "getSALSalaryDtstmnMgrList",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
    columns: {
      salItemNm: "지급항목",
      salTypeNm: "지급구분",
      salYm: "급여연월",
      salAmt: "지급금액",
      resalAmt: "소급금액",
    },
  },
  deductions: {
    path: "/SALSalaryDtstmnMgr.do", cmd: "getSALSalaryDtstmnMgrList2",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
    columns: {
      salItemNm: "공제항목",
      salYm: "급여연월",
      salAmt: "공제금액",
    },
  },
  payslip_summary: {
    path: "/SALSalaryDtstmnMgr.do", cmd: "getSALSalaryDtstmnMgrMap",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
    // staffId/staffNo/salTypeCd/salKindCd/notice(CLOB HTML) 차단
    columns: {
      staffNm: "성명",
      orgNm: "소속",
      posNm: "직위",
      resNm: "직책",
      empYmd: "입사일",
      salYmd: "급여일자",
      jtotAmt: "지급총액",
      gtotAmt: "공제총액",
      ctotAmt: "실지급액",
    },
  },
  salary_statement: {
    // SAL-0050 월별지급내역(§1.2) — SAL-0220 급여명세서(빈 응답·폐기)의 대체 (specs/011 D5)
    // SQL(getSALSalaryBassMgrTab110List) 정본 파라미터 = findText(급여년도 YYYY) + staffId.
    // cmmSearchStaffId/searchSYmd 계열은 읽지 않으며 staffId 누락 시 STAFF_ID=null로 항상 0건.
    path: "/SALSalaryBassMgr.do", cmd: "getSALSalaryBassMgrTab110List",
    needsPayItem: false, period: "year", staffParam: "staffId", gate: true,
    columns: {
      salYmd: "지급일",
      orgNm: "소속",
      posNm: "직위",
      jtotAmt: "지급합계",
      gtotAmt: "공제합계",
      ctotAmt: "실수령",
    },
  },
  daylabor: {
    path: "/SALDaylabMgr.do", cmd: "getSALDaylabMgrList",
    needsPayItem: false, period: "range", staffParam: "cmmSearchStaffId", gate: true,
    // ★계좌번호(accNo 암호문·accNoDecrypt 복호화 평문)·bankCd 절대 미노출.
    // salClassNm은 SQL alias 중복(호봉명↔은행명 덮어쓰기)으로 값 신뢰 불가 — 제외.
    columns: {
      workYmd: "근무일자",
      salYmd: "급여일자",
      staffNm: "성명",
      corpNm: "회사",
      orgNm: "소속",
      posNm: "직위",
      clsNm: "직급",
      empTypeNm: "직원구분",
      wktypeNm: "근무유형",
      staTime: "출근시간",
      endTime: "퇴근시간",
      workTime: "정상근무시간",
      overTime: "연장시간",
      hourlyAmt: "시급",
      dailyAmt: "일급",
      otAmt: "연장수당",
      etcAmt: "추가금액",
      payAmt: "지급액",
      taxEarnAmt: "과세금액",
      ntaxEarnAmt: "비과세금액",
      itaxAmt: "소득세",
      rtaxAmt: "지방소득세",
      insuranceAmt: "고용보험",
      deducAmt: "공제액",
      rpayAmt: "실지급액",
      memo: "특이사항",
    },
  },
};

const QUERY_LABELS = {
  pay_periods: "급여 지급 건 목록",
  payslip: "급여 지급항목 명세",
  deductions: "급여 공제내역",
  payslip_summary: "급여 요약(지급/공제/실수령 합계)",
  salary_statement: "월별 지급내역",
  daylabor: "일용직 급여 내역",
};

const FORBIDDEN_FIXED_VALUES = { searchType: ["mobile"] };

// "YYYYMM" → 전월 "YYYYMM"
function prevYm(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
        // 지급 건은 급여 마감(CLOSE_YN='Y') 후에만 조회된다(NsCode_SQL 실측) —
        // 월 미지정 시 이번달이 마감 전이면 항상 빈 결과가 되므로 최대 2개월 소급 폴백.
        // 사용자가 월을 명시한 경우에는 그 달만 조회한다(의도 존중).
        const explicitYm = resolveDateParam(year_month, "year_month");
        const tryYms = explicitYm
          ? [explicitYm]
          : [ym, prevYm(ym), prevYm(prevYm(ym))];

        this.introspect(`${label} 조회 중...`);
        for (const tryYm of tryYms) {
          const form = {
            cmd: PAY_PERIODS.cmd,
            queryId: "getSalYmdTypeCdList2",
            closeChk: "Y",
            searchYm: `${tryYm.slice(0, 4)}-${tryYm.slice(4, 6)}`, // §1.4 실측 형식 YYYY-MM(하이픈)
            applCd, // §1.4 실측 본문 — 빈 값이라도 항상 전송(임의 축약 금지)
            staffId: SELF_STAFF_ID_MARKER,
          };
          const { errorMessage, records, isEmpty } = await hrFetch(this, {
            path: PAY_PERIODS.path,
            form,
            gate: PAY_PERIODS.gate,
          });
          if (errorMessage) return errorMessage;
          if (!isEmpty) return formatPayPeriods(records, tryYm);
        }
        return explicitYm
          ? `> ⚠️ **${label}**: 해당 월에 지급된(마감된) 급여 건이 없습니다.`
          : `> ⚠️ **${label}**: 최근 3개월 내 지급된(마감된) 급여 건이 없습니다.`;
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
        // §1.1 필수 BODY: searchYm(YYYY-MM)은 searchItem(지급일 복합키) 선두에서 유도.
        // 형식 불일치 시 추측 주입 금지(카탈로그 "임의 축약 금지") — 호출 중단.
        const m = item.match(/^(\d{4})(\d{2})\d{2}/);
        if (!m) {
          return "> ⚠️ pay_item 형식이 올바르지 않습니다. pay_periods 결과의 코드값(예: 20260619P)을 그대로 사용하세요.";
        }
        form.searchItem = item;
        form.searchYm = `${m[1]}-${m[2]}`;
        form.searchType = "web"; // §1.1 고정 (mobile 금지)
      } else if (spec.period === "range") {
        const [sYmd, eYmd] = monthRange(ym);
        form.searchDateSYmd = sYmd;
        form.searchDateEYmd = eYmd;
      } else if (spec.period === "year") {
        // SAL-0050 Tab110: findText = 급여년도(YYYY). 연 단위 이력 조회.
        form.findText = ym.slice(0, 4);
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
      return formatSalary(records, label, spec.columns);
    } catch (e) {
      this.logger("Error in hr-salary", e.message);
      return `> ⚠️ 급여 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatPayPeriods(data, ym) {
  // 콤보 응답: [{ CODE_NM: "2026-06-25 정기급여", CODE: "20260625NN", ... }]
  const list = Array.isArray(data) ? data : data ? [data] : [];
  const ymLabel = ym ? ` (${ym.slice(0, 4)}-${ym.slice(4, 6)})` : "";
  let md = `## HR 급여 - 지급 건 목록${ymLabel}\n\n`;
  if (list.length === 0) return md + "> 지급된 급여 건이 없습니다.";
  md += "아래 급여 건 중 하나를 선택해 상세를 조회할 수 있습니다.\n\n";
  md += "| 급여 건 | 코드(pay_item) |\n|---|---|\n";
  for (const it of list) {
    const nm = it.CODE_NM ?? it.codeNm ?? it.code_nm ?? "";
    const code = it.CODE ?? it.code ?? "";
    md += `| ${nm} | \`${code}\` |\n`;
  }
  md += `\n> 총 **${list.length}건**. 특정 건 상세는 query_type=payslip/deductions/payslip_summary + pay_item=코드값.`;
  return md;
}

function formatSalary(data, label, columns) {
  const {
    normalizeData,
    renderTable,
    renderSummary,
    renderWhitelisted,
  } = require("../_shared/formatTable");

  let md = `## HR 급여 - ${label}\n\n`;

  // 화이트리스트 정의가 있으면 선별 렌더 (detail HTML·내부 PK·코드 제외)
  if (columns) {
    const table = renderWhitelisted(data, columns);
    return table ? md + table : md + "> 조회된 데이터가 없습니다.";
  }

  const { rows, summary } = normalizeData(data);
  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
