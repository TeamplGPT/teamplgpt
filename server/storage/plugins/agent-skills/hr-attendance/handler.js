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
const { resolveYearPeriod } = require("../_shared/periodResolver");
const { OTHER_EMPLOYEE_REFUSAL, isBlockedQueryType } = require("../_shared/otherEmployee");
const { prepareAttendanceTable, DAY_TABLE_LINE, ISSUE_SUMMARY_LINE } = require("../_shared/attendanceDisplay");
const {
  runMonthly,
  monthlyPeriod,
  withPeriodHeader,
  appendBeforeAnswerGuide,
  renderMonthlySum,
} = require("../_shared/yearQuery");
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
  // vacation_calendar(조직 휴가캘린더) — 팀원 휴가·사유가 다른 직원 정보라 제공 중단(specs/016)
};

const QUERY_LABELS = {
  timesheet: "출퇴근 기록",
  work_status: "근무현황 요약",
  work_calendar: "월 근무캘린더",
  overtime: "연장근무(OT) 신청 내역",
  overtime_limit: "연장근무(OT) 한도/잔여",
  leave_requests: "본인 휴가신청 상세",
  annual_leave_balance: "연차 발생/사용/잔여",
};

// 연도 단위 질의("올해"/"2026년"/"작년" …) 처리 방식 (specs/015 data-model §2·§3).
//  kind: record=실적(올해면 오늘까지) / schedule=일정(12/31까지)
//  mode: range=기간만 1년으로 1회 호출 / monthly=searchYm 한 달만 받는 endpoint라 달마다 순차 호출
//        / yearOnly=이미 연 단위 BODY(leaveBody)라 연도만 교정
// 여기 없는 query_type(annual_leave_balance)은 연도 표현이 와도 기존 경로를 탄다(머리 줄 없음).
// 단 휴가 BODY의 연도는 아래 leaveBody 블록에서 periodResolver로 교정한다.
const YEAR_MODE = {
  timesheet: { kind: "record", mode: "range" },
  work_status: { kind: "record", mode: "range" },
  // List2의 otWeekSum은 "그 달이 걸친 첫 주 ~ +5주" 6개 주차 합이라(TAADclzWorkOtSchdul_SQL
  // OT_WEEK_SUM) 월 경계 주차가 두 달에 중복 계상된다 — 달마다 더하면 연간 합계가 부풀려진다.
  // 연도 질의는 같은 일별 OT(TAAF_OT_TIME, 동일 플래그)를 그 달 1~말일로만 더하는 List의 sumOt를 쓴다.
  overtime: {
    kind: "record", mode: "monthly", sumField: "sumOt",
    yearCmd: "getTAADclzWorkOtSchdulList",
  },
  overtime_limit: { kind: "record", mode: "monthly", sumField: "sumOt" },
  // 휴가·회계연도 칸(searchSymdLv 등)은 항상 그해 1/1~12/31로 보낸다 — 머리 줄도 그해 전체(schedule).
  // 연도 교정은 기존 leaveBody 블록에서 하고, 여기서는 머리 줄만 붙인다.
  leave_requests: { kind: "schedule", mode: "yearOnly" },
  // searchYm도 필수인 endpoint — 1년 범위 1회 조회가 실서버에서 12개월치를 주는지 확인 전(spec D7).
  // 안 되면 mode를 "monthly"로 바꾼다(sumField 없으면 달별 행을 이어 붙여 렌더).
  work_calendar: { kind: "schedule", mode: "range" },
};
// 단위 테스트 전용 — work_calendar monthly 전환 경로 검증용(로더는 runtime만 읽는다)
module.exports.YEAR_MODE = YEAR_MODE;
// 하루=1행 응답이라 1년이면 수백 행 — 특이사항 있는 날만 표로 넘긴다(contracts §2)
const DAY_ROW_QUERY_TYPES = new Set(["timesheet", "work_status"]);

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
  // 이하 근거: docs/03-analysis/hr-column-whitelist-audit.analysis.md
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
      // 다른 직원 정보 조회는 HR 호출 없이 거절(specs/016) — 잘못된 값 안내보다 먼저
      if (isBlockedQueryType("hr-attendance", query_type)) return OTHER_EMPLOYEE_REFUSAL;
      // 자기 키만 인정 — "constructor"·"__proto__" 같은 프로토타입 키 우회 차단(코드 리뷰 H1)
      if (typeof query_type !== "string" || !Object.hasOwn(ENDPOINT_MAP, query_type)) {
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
        // 연도 표현("재작년"·"전년도" 등 dateResolver가 못 읽는 것)은 periodResolver로 연도만
        // 교정한다(specs/015). 연도 표현이 아니면 기존 그대로 ym 앞 4자리.
        const y =
          resolveYearPeriod(year_month, { kind: "schedule" })?.year ?? ym.slice(0, 4);
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

      // 연도 단위 질의(specs/015) — 연도 표현이 아니면 null이라 아래 기존 경로를 그대로 탄다.
      const yearMode = YEAR_MODE[query_type];
      const yearPeriod = yearMode
        ? resolveYearPeriod(year_month, { kind: yearMode.kind })
        : null;
      if (yearPeriod) {
        return await runYearQuery(this, { query_type, spec, label, form, yearPeriod });
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

// ─── 연도 단위 질의 (specs/015) ───────────────────────────────────────────────

/**
 * 기존 경로가 만든 월 단위 form을 받아 연도 기간으로 조회·렌더한다.
 * form은 변경하지 않는다(기간 칸만 바꾼 사본으로 호출).
 */
async function runYearQuery(ctx, { query_type, spec, label, form, yearPeriod }) {
  const { mode, sumField, yearCmd } = YEAR_MODE[query_type];
  if (mode === "monthly") {
    const monthForm = yearCmd ? { ...form, cmd: yearCmd } : form;
    return runYearMonthly(ctx, {
      query_type, spec, label, form: monthForm, yearPeriod: monthlyPeriod(yearPeriod), sumField,
    });
  }

  ctx.introspect(`${label} ${yearPeriod.year}년 조회 중...`);
  // yearOnly(leave_requests)는 기존 경로가 이미 대상 연도로 휴가·회계연도 BODY를 만들었다
  const yearForm = mode === "yearOnly" ? form : withYearRange(form, spec, yearPeriod);
  const { errorMessage, records, isEmpty } = await hrFetch(ctx, {
    path: spec.path,
    form: yearForm,
    gate: spec.gate,
  });
  if (errorMessage) return errorMessage;
  if (isEmpty) {
    return withPeriodHeader(`> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`, yearPeriod);
  }

  ctx.introspect(`${label} 조회 완료.`);
  return withPeriodHeader(formatYearRecords(records, label, query_type), yearPeriod);
}

// 연도 질의 결과 렌더 — 하루=1행 응답은 축약하고, 나머지는 기존 렌더러 그대로
function formatYearRecords(records, label, query_type) {
  const columns = COLUMNS_BY_QT[query_type];
  if (DAY_ROW_QUERY_TYPES.has(query_type)) {
    return formatNotableDays(records, label, columns, query_type);
  }
  if (query_type === "work_calendar") return formatCalendarExceptions(records, label, columns);
  return formatAttendance(records, label, columns, query_type);
}

// 기간 파라미터 칸만 1년 범위로 바꾼 사본 — 어떤 칸을 쓰는지는 기존 period 규칙 그대로.
// searchYm도 받는 endpoint(work_calendar)는 시작 월(1월)을 넣는다.
function withYearRange(form, spec, { start, end }) {
  const next = { ...form };
  if (spec.period === "ym") next.searchYm = start.slice(0, 6);
  if (spec.period === "range" || spec.period === "range-both") {
    next.searchBaseSYmd = start;
    next.searchBaseEYmd = end;
  }
  if (spec.period === "range-alt" || spec.period === "range-both" || spec.rangeAltToo) {
    next.searchSYmd = start;
    next.searchEYmd = end;
  }
  return next;
}

// 한 달 조회 form — 기존 월 단위 form에서 그 달 기간 칸만 바꾼 사본
function withMonth(form, spec, ym) {
  const next = { ...form, searchYm: ym };
  if (spec.rangeAltToo) {
    const [sYmd, eYmd] = monthRange(ym);
    next.searchSYmd = sYmd;
    next.searchEYmd = eYmd;
  }
  return next;
}

// 합계 행은 본인 1행이어야 한다. 여러 행이면(self 마커 미치환 등으로 타인 행 혼입 가능)
// 더하지 않고 그 달을 실패로 돌린다 — 타인 수치가 "내 합계" 한 숫자로 숨는 것을 막는다.
async function fetchSelfMonth(ctx, spec, form, sumField) {
  const res = await hrFetch(ctx, { path: spec.path, form, gate: spec.gate });
  const rows = Array.isArray(res.records) ? res.records : res.records ? [res.records] : [];
  if (sumField && rows.length > 1) {
    return { errorMessage: "> ⚠️ 응답 행이 여러 개라 합산하지 않았습니다." };
  }
  return res;
}

// searchYm 한 달만 받는 endpoint — 1월부터 달마다 순차 호출
async function runYearMonthly(ctx, { query_type, spec, label, form, yearPeriod, sumField }) {
  ctx.introspect(`${label} ${yearPeriod.year}년 월별 조회 중...`);
  const merged = await runMonthly(yearPeriod.months, (ym) =>
    fetchSelfMonth(ctx, spec, withMonth(form, spec, ym), sumField)
  );
  if (merged.errorMessage) return merged.errorMessage;
  if (merged.perMonth.length === 0) {
    return withPeriodHeader(
      `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`,
      yearPeriod,
      merged.failedMonths
    );
  }

  ctx.introspect(`${label} 조회 완료.`);
  if (!sumField) {
    // 합계 칸이 없는 조회는 달별 행을 이어 붙여 range 모드와 같은 렌더러로 그린다
    const rows = merged.perMonth.flatMap(({ records }) =>
      Array.isArray(records) ? records : records ? [records] : []
    );
    return withPeriodHeader(
      formatYearRecords(rows, label, query_type),
      yearPeriod,
      merged.failedMonths
    );
  }
  // 실서버 확인(T039): 연장근무가 없는 달은 sumOt 키는 오고 값만 null이다(SQL SUM(OT)=NULL).
  // 모든 달이 그 형태면 "기록 없음"이 사실이다. 키 자체가 없으면 형식 미확인으로 보고 단정하지 않는다.
  const sumKeyPresent = merged.perMonth.every(({ records }) => {
    const row = Array.isArray(records) ? records[0] : records;
    return row != null && sumField in row;
  });
  const table = renderMonthlySum(
    merged,
    (records) => monthTotal(records, sumField),
    "연장근무 합계",
    sumKeyPresent ? "> 조회 기간 동안 연장근무 기록이 없습니다." : undefined
  );
  return withPeriodHeader(`## HR 근태 - ${label}\n\n${table}`, yearPeriod, merged.failedMonths);
}

// 한 달 응답(본인 1행 — fetchSelfMonth가 보장)의 합계 칸. 값이 없으면 null(표에 —)
function monthTotal(records, sumField) {
  const row = Array.isArray(records) ? records[0] : records;
  const value = row ? field(row, sumField) : null;
  return has(value) ? String(value).trim() : null;
}

/**
 * 근무캘린더 1년치(365행)에서 공휴일·평소와 다른 근무유형·상태가 있는 날만 표로 넘긴다
 * (코드 리뷰 M-5 — 하루 단위 축약을 근무캘린더에도 적용). 평소 근무유형 = 가장 많은 유형.
 */
function formatCalendarExceptions(data, label, columns) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const typeOf = (r) => String(field(r, "workTypeNm") ?? "");
  // 평일·주말을 따로 본다 — 실서버 1년치에서 주말 "휴일" 104일이 전부 특이 날로 잡혀 축약이 안 됐다
  const usualWeekday = mostFrequent(rows.filter((r) => !isWeekendRow(r)).map(typeOf));
  const usualWeekend = mostFrequent(rows.filter(isWeekendRow).map(typeOf));
  const isException = (r) =>
    has(field(r, "holidayNm")) ||
    typeOf(r) !== (isWeekendRow(r) ? usualWeekend : usualWeekday) ||
    (has(field(r, "mark")) && field(r, "mark") !== "NORMAL");
  const exceptions = rows.filter(isException);
  const rest = rows.length - exceptions.length;
  const usualText =
    [usualWeekday && `평일 ${usualWeekday}`, usualWeekend && `주말 ${usualWeekend}`]
      .filter(Boolean)
      .join(" / ") || "평소 근무";
  const restLine = `> 그 외 ${rest}일은 ${usualText}`;
  if (exceptions.length === 0) return `## HR 근태 - ${label}\n\n${restLine}`;
  const body = formatAttendance(exceptions, label, columns, "work_calendar");
  return rest > 0 ? appendBeforeAnswerGuide(body, restLine) : body;
}

// ymd는 "2026-01-01"(실서버) 또는 "20260101" — 숫자만 뽑아 판정, 형식이 다르면 평일로 본다
function isWeekendRow(row) {
  const d = String(field(row, "ymd") ?? "").replace(/\D/g, "");
  if (d.length !== 8) return false;
  const day = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay();
  return day === 0 || day === 6;
}

function mostFrequent(values) {
  const counts = values.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? "";
}

/**
 * 하루=1행 응답(1년이면 수백 행)에서 특이사항 있는 날만 표로 넘긴다(contracts §2).
 * 근무현황 집계 줄은 원본 전체 행으로 계산한다 — 표가 줄어도 집계는 1년 전체다.
 */
function formatNotableDays(data, label, columns, query_type) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const notable = rows.filter(isNotableDay);
  const summaryLine = query_type === "work_status" ? safeSummarizeWorkStatus(rows) : "";
  const head = `## HR 근태 - ${label}\n\n${summaryLine}`;
  if (notable.length === 0) {
    return `${head}> 조회 기간 동안 특이사항이 있는 날이 없습니다.`;
  }

  const { renderWhitelisted } = require("../_shared/formatTable");
  const { normalizeDisplayRows } = require("../_shared/renderNormalize");
  const displayData = normalizeDisplayRows(notable, { weekKey: "week", markKey: "mark" });
  const shown = prepareAttendanceTable(displayData, columns);
  const table = renderWhitelisted(shown.rows, shown.columns);
  if (!table) return `${head}> 조회된 데이터가 없습니다.`;
  const rest = rows.length - notable.length;
  const body = withIssueSummary(table, notable);
  return rest > 0
    ? head + shown.basisLine + appendBeforeAnswerGuide(body, `> 그 외 ${rest}일은 특이사항 없음`)
    : head + shown.basisLine + body;
}

