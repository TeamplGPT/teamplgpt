// hr-attendance/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/001·003·011).
// 근거 카탈로그: $KIWIBOX/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md (신판)
//   $KIWIBOX 경로를 모르면 사용자에게 묻거나 아래로 찾는다. 절대경로를 코드에 박지 말 것.
//   find ~ -maxdepth 7 -path "*spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md" 2>/dev/null
//   (절차 원본: HR-SKILL-GUIDE.md "0. 사전 준비")
//  - 일일 근태 정본 = TAA-1410 근태현황(§2.1). 휴가/연차 정본 = TAADclzVcatnList
//    List1/List2(§3, 모바일 getMBL* 미사용 판정). BODY는 실측 성공 본문 전량(임의 축약 금지).
//  - 대상 식별자는 LLM 미노출: $SELF_STAFF_ID 마커 → 브리지(ssnStaffId) 또는
//    HR_STAFF_ID(서버 폴백)가 kiwibox 내부 STAFF_ID로 치환. self 강제(카탈로그 §0).
const { resolveDateParam } = require("../_shared/dateResolver");
const {
  hrFetch,
  monthRange,
  todayDashed,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// period: "range"=searchBaseSYmd/EYmd, "range-alt"=searchSYmd/EYmd,
//         "range-both"=둘 다(§2.1 실측), "ym"=searchYm, "none"
// staffParam: 문자열 또는 배열(다중 사번 파라미터 동시 마커 주입)
// leaveBody: §3 휴가 공통 BODY(wkareaCd·휴가/회계연도 범위·searchBaseYmd·chkAppYn) 주입
// baseYmdDashed: searchBaseYmd={오늘 YYYY-MM-DD} 주입 (§2.2)
const ENDPOINT_MAP = {
  timesheet: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList", // TAA-1410 정본(§2.1)
    period: "range-both", staffParam: "cmmSearchStaffId", gate: true,
  },
  work_status: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList",
    period: "range-both", staffParam: "cmmSearchStaffId", gate: true,
  },
  work_calendar: {
    // SQL(getTAADclzWorkSearchCldr) 필수 파라미터 = searchYm + searchId + searchSYmd/EYmd.
    // searchSYmd/EYmd 미전송 시 A.YMD BETWEEN null로 항상 0건이 된다(실측 SQL 대조).
    path: "/TAADclzWorkSearchCldr.do", cmd: "getTAADclzWorkSearchCldr",
    period: "ym", rangeAltToo: true,
    staffParam: ["searchId", "cmmSearchStaffId"], gate: false,
    baseYmdDashed: true, // §2.2 — searchId 무게이트, self 강제 필수
  },
  overtime: {
    // SQL(getTAADclzWorkOtSchdulList2) 정본 기간 파라미터 = searchYm(YYYYMM).
    // searchBaseSYmd/EYmd는 읽지 않아 미전송 시 base_ym=null로 항상 0건이 된다.
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList2",
    period: "ym", staffParam: "cmmSearchStaffId", gate: true,
    fixed: { searchType: "2" }, // §2.6 실측
  },
  overtime_limit: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList",
    period: "ym", staffParam: "cmmSearchStaffId", gate: true,
    fixed: { searchType: "2" },
  },
  leave_requests: {
    path: "/TAADclzVcatnList.do", cmd: "getTAADclzVcatnList2", // TAA-0490 정본(§3.2)
    period: "none", staffParam: ["staffId", "cmmSearchStaffId"], gate: false,
    leaveBody: true,
  },
  annual_leave_balance: {
    path: "/TAADclzVcatnList.do", cmd: "getTAADclzVcatnList1", // TAA-1310 정본(§3.1)
    period: "none", staffParam: ["staffId", "cmmSearchStaffId"], gate: false,
    leaveBody: true,
  },
  vacation_calendar: {
    path: "/TAADclzVcatnCldrMgr.do", cmd: "getTAADclzVcatnCldrMgr",
    period: "range-alt", staffParam: null, gate: true, // 신판 미수록 — 현행 유지(specs/011 D7)
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

// 게이트 스킵 파라미터 주입 금지 (§4.5 searchType=mobile 사례 방어)
const FORBIDDEN_FIXED_VALUES = { searchType: ["mobile"] };

// query_type별 응답 컬럼 화이트리스트 (실측 — 내부 PK·사번·코드 제외, 한글 라벨).
// 정의 없는 query_type은 통짜 렌더(하위호환) — 실측 후 순차 추가.
const COLUMNS_BY_QT = {
  annual_leave_balance: {
    // §3.1 TAADclzVcatnList1 실측 7필드 중 leavCd(코드) 제외
    workNm: "휴가종류",
    creDd: "발생일수",
    useDd: "사용일수",
    remDd: "잔여일수",
    staYmd: "시작일",
    endYmd: "종료일",
  },
  leave_requests: {
    // §3.2 TAADclzVcatnList2 실측 7필드 중 dayTypeCd·addNum 제외
    ymd: "사용일",
    week: "요일",
    leavNm: "휴가종류",
    useDd: "사용일수",
    reason: "사유",
  },
  timesheet: {
    // §2.1 TAA-1410 42필드 중 출퇴근 중심 발췌 (사번·PK·OT 세부 제외)
    workYmd: "일자",
    week: "요일",
    staTime: "출근",
    endTime: "퇴근",
    baseStaTime: "기준출근",
    baseEndTime: "기준퇴근",
    mark: "상태",
    workComment: "특이사항",
    lateYn: "지각",
    earlyYn: "조퇴",
    absentYn: "결근",
  },
  work_status: {
    workYmd: "일자",
    week: "요일",
    workComment: "근무내용",
    mark: "상태",
    baseStaTime: "기준출근",
    baseEndTime: "기준퇴근",
    inTime: "출근",
    outTime: "퇴근",
    lateTime: "지각(분)",
    earlyTime: "조퇴(분)",
    goOutTime: "외출(분)",
    otTime: "연장(분)",
    annualLeave: "연차",
    etcLeave: "기타휴가",
    bizTrip: "출장",
    education: "교육",
    leaveAbsence: "휴직",
  },
  // 이하 4종 근거: docs/03-analysis/hr-column-whitelist-audit.analysis.md
  // (TAADclzWorkOtSchdul_SQL·TAADclzWorkSearchCldr_SQL·TAADclzVcatnCldrMgr_SQL 대조)
  overtime: {
    // getTAADclzWorkOtSchdulList2 — staffId/workStaffId/orgCd/empOrder/staffNo 차단
    staffNm: "성명",
    orgNm: "소속",
    posNm: "직위",
    otWeek01: "1주",
    otWeek02: "2주",
    otWeek03: "3주",
    otWeek04: "4주",
    otWeek05: "5주",
    otWeek06: "6주",
    otWeekSum: "합계",
  },
  work_calendar: {
    // getTAADclzWorkSearchCldr — kind/wktypeCd/reqNo 차단
    ymd: "일자",
    workTypeNm: "근무유형",
    holidayNm: "공휴일",
    mark: "상태",
  },
  vacation_calendar: {
    // getTAADclzVcatnCldrMgr — leavCd/reqStatusCd/endYmdAdd/allDay/hideLeavCds/*Cd 차단
    title: "내용",
    leavNm: "휴가종류",
    personInfo: "직원정보",
    orgNm: "소속",
    posNm: "직위",
    resNm: "직책",
    wktypeNm: "근무유형",
    staYmd: "시작일",
    endYmd: "종료일",
    staHm: "시작시각",
    endHm: "종료시각",
    agentName: "대결자",
    reason: "사유",
    note: "비고",
  },
};

// overtime_limit(getTAADclzWorkOtSchdulList) — 일별 매트릭스 ot01~ot31 전개
COLUMNS_BY_QT.overtime_limit = (() => {
  const cols = { staffNm: "성명", orgNm: "소속", posNm: "직위" };
  for (let d = 1; d <= 31; d++) {
    cols[`ot${String(d).padStart(2, "0")}`] = `${d}일`;
  }
  cols.sumOt = "합계";
  return cols;
})();

module.exports.runtime = {
  handler: async function ({ query_type, year_month }) {
    try {
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const spec = ENDPOINT_MAP[query_type];
      const label = QUERY_LABELS[query_type];

      const form = {};
      if (spec.cmd) form.cmd = spec.cmd;

      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      if (spec.period === "ym") {
        form.searchYm = ym;
      } else if (
        spec.period === "range" ||
        spec.period === "range-alt" ||
        spec.period === "range-both"
      ) {
        const [sYmd, eYmd] = monthRange(ym);
        if (spec.period === "range" || spec.period === "range-both") {
          form.searchBaseSYmd = sYmd;
          form.searchBaseEYmd = eYmd;
        }
        if (spec.period === "range-alt" || spec.period === "range-both") {
          form.searchSYmd = sYmd;
          form.searchEYmd = eYmd;
        }
      }

      if (spec.rangeAltToo) {
        const [sYmd, eYmd] = monthRange(ym);
        form.searchSYmd = sYmd;
        form.searchEYmd = eYmd;
      }

      if (spec.baseYmdDashed) form.searchBaseYmd = todayDashed();

      // §3 휴가 공통 BODY (카탈로그 실측 본문 전량 — 임의 축약 금지)
      if (spec.leaveBody) {
        const y = ym.slice(0, 4);
        form.wkareaCd = String(this.runtimeArgs["HR_WKAREA_CD"] || "1000").trim();
        form.searchLeavCd = "";
        form.gubun = "A";
        form.activeTab = "0";
        form.searchSymdLv = `${y}0101`; // 휴가연도
        form.searchEymdLv = `${y}1231`;
        form.searchSymdFy = `${y}0101`; // 회계연도
        form.searchEymdFy = `${y}1231`;
        form.searchBaseYmd = todayDashed();
        form.chkAppYn = "Y";
      }

      // 대상 사번 self 강제 — LLM 파라미터 없음, 마커 치환은 브리지/폴백이 수행
      const staffParams = Array.isArray(spec.staffParam)
        ? spec.staffParam
        : spec.staffParam
          ? [spec.staffParam]
          : [];
      for (const p of staffParams) form[p] = SELF_STAFF_ID_MARKER;

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
      return formatAttendance(records, label, COLUMNS_BY_QT[query_type], query_type);
    } catch (e) {
      this.logger("Error in hr-attendance", e.message);
      return `> ⚠️ 근태 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatAttendance(data, label, columns, query_type) {
  const {
    normalizeData,
    renderTable,
    renderSummary,
    renderWhitelisted,
  } = require("../_shared/formatTable");

  let md = `## HR 근태 - ${label}\n\n`;

  // 화이트리스트 정의가 있으면 선별 렌더(내부 PK·사번·코드 제외).
  if (columns) {
    const table = renderWhitelisted(data, columns);
    if (!table) return md + "> 조회된 데이터가 없습니다.";
    // 근무현황 요약만 표 위에 집계 한 줄을 붙인다. 실패해도 표 렌더는 살려야 한다
    // (집계는 부가 정보, 표가 본체 — specs/014).
    const summaryLine =
      query_type === "work_status" ? safeSummarizeWorkStatus(data) : "";
    return md + summaryLine + table;
  }

  // 정의 없는 query_type은 통짜 렌더(하위호환) — 단 공통 내부 식별자만 제외.
  const { rows, summary } = normalizeData(data);
  if (rows.length === 0) {
    return md + "> 조회된 데이터가 없습니다.";
  }
  md += renderTable(rows, {
    excludeKeys: ["code", "message", "servareaId", "staffId", "staffNo"],
  });
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}

// row[col] ?? row[col.toLowerCase()] ?? row[camel(col)] — renderWhitelisted와 동일 규칙.
// 집계기가 다른 키 조회 규칙을 쓰면 "표엔 결근이 찍히는데 집계는 결근 0일"처럼
// 모순된 두 정보를 LLM에 동시에 주게 된다(specs/014 §5, "조용한 0").
function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function field(row, col) {
  return row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
}

// 플래그: 존재 여부. kiwibox는 해당 없을 때 NULL/공백을 주지 "N"을 주지 않는다 —
// "N"이 들어오면 계상되는 것이 화면(taaWrkTimeStatusMgr.jsp) 판정과 같은 동작이다.
function has(v) {
  return v != null && String(v).replace(/\s/g, "") !== "";
}
// 승인OT: 숫자 > 0. "1.5시간"처럼 단위가 붙어 와도 숫자만 추출해 판정한다.
function otHas(v) {
  return parseFloat(String(v).replace(/[^0-9.-]/g, "")) > 0;
}

const OT_FIELDS = ["otWorkOver", "otWorkNight", "otHoliWork", "otHoliOver", "otHoliNight"];

/**
 * 근무현황 표 위에 붙일 집계 한 줄. 실패하면 빈 문자열 — 집계 실패가 표 렌더를
 * 죽이면 안 된다(specs/014 §5). 화이트리스트 적용 **전** raw 레코드를 받아야
 * absentYn·승인OT 5종처럼 표에는 안 나오는 필드까지 판정할 수 있다.
 */
function safeSummarizeWorkStatus(data) {
  try {
    return summarizeWorkStatus(data);
  } catch (_) {
    return "";
  }
}

function summarizeWorkStatus(data) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) return "";

  let normal = 0, late = 0, early = 0, absent = 0, missing = 0;
  let leave = 0, bizTrip = 0, education = 0, otDays = 0, otHours = 0;

  for (const row of rows) {
    const isLate = has(field(row, "lateYn"));
    const isEarly = has(field(row, "earlyYn")) || has(field(row, "earlyOtYn"));
    const isAbsent = has(field(row, "absentYn"));
    const isMissing = has(field(row, "inTime")) !== has(field(row, "outTime")); // XOR
    const otAmounts = OT_FIELDS.map((k) => field(row, k));
    const isOt = otAmounts.some(otHas);

    if (isLate) late++;
    if (isEarly) early++;
    if (isAbsent) absent++;
    if (isMissing) missing++;
    if (has(field(row, "annualLeave")) || has(field(row, "etcLeave"))) leave++;
    if (has(field(row, "bizTrip"))) bizTrip++;
    if (has(field(row, "education"))) education++;
    if (isOt) {
      otDays++;
      otHours += otAmounts
        .map((v) => parseFloat(String(v).replace(/[^0-9.-]/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((a, b) => a + b, 0);
    }
    // mark === "NORMAL"만 정상 판단 기준 — 화면과 동일하게 이 문자열로만 비교.
    if ((field(row, "mark") === "NORMAL" || isOt) && !isLate && !isEarly && !isAbsent && !isMissing) {
      normal++;
    }
  }

  const parts = [`집계(${rows.length}일)`];
  if (normal) parts.push(`정상 ${normal}일`);
  if (late) parts.push(`지각 ${late}회`);
  if (early) parts.push(`조퇴 ${early}회`);
  if (absent) parts.push(`결근 ${absent}일`);
  if (missing) parts.push(`출퇴근누락 ${missing}일`);
  if (leave) parts.push(`휴가 ${leave}일`);
  if (bizTrip) parts.push(`출장 ${bizTrip}일`);
  if (education) parts.push(`교육 ${education}일`);
  // OT 5종 합산은 TAAF_OT_TIME이 배수(1.5/0.5/2.0)로 계산한 값이라 단순 시간이 아니다
  // — "총 연장시간"이라 단정하지 않고 "승인 N.Nh"로만 적는다. 종류별 상세는 표에 있다.
  if (otDays) parts.push(`연장근로 ${otDays}일(승인 ${otHours.toFixed(1)}h)`);

  return `> ${parts.join(" · ")}\n\n`;
}
