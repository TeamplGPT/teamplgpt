// hr-salary/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/004 r2·003·011).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md (신판) §1.
//  - 급여명세는 2단계: pay_periods(월→지급건 목록, §1.4) → searchItem(급여일자+유형 복합키)로
//    SAL-0527 명세 조회(§1.1). 필수 BODY: searchYm(YYYY-MM 하이픈, searchItem에서 유도) +
//    searchType=web 고정(mobile 금지). 기간 이력은 SAL-0050 월별지급내역(§1.2 — SAL-0220 폐기 대체).
//  - 대상 식별자는 LLM 미노출: $SELF_STAFF_ID 마커 → 브리지(ssnStaffId)/HR_STAFF_ID(폴백) 치환.
const { resolveDateParam } = require("../_shared/dateResolver");
const { resolveYearPeriod } = require("../_shared/periodResolver");
const { periodProblem } = require("../_shared/periodCheck");
const {
  runMonthly,
  monthlyPeriod,
  withPeriodHeader,
  monthLabel,
} = require("../_shared/yearQuery");
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
  payslip: "급여명세서",
  deductions: "급여 공제내역",
  payslip_summary: "급여 요약(지급/공제/실수령 합계)",
  salary_statement: "월별 지급내역",
  daylabor: "일용직 급여 내역",
};

const FORBIDDEN_FIXED_VALUES = { searchType: ["mobile"] };

// 연도 단위 질의("올해"/"2026년" …)를 받는 명세 조회 → 기간 성격 (specs/015 data-model §2).
// record=올해면 오늘까지. salary_statement는 연도만 보내는 endpoint(findText=YYYY)라 요청 범위가
// 항상 그해 전체 — 머리 줄도 그해 전체(schedule)로 적는다. pay_periods는 1단계에서 따로 처리하고,
// payslip 계열은 pay_item으로 지급 건이 특정되므로 해당 없다.
const YEAR_KIND_BY_QUERY_TYPE = { daylabor: "record", salary_statement: "schedule" };

