// hr-salary/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/004 r2·003·011).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md (신판) §1.
//  - 급여명세는 2단계: pay_periods(월→지급건 목록, §1.4) → searchItem(급여일자+유형 복합키)로
//    SAL-0527 명세 조회(§1.1). 필수 BODY: searchYm(YYYY-MM 하이픈, searchItem에서 유도) +
//    searchType=web 고정(mobile 금지). 기간 이력은 SAL-0050 월별지급내역(§1.2 — SAL-0220 폐기 대체).
//  - 대상 식별자는 LLM 미노출: $SELF_STAFF_ID 마커 → 브리지(ssnStaffId)/HR_STAFF_ID(폴백) 치환.
// 기간 정책은 _shared 공통(specs/022 P0-3)
const { resolveMonthScope } = require("../_shared/periodPolicy");
const {
  hrFetch,
  monthRange,
  todayDashed,
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
// (kiwibox SALPayslipNewMgr_SQL.xml·SALDaylabMgr_SQL.xml 대조)
const ENDPOINT_MAP = {
  payslip: {
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrList",
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
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrList2",
    needsPayItem: true, staffParam: "cmmSearchStaffId", gate: true,
    columns: {
      salItemNm: "공제항목",
      salYm: "급여연월",
      salAmt: "공제금액",
    },
  },
  payslip_summary: {
    path: "/SALPayslipNewMgr.do", cmd: "getSALPayslipNewMgrMap",
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
    path: "/SALSalaryBassMgr.do", cmd: "getSALSalaryBassMgrTab110List",
    needsPayItem: false, period: "month", staffParam: "cmmSearchStaffId", gate: true,
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

module.exports.runtime = {
  handler: async function ({ query_type, year_month, pay_item }) {
    try {
      const valid = ["pay_periods", ...Object.keys(ENDPOINT_MAP)];
      if (!query_type || !valid.includes(query_type)) {
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${valid.join(", ")}`;
      }

      const { ym, ymGiven } = resolveMonthScope(year_month);
      const label = QUERY_LABELS[query_type];

      // --- 1단계: 지급 건 목록 ---
      if (query_type === "pay_periods") {
        const applCd = String(this.runtimeArgs["HR_SAL_APPL_CD"] || "").trim();
        const form = {
          cmd: PAY_PERIODS.cmd,
          queryId: "getSalYmdTypeCdList2",
          closeChk: "Y",
          searchYm: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`, // §1.4 실측 형식 YYYY-MM(하이픈)
          applCd, // §1.4 실측 본문 — 빈 값이라도 항상 전송(임의 축약 금지)
          staffId: SELF_STAFF_ID_MARKER,
        };

        this.introspect(`${label} 조회 중...`);
        const { errorMessage, records, isEmpty } = await hrFetch(this, {
          path: PAY_PERIODS.path,
          form,
          gate: PAY_PERIODS.gate,
        });
        if (errorMessage) return errorMessage;
        if (isEmpty) {
          // 월을 명시하지 않았다면 "이번 달"은 우리가 넣은 기본값일 뿐 사용자의 뜻이 아니다.
          // 급여는 25일 지급이라 매월 1~24일의 이번 달은 정상적으로 0건이고, 여기서
          // 멈추면 "급여 없음"으로 끝나 payslip/deductions/payslip_summary 3종이
          // 그 기간 내내 답을 못 한다(실측 2026-08-19: 6/6 실패).
          // 결재함(EAPRequestMgr unscopedByDefault)과 같은 판단 — 기간 미지정을
          // 이번 달로 좁히지 않는다.
          if (!ymGiven) {
            const recent = await fetchRecentPayPeriods(this, ym);
            if (recent.length) return formatPayPeriods(recent, ym);
          }
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
      } else if (spec.period === "month") {
        // SAL-0050은 월 범위가 아니라 **연도** 단위다. 정본 SQL(SALSalaryBassMgr_SQL.xml)이
        //   AND D.SAL_YMD  LIKE x.sal_yyyy || '%'   -- x.sal_yyyy = #{findText}
        //   AND D.STAFF_ID = x.staff_id             -- x.staff_id  = #{staffId}
        // 로 거르기 때문에, findText/staffId가 없으면 조건이 NULL이 되어 항상 0행이다.
        // 실측(2026-08-19 ntest): 현행 파라미터로는 2025·2026 전 범위 0행,
        // findText+staffId로는 2026년 6행·2025년 14행. CLOSE_YN='Y'라 마감분만 나온다.
        form.findText = ym.slice(0, 4);
        form.staffId = SELF_STAFF_ID_MARKER;
        // 아래 3개는 SQL이 참조하지 않아 무시되지만 카탈로그 §1.2 기재 본문이라 유지
        // (§5.2-3 "실측 성공 본문 전량, 임의 축약 금지").
        const [sYmd, eYmd] = monthRange(ym);
        form.searchSYmd = sYmd;
        form.searchEYmd = eYmd;
        form.searchBaseYmd = todayDashed();
      }

      if (spec.staffParam) form[spec.staffParam] = SELF_STAFF_ID_MARKER;

      for (const [k, v] of Object.entries(spec.fixed || {})) {
        if ((FORBIDDEN_FIXED_VALUES[k] || []).includes(v)) continue;
        form[k] = v;
      }

      // 정본 합계는 **본 조회보다 먼저** 가져온다. E2E의 mock_body_pattern은 마지막
      // .do 호출의 body를 보므로, 뒤에 붙이면 본 조회 대신 요약 요청이 검증 대상이 돼
      // 기존 시나리오(KB43 등)가 깨진다. 순서만 바꾸면 단정은 그대로 유지된다.
      const summaryLine =
        query_type === "payslip" || query_type === "deductions"
          ? await summaryLineFor(this, form.searchItem, form.searchYm)
          : "";

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
      return formatSalary(records, label, spec.columns) + summaryLine;
    } catch (e) {
      this.logger("Error in hr-salary", e.message);
      return `> ⚠️ 급여 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

/**
 * 이번 달에 지급 건이 없을 때 최근 지급 건을 찾아 pay_periods와 같은 형태로 돌려준다.
 *
 * SAL-0050 월별지급내역(연 단위 조회)의 salYmd + salTypeCd를 이으면 pay_periods가 주는
 * 코드와 같은 형식이 된다 — 실측(2026-08-19 ntest): salYmd=20260725·salTypeCd=P 이고
 * 2026-07 pay_periods가 준 코드가 정확히 "20260725P"였다.
 * 월을 하나씩 거슬러 부르면 최악 12회 호출이지만 이 경로는 연 1회 호출로 끝난다.
 * 해가 바뀐 직후를 위해 전년도까지만 한 번 더 본다(그 이상은 조회 의도로 보기 어렵다).
 */
async function fetchRecentPayPeriods(ctx, ym) {
  const thisYear = Number(ym.slice(0, 4));
  for (const year of [thisYear, thisYear - 1]) {
    const { errorMessage, records, isEmpty } = await hrFetch(ctx, {
      path: "/SALSalaryBassMgr.do",
      form: {
        cmd: "getSALSalaryBassMgrTab110List",
        findText: String(year),
        staffId: SELF_STAFF_ID_MARKER,
      },
      gate: true,
    });
    if (errorMessage || isEmpty) continue;
    const rows = Array.isArray(records) ? records : [records];
    const periods = rows
      .map((r) => {
        const ymd = String(r.salYmd ?? r.SAL_YMD ?? "").trim();
        const type = String(r.salTypeCd ?? r.SAL_TYPE_CD ?? "").trim();
        // 코드를 만들 수 없는 행은 버린다 — 추측해 넣으면 없는 pay_item을 부르게 된다.
        if (!/^\d{8}$/.test(ymd) || !type) return null;
        const dashed = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
        const kind = String(r.posNm ?? r.POS_NM ?? "급여").trim() || "급여";
        return { codeNm: `${dashed} ${kind}`, code: `${ymd}${type}` };
      })
      .filter(Boolean)
      .sort((a, b) => b.code.localeCompare(a.code));
    if (periods.length) return periods;
  }
  return [];
}

function formatPayPeriods(data, fallbackFromYm) {
  // 콤보 응답: [{ CODE_NM: "2026-06-25 정기급여", CODE: "20260625NN", ... }]
  const list = Array.isArray(data) ? data : data ? [data] : [];
  let md = `## HR 급여 - 지급 건 목록\n\n`;
  if (list.length === 0) return md + "> 지급된 급여 건이 없습니다.";
  if (fallbackFromYm) {
    md += `> ${fallbackFromYm.slice(0, 4)}년 ${Number(fallbackFromYm.slice(4, 6))}월은 아직 지급된 급여가 없어 **최근 지급 건**을 대신 조회했습니다.\n\n`;
  }
  md += "아래 급여 건 중 하나를 선택해 상세를 조회할 수 있습니다.\n\n";
  md += "| 급여 건 | 코드(pay_item) |\n|---|---|\n";
  for (const it of list) {
    const nm = it.CODE_NM ?? it.codeNm ?? it.code_nm ?? "";
    const code = it.CODE ?? it.code ?? "";
    md += `| ${nm} | \`${code}\` |\n`;
  }
  md += `\n> 총 **${list.length}건**. 특정 건 상세는 query_type=payslip/deductions/payslip_summary/salary_statement + pay_item=코드값.`;
  // 목록만 주고 "어느 건을 볼까요?"로 끝나면 사용자가 원한 답(명세·공제·실수령)이 안 나온다.
  // 사용자가 월을 말하지 않은 경로이므로 되묻지 말고 최신 건으로 이어가게 지시한다.
  if (fallbackFromYm) {
    md += `\n> [필수] 사용자가 월을 지정하지 않았습니다. 되묻지 말고 **맨 위(가장 최근) 건**의 코드로 요청한 조회를 이어서 수행하고, 어느 달 기준인지 답변에 밝히세요.`;
  }
  return md;
}

/**
 * 지급항목·공제항목 표 뒤에 정본 합계(SAL-0527 요약)를 함께 실어 준다.
 *
 * 두 표를 본 뒤 "실수령액은?"을 물으면 모델이 payslip_summary를 호출하지 않고 표를
 * 직접 더해 답하는 일이 있다 — 실측(2026-08-19) 8회 중 3회. 그리고 **계산을 틀린다**:
 * 정본 2,661,100원인데 2,961,100원이라 답한 사례가 있다(자릿수 실수).
 * tool을 호출한 회차는 전부 정확했으므로 호출 여부와 정확도가 직결된다.
 *
 * description의 [CRITICAL]과 문구 가드로는 재호출률이 4/5에 그쳐 결정적이지 않았다.
 * 그래서 "부르라고 시키는" 대신 **계산할 필요를 없앤다** — 합계를 표 아래 그대로 둔다.
 * 모델이 tool을 다시 부르든 안 부르든 읽어 쓸 값이 이미 있으므로 산술이 개입하지 않는다.
 * 비용은 조회당 요약 1회 추가. 실패해도 표는 그대로 반환한다(부가 정보이므로 조회를 막지 않는다).
 * 호출 순서는 본 조회보다 **앞**이다 — 호출부 주석 참조.
 */
async function summaryLineFor(ctx, searchItem, searchYm) {
  if (!searchItem || !searchYm) return "";
  try {
    const { errorMessage, records, isEmpty } = await hrFetch(ctx, {
      path: ENDPOINT_MAP.payslip_summary.path,
      form: {
        cmd: ENDPOINT_MAP.payslip_summary.cmd,
        searchItem,
        searchYm,
        searchType: "web",
        cmmSearchStaffId: SELF_STAFF_ID_MARKER,
      },
      gate: ENDPOINT_MAP.payslip_summary.gate,
    });
    if (errorMessage || isEmpty) return "";
    const m = Array.isArray(records) ? records[0] : records;
    if (!m) return "";
    const pick = (k) => m[k] ?? m[k.toUpperCase()];
    const [j, g, c] = [pick("jtotAmt"), pick("gtotAmt"), pick("ctotAmt")];
    if (j == null || g == null || c == null) return "";
    return (
      `\n> **정본 합계** — 지급총액 ${j} · 공제총액 ${g} · **실지급액 ${c}**\n` +
      "> [필수] 실수령액·실지급액·총지급·총공제를 물으면 위 값을 그대로 쓰세요." +
      " 표의 항목을 더하거나 빼서 계산하지 마세요.\n"
    );
  } catch (_) {
    return "";
  }
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