// 날짜별 기록 표의 답변 형식(사용자 결정 2026-10-16): 여러 날이면 표 그대로, 지각·조퇴·결근·
// 출퇴근 누락이 있으면 표 아래 요약
function withIssueSummary(table, rawRows) {
  const asTable = rawRows.length >= 2 ? appendBeforeAnswerGuide(table, DAY_TABLE_LINE) : table;
  const hasIssue = rawRows.some((row) => {
    const f = dayFlags(row);
    return f.isLate || f.isEarly || f.isAbsent || f.isMissing;
  });
  return hasIssue ? appendBeforeAnswerGuide(asTable, ISSUE_SUMMARY_LINE) : asTable;
}

function formatAttendance(data, label, columns, query_type) {
  const {
    normalizeData,
    renderTable,
    renderSummary,
    renderWhitelisted,
  } = require("../_shared/formatTable");
  const { normalizeDisplayRows } = require("../_shared/renderNormalize");

  let md = `## HR 근태 - ${label}\n\n`;

  // 화이트리스트 정의가 있으면 선별 렌더(내부 PK·사번·코드 제외).
  if (columns) {
    // 표시용 사본만 정규화(week 영문 3자→한글, mark NORMAL/ABNORMAL→정상/비정상).
    // summarizeWorkStatus는 원본 mark 문자열("NORMAL")로 비교하므로 반드시 원본
    // data를 그대로 넘긴다 — 정규화된 사본을 넘기면 집계가 항상 0으로 깨진다.
    const displayData = normalizeDisplayRows(data, {
      weekKey: "week",
      markKey: "mark",
    });
    // 출퇴근 기록·근무현황은 시각 HH:MM + 기준시간 분리(_shared/attendanceDisplay)
    const isDayRows = DAY_ROW_QUERY_TYPES.has(query_type);
    const shown = isDayRows
      ? prepareAttendanceTable(displayData, columns)
      : { rows: displayData, columns, basisLine: "" };
    const rendered = renderWhitelisted(shown.rows, shown.columns);
    if (!rendered) return md + "> 조회된 데이터가 없습니다.";
    const rawRows = Array.isArray(data) ? data : data ? [data] : [];
    const table = isDayRows ? withIssueSummary(rendered, rawRows) : rendered;
    // 근무현황 요약만 표 위에 집계 한 줄을 붙인다. 실패해도 표 렌더는 살려야 한다
    // (집계는 부가 정보, 표가 본체 — specs/014).
    const summaryLine =
      query_type === "work_status" ? safeSummarizeWorkStatus(data) : "";
    return md + summaryLine + shown.basisLine + table;
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

// 하루 행의 근태 판정 — 집계(summarizeWorkStatus)와 연도 질의 특이사항 필터가 같은 규칙을 쓴다.
function dayFlags(row) {
  const otAmounts = OT_FIELDS.map((k) => field(row, k));
  return {
    isLate: has(field(row, "lateYn")),
    isEarly: has(field(row, "earlyYn")) || has(field(row, "earlyOtYn")),
    isAbsent: has(field(row, "absentYn")),
    isMissing: has(field(row, "inTime")) !== has(field(row, "outTime")), // XOR
    isLeave: has(field(row, "annualLeave")) || has(field(row, "etcLeave")),
    isBizTrip: has(field(row, "bizTrip")),
    isEducation: has(field(row, "education")),
    otAmounts,
    isOt: otAmounts.some(otHas),
  };
}

// 특이사항 = 지각·조퇴·결근·출퇴근 누락·휴가·출장·교육·연장근무 중 하나 이상 (contracts §2)
function isNotableDay(row) {
  const f = dayFlags(row);
  return (
    f.isLate || f.isEarly || f.isAbsent || f.isMissing ||
    f.isLeave || f.isBizTrip || f.isEducation || f.isOt
  );
}

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
    const { isLate, isEarly, isAbsent, isMissing, isLeave, isBizTrip, isEducation, otAmounts, isOt } =
      dayFlags(row);

    if (isLate) late++;
    if (isEarly) early++;
    if (isAbsent) absent++;
    if (isMissing) missing++;
    if (isLeave) leave++;
    if (isBizTrip) bizTrip++;
    if (isEducation) education++;
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