// 지급 건 목록 요청 BODY (§1.4 실측 본문)
function payPeriodsForm(ym, applCd) {
  return {
    cmd: PAY_PERIODS.cmd,
    queryId: "getSalYmdTypeCdList2",
    closeChk: "Y",
    searchYm: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`, // §1.4 실측 형식 YYYY-MM(하이픈)
    applCd, // §1.4 실측 본문 — 빈 값이라도 항상 전송(임의 축약 금지)
    staffId: SELF_STAFF_ID_MARKER,
  };
}

// "YYYYMM" → 전월 "YYYYMM"
const dashedYm = (ym) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;

// 이번 달 지급 건이 없어 이전 달 건을 보여줄 때 붙이는 안내(사용자에게도 보인다)
function notYetPaidNote(requestedYm, shownYm) {
  if (requestedYm === shownYm) return "";
  const which = shownYm === prevYm(requestedYm) ? "지난달" : "가장 최근";
  return (
    `\n> 이번 달(${dashedYm(requestedYm)}) 급여는 아직 지급(마감) 전이라 ${which}(${dashedYm(shownYm)}) 지급 건을 보여드려요.` +
    `\n> [답변 지침] 이 지급 건은 이번 달이 아니라 ${which}(${dashedYm(shownYm)}) 건입니다. 답변 첫 문장에 '이번 달 급여는 아직 지급 전이라 ${which}(${Number(shownYm.slice(4, 6))}월) 기준'이라고 밝히고, ${which} 금액을 '이번 달'이라고 부르지 마세요. 이 줄은 답변에 포함하지 마세요.`
  );
}

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
      // 기간을 말했는데 해석하지 못하면 다른 기간으로 바꿔 조회하지 않고 안내(2026-10-21, _shared/periodCheck)
      const periodMsg = periodProblem(year_month);
      if (periodMsg) return periodMsg;

      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      const label = QUERY_LABELS[query_type];

      // --- 1단계: 지급 건 목록 ---
      if (query_type === "pay_periods") {
        const applCd = String(this.runtimeArgs["HR_SAL_APPL_CD"] || "").trim();
        // 연도 단위 질의(specs/015)는 1월부터 달마다 조회해 합친다 — 아니면 아래 기존 경로.
        const yearPeriod = resolveYearPeriod(year_month, { kind: "record" });
        if (yearPeriod) {
          // 달 단위로 조회하므로 머리 줄도 월 단위 표기(이번 달은 오늘 이후 지급분 포함 가능)
          return await runYearPayPeriods(this, {
            applCd,
            label,
            yearPeriod: monthlyPeriod(yearPeriod),
          });
        }
        // 지급 건은 급여 마감(CLOSE_YN='Y') 후에만 조회된다(NsCode_SQL 실측) —
        // 월 미지정 시 이번달이 마감 전이면 항상 빈 결과가 되므로 최대 2개월 소급 폴백.
        // 사용자가 월을 명시한 경우에는 그 달만 조회한다(의도 존중).
        const explicitYm = resolveDateParam(year_month, "year_month");
        // 이번 달(또는 달 미지정)이면 아직 지급 전일 수 있어 지난달·지지난달까지 본다(사용자 결정 2026-11-18).
        // 과거 달을 콕 집은 질문은 그 달만 — 다른 달로 바꿔 답하지 않는다.
        const currentYm = resolveDateParam("이번달", "year_month");
        const tryYms =
          explicitYm && explicitYm !== currentYm
            ? [explicitYm]
            : [ym, prevYm(ym), prevYm(prevYm(ym))];

        this.introspect(`${label} 조회 중...`);
        for (const tryYm of tryYms) {
          const { errorMessage, records, isEmpty } = await hrFetch(this, {
            path: PAY_PERIODS.path,
            form: payPeriodsForm(tryYm, applCd),
            gate: PAY_PERIODS.gate,
          });
          if (errorMessage) return errorMessage;
          if (!isEmpty) return formatPayPeriods(records, tryYm) + notYetPaidNote(ym, tryYm);
        }
        return explicitYm
          ? `> ⚠️ **${label}**: 해당 월에 지급된(마감된) 급여 건이 없습니다.`
          : `> ⚠️ **${label}**: 최근 3개월 내 지급된(마감된) 급여 건이 없습니다.`;
      }

      // --- 2단계: 명세 조회 ---
      const spec = ENDPOINT_MAP[query_type];
      const form = {};
      if (spec.cmd) form.cmd = spec.cmd;

      // 연도 단위 질의면 기간 칸만 그해로 바꾸고 결과에 "조회 기간" 줄을 붙인다(specs/015).
      const yearKind = YEAR_KIND_BY_QUERY_TYPE[query_type];
      const yearPeriod = yearKind ? resolveYearPeriod(year_month, { kind: yearKind }) : null;
      const withPeriod = (out) => (yearPeriod ? withPeriodHeader(out, yearPeriod) : out);

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
        const [sYmd, eYmd] = yearPeriod ? [yearPeriod.start, yearPeriod.end] : monthRange(ym);
        form.searchDateSYmd = sYmd;
        form.searchDateEYmd = eYmd;
      } else if (spec.period === "year") {
        // SAL-0050 Tab110: findText = 급여년도(YYYY). 연 단위 이력 조회.
        // "재작년"처럼 dateResolver가 못 읽는 연도 표현은 periodResolver 결과를 쓴다(specs/015)
        form.findText = yearPeriod ? yearPeriod.year : ym.slice(0, 4);
      }

      if (spec.staffParam) form[spec.staffParam] = SELF_STAFF_ID_MARKER;

      for (const [k, v] of Object.entries(spec.fixed || {})) {
        if ((FORBIDDEN_FIXED_VALUES[k] || []).includes(v)) continue;
        form[k] = v;
      }

      // 급여명세서는 5240 화면처럼 합계·지급·공제·기재를 한 답으로(specs/024)
      if (query_type === "payslip") {
        this.introspect(`${label} 조회 중...`);
        return withPeriod(await runPayslipStatement(this, form, label));
      }

      this.introspect(`${label} 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: spec.path,
        form,
        gate: spec.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return withPeriod(`> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`);
      }

      this.introspect(`${label} 조회 완료.`);
      return withPeriod(formatSalary(records, label, spec.columns));
    } catch (e) {
      this.logger("Error in hr-salary", e.message);
      return `> ⚠️ 급여 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

// ─── 급여명세서 (specs/024 contracts/payslip-answer.md) ─────────────────────────
// 5240 급여명세서 화면(SAL-0220·0230, kiwibox salSalaryDtstmnMgr)과 같은 구성:
// 합계(Map) → 지급내역(List) → 공제내역(List2) → 기재사항(List3). 같은 지급 건·본인 사번 form에 cmd만 바꾼다.
const PAYSLIP_SECTIONS = [
  ["summary", "getSALSalaryDtstmnMgrMap"],
  ["pay", "getSALSalaryDtstmnMgrList"],
  ["deduction", "getSALSalaryDtstmnMgrList2"],
  ["entry", "getSALSalaryDtstmnMgrList3"],
];
// 공통코드 SAL_ENTR_CD (kiwibox common-code-catalog)
const ENTRY_KIND_NAMES = { E: "기준항목", T: "근태항목" };

async function runPayslipStatement(ctx, form, label) {
  const results = await Promise.all(
    PAYSLIP_SECTIONS.map(([, cmd]) =>
      hrFetch(ctx, { path: ENDPOINT_MAP.payslip.path, form: { ...form, cmd }, gate: ENDPOINT_MAP.payslip.gate })
    )
  );
  const by = Object.fromEntries(PAYSLIP_SECTIONS.map(([key], i) => [key, results[i]]));
  if (results.every((r) => r.errorMessage)) return results[0].errorMessage;
  if (results.every((r) => !r.errorMessage && r.isEmpty)) {
    return `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`;
  }
  return formatPayslipStatement(by, label);
}

const fieldOf = (row, camelKey) => {
  const snake = camelKey.replace(/([A-Z])/g, "_$1").toUpperCase();
  return row?.[camelKey] ?? row?.[snake] ?? row?.[snake.toLowerCase()];
};
const amountOf = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// 항목 칸 — 5240이 준 값 그대로(숫자로 못 바꾸는 값을 0으로 바꿔 보이지 않게), 비었을 때만 0
const cellAmount = (v) => {
  const raw = String(v ?? "").trim();
  if (raw === "") return 0;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : raw;
};
const rowsOf = (res) => (Array.isArray(res.records) ? res.records : res.records ? [res.records] : []);

function formatPayslipStatement(by, label) {
  const { renderTable, ANSWER_GUIDE } = require("../_shared/formatTable");
  // 표만 — 공통 응답 지침은 맨 끝에 한 번(지침 뒤 줄은 표 블록에서 잘린다, research R7)
  const table = (rows) => {
    const md = renderTable(rows);
    return (md.endsWith(ANSWER_GUIDE) ? md.slice(0, -ANSWER_GUIDE.length) : md).trimEnd();
  };
  const failed = (name, particle) => `> **${name}**${particle} 조회하지 못했어요`;
  const parts = [`## HR 급여 - ${label}`];

  // 합계 — 5240 값 그대로. 실패하면 계산해 넣지 않는다(spec D7·FR-002)
  const sum = by.summary;
  if (sum.errorMessage) parts.push(failed("합계", "는"));
  else if (sum.isEmpty) parts.push("> **합계** 조회된 값이 없어요");
  else {
    const m = rowsOf(sum)[0] || {};
    parts.push(
      "> **합계**\n\n" +
        table([{ 지급금액: fieldOf(m, "jtotAmt") ?? "", 공제금액: fieldOf(m, "gtotAmt") ?? "", 실지급액: fieldOf(m, "ctotAmt") ?? "" }])
    );
  }

  // 지급내역 — 지급구분·급여연월 숨김, 소급금액은 합이 0이 아닐 때만(5240 화면과 같음)
  const pay = by.pay;
  if (pay.errorMessage) parts.push(failed("지급내역", "은"));
  else {
    const rows = pay.isEmpty ? [] : rowsOf(pay);
    const resalTotal = rows.reduce((a, r) => a + amountOf(fieldOf(r, "resalAmt")), 0);
    const total = rows.reduce((a, r) => a + amountOf(fieldOf(r, "salAmt")), 0);
    const line = (name, amt, resal) => ({ 지급항목: name, 지급금액: amt, ...(resalTotal !== 0 ? { 소급금액: resal } : {}) });
    parts.push(
      rows.length === 0
        ? "> **지급내역** 0건"
        : `> **지급내역** ${rows.length}건\n\n` +
            table([
              ...rows.map((r) => line(fieldOf(r, "salItemNm") ?? "", cellAmount(fieldOf(r, "salAmt")), cellAmount(fieldOf(r, "resalAmt")))),
              line("합계", total, resalTotal),
            ])
    );
  }

  // 공제내역
  const ded = by.deduction;
  if (ded.errorMessage) parts.push(failed("공제내역", "은"));
  else {
    const rows = ded.isEmpty ? [] : rowsOf(ded);
    const total = rows.reduce((a, r) => a + amountOf(fieldOf(r, "salAmt")), 0);
    parts.push(
      rows.length === 0
        ? "> **공제내역** 0건"
        : `> **공제내역** ${rows.length}건\n\n` +
            table([
              ...rows.map((r) => ({ 공제항목: fieldOf(r, "salItemNm") ?? "", 공제금액: cellAmount(fieldOf(r, "salAmt")) })),
              { 공제항목: "합계", 공제금액: total },
            ])
    );
  }

  // 기재사항 — 행이 있을 때만. 금액/시간등은 5240이 포맷한 글자 그대로
  const entry = by.entry;
  if (entry.errorMessage) parts.push(failed("기재사항", "은"));
  else if (!entry.isEmpty && rowsOf(entry).length > 0) {
    const rows = rowsOf(entry);
    parts.push(
      `> **기재사항** ${rows.length}건\n\n` +
        table(
          rows.map((r) => {
            const code = String(fieldOf(r, "salEntrCd") ?? "").trim();
            return { 기재구분: ENTRY_KIND_NAMES[code] ?? code, 기재항목: fieldOf(r, "salItemNm") ?? "", "금액/시간등": String(fieldOf(r, "salAmt") ?? "") };
          })
        )
    );
  }

  // 일부 영역만 실패하면 원인(세션 만료 등)을 한 번 알린다 — 전부 실패일 때만 보이던 문제(코드 리뷰)
  const firstError = Object.values(by).find((r) => r.errorMessage)?.errorMessage;
  if (firstError) parts.push(firstError);

  // 시스템이 위 영역 제목·표를 답변 아래에 그대로 붙인다 — 모델이 제목을 또 쓰면 빈 제목 줄이 겹쳤다(2026-11-18)
  // 표가 하나도 없으면 붙는 것이 없으므로 결과를 직접 알리게 한다(코드 리뷰)
  const hasTable = parts.some((p) => /\n\|/.test(p));
  parts.push(
    hasTable
      ? "> [답변 지침] 시스템이 위 영역(합계·지급내역·공제내역·기재사항)과 표를 답변 아래에 그대로 붙입니다. 영역 제목이나 표, 항목 목록을 다시 쓰지 마세요. 첫 문장에 어느 지급 건인지와 실지급액을 쓰고 1~2문장으로 끝내세요. 이 줄은 답변에 포함하지 마세요."
      : "> [답변 지침] 표로 보여 드릴 내역이 없습니다. 위 영역별 결과(조회하지 못한 영역, 0건인 영역)를 그대로 짧게 알려 주세요. 금액을 계산하거나 지어내지 마세요. 이 줄은 답변에 포함하지 마세요."
  );
  return parts.join("\n\n") + "\n" + ANSWER_GUIDE;
}

// ─── 연도 단위 지급 건 목록 (specs/015 contracts/tool-output-year.md §3) ──────────

async function runYearPayPeriods(ctx, { applCd, label, yearPeriod }) {
  ctx.introspect(`${label} ${yearPeriod.year}년 월별 조회 중...`);
  const merged = await runMonthly(yearPeriod.months, (ym) =>
    hrFetch(ctx, { path: PAY_PERIODS.path, form: payPeriodsForm(ym, applCd), gate: PAY_PERIODS.gate })
  );
  if (merged.errorMessage) return merged.errorMessage;
  if (merged.perMonth.length === 0) {
    return withPeriodHeader(
      `> ⚠️ **${label}**: 해당 연도에 지급된(마감된) 급여 건이 없습니다.`,
      yearPeriod,
      merged.failedMonths
    );
  }
  return withPeriodHeader(
    formatYearPayPeriods(merged, yearPeriod.year),
    yearPeriod,
    merged.failedMonths
  );
}

// 마감이 늦은 건은 다음 달 조회에도 다시 나온다 — 코드(pay_item)가 같으면 처음 나온 달 것만 남긴다.
function formatYearPayPeriods({ perMonth, emptyMonths }, year) {
  const all = perMonth.flatMap(({ ym, records }) =>
    (Array.isArray(records) ? records : records ? [records] : []).map((it) => ({
      ym,
      nm: it.CODE_NM ?? it.codeNm ?? it.code_nm ?? "",
      code: it.CODE ?? it.code ?? "",
    }))
  );
  // 코드가 빈 행은 서로 다른 건일 수 있어 합치지 않는다
  const rows = all.filter(
    (r, i) => r.code === "" || all.findIndex((x) => x.code === r.code) === i
  );

  // 지급 건 코드는 내부값 — 표에서 빼고 내부 참조 줄로만(월 단위 formatPayPeriods와 같게).
  // 018부터 표는 시스템이 사용자에게 그대로 붙이므로 표 칸에 코드가 있으면 그대로 노출된다(보안 리뷰 C1)
  const lines = [
    `## HR 급여 - 지급 건 목록 (${year}년)`,
    "",
    "| 월 | 급여 건 |",
    "|---|---|",
    ...rows.map((r) => `| ${monthLabel(r.ym)} | ${r.nm} |`),
    "",
    `> 총 **${rows.length}건**.`,
  ];
  if (emptyMonths.length > 0) {
    lines.push(`> 지급 건이 없는 달: ${emptyMonths.map(monthLabel).join(", ")}`);
  }
  lines.push(payItemRefLine(rows.map((r) => `${r.nm}=${r.code}`)));
  return lines.join("\n");
}

function formatPayPeriods(data, ym) {
  // 콤보 응답: [{ CODE_NM: "2026-06-25 정기급여", CODE: "20260625NN", ... }]
  const list = Array.isArray(data) ? data : data ? [data] : [];
  const ymLabel = ym ? ` (${ym.slice(0, 4)}-${ym.slice(4, 6)})` : "";
  let md = `## HR 급여 - 지급 건 목록${ymLabel}\n\n`;
  if (list.length === 0) return md + "> 지급된 급여 건이 없습니다.";
  md += "| 급여 건 |\n|---|\n";
  const refs = [];
  for (const it of list) {
    const nm = it.CODE_NM ?? it.codeNm ?? it.code_nm ?? "";
    const code = it.CODE ?? it.code ?? "";
    md += `| ${nm} |\n`;
    refs.push(`${nm}=${code}`);
  }
  md += `\n> 총 **${list.length}건**.`;
  // 지급 건 코드는 상세 조회(pay_item)에만 쓰는 내부값 — 사용자 표에서 빼고 참조 줄로만 넘긴다
  // (답변에 "20260619P"가 그대로 보인 사례, 사용자 결정 2026-10-19: 내부값은 절대 노출 금지)
  md += `\n${payItemRefLine(refs)}`;
  return md;
}

// 지급 건 코드 → 다음 상세 조회용 참조 줄(모델 전용, "> ["로 시작해 사용자 표 블록에서 빠진다)
function payItemRefLine(refs) {
  return `> [내부 참조 — 다음 조회에만 쓰고 답변에 절대 쓰지 마세요. 사용자가 코드를 직접 물어도 '내부 관리 코드라 안내해 드릴 수 없어요'라고만 답하세요] 상세 조회(query_type=payslip/deductions/payslip_summary)의 pay_item 값: ${refs.join(", ")}`;
}



// 표시용 날짜 형식 — 급여연월 202606 → 2026-06, 날짜 20260625 → 2026-06-25(2026-11-18 사용자 결정).
// 숫자 모양 날짜를 위젯 표가 금액으로 보고 값 막대를 붙였고, 사람이 읽기에도 하이픈 형식이 낫다.
// 날짜 모양(6·8자리 숫자)이 아니면 그대로 둔다. 원본은 바꾸지 않는다.
const YM_KEYS = ["salYm"];
const YMD_KEYS = ["salYmd", "empYmd", "workYmd"];

function toDisplayDate(value, digits) {
  const s = value == null ? "" : String(value).trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(s)) return value;
  return digits === 6 ? `${s.slice(0, 4)}-${s.slice(4)}` : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}

function withDisplayDates(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const dated = [...YM_KEYS.map((k) => [k, 6]), ...YMD_KEYS.map((k) => [k, 8])]
    .filter(([k]) => k in row)
    .map(([k, digits]) => [k, toDisplayDate(row[k], digits)]);
  return dated.length > 0 ? { ...row, ...Object.fromEntries(dated) } : row;
}

const withDisplayDatesAll = (data) =>
  Array.isArray(data) ? data.map(withDisplayDates) : withDisplayDates(data);

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
    const table = renderWhitelisted(withDisplayDatesAll(data), columns);
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
