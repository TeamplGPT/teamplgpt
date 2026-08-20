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
// 표시 보정은 _shared 공통 모듈 — handler별 사본 금지(specs/022 P0-2)
const { normalizeDisplayRows } = require("../_shared/renderNormalize");
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
// daySupported: work_ymd 지정 시 월 range 대신 단일일자 range 전송 (일 단위 조회 지원)
const ENDPOINT_MAP = {
  timesheet: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList", // TAA-1410 정본(§2.1)
    period: "range-both", staffParam: "cmmSearchStaffId", gate: true,
    daySupported: true,
    displayNormalize: { dateFrom: "ymd", dateTo: "workYmd", weekKey: "week" },
  },
  work_status: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList",
    period: "range-both", staffParam: "cmmSearchStaffId", gate: true,
    daySupported: true,
    displayNormalize: { dateFrom: "ymd", dateTo: "workYmd", weekKey: "week" },
  },
  work_calendar: {
    path: "/TAADclzWorkSearchCldr.do", cmd: "getTAADclzWorkSearchCldr",
    // "ym-range-alt" = searchYm + searchSYmd/searchEYmd 동시 전송.
    // 정본 SQL(TAADclzWorkSearchCldr_SQL.xml)의 WHERE는 searchYm이 아니라
    // searchSYmd/searchEYmd로 거른다(searchYm은 BASE_YM으로 SELECT만 되고 WHERE 미참조).
    // 둘을 빼면 A.YMD BETWEEN NULL AND NULL이 되어 항상 0행 → "답변 불가".
    // 실측(2026-08-19 ntest.5240.kr, self 202608): 미포함 0행 / 포함 31행.
    // 카탈로그 §2.2의 BODY 예시가 이 둘을 누락하고 있다 — kiwibox 정정 요청 대상.
    period: "ym-range-alt", staffParam: ["searchId", "cmmSearchStaffId"], gate: false,
    baseYmdDashed: true, // §2.2 — searchId 무게이트, self 강제 필수
  },
  // OT 2종: 정본 SQL(TAADclzWorkOtSchdul_SQL.xml)이 기간을 #{searchYm}으로만 거른다
  // (List2는 23회, List는 6회 참조. searchBaseSYmd/EYmd는 어느 쪽도 참조하지 않음).
  // 실측(2026-08-19 ntest): 현행 BODY 0행 / searchYm 추가 시 202605~202607 각 1행.
  overtime: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList2",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
    alsoSearchYm: true,
    fixed: { searchType: "2" }, // §2.6 실측
  },
  overtime_limit: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
    alsoSearchYm: true,
    fixed: { searchType: "2" },
  },
  leave_requests: {
    path: "/TAADclzVcatnList.do", cmd: "getTAADclzVcatnList2", // TAA-0490 정본(§3.2)
    period: "none", staffParam: ["staffId", "cmmSearchStaffId"], gate: false,
    leaveBody: true,
    // 실측(2026-08-19): ymd="20260323" 통짜, week="MON" 영문.
    // annual_leave_balance(List1)는 staYmd/endYmd 체계라 대상 아님.
    displayNormalize: { dateFrom: "ymd", dateTo: "ymd", weekKey: "week" },
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
    // 라벨 정본 = 화면 grid 헤더($KIWIBOX .../taaWrkTimeStatusMgr.jsp IBSheet):
    //   inTime=출근 · baseStaTime=시업 · outTime=퇴근 · baseEndTime=종업 ·
    //   mark=근무상태 · workComment=근무특이사항.
    // 구성 축도 같은 화면의 판정 로직을 따른다 — 출퇴근 특이자(지각/조퇴/결근) ·
    // 근무예외자(휴가/출장/교육) · 연장근로(평일연장/평일야간/휴일근무/휴일연장/휴일야간).
    // 플래그 계열은 값이 없으면 비어 오고 renderWhitelisted가 공백 열을 떨어뜨리므로,
    // 폭이 넓어도 정상근무일 표는 좁게 렌더된다.
    workYmd: "일자",
    week: "요일",
    baseStaTime: "시업",
    baseEndTime: "종업",
    inTime: "출근",
    outTime: "퇴근",
    mark: "근무상태",
    lateYn: "지각",
    earlyYn: "조퇴",
    earlyOtYn: "조퇴(연장)",
    absentYn: "결근",
    lateTime: "지각(분)",
    earlyTime: "조퇴(분)",
    goOut: "외출",
    goOutTime: "외출(분)",
    otTime: "연장(분)",
    otWorkOver: "평일연장(승인)",
    otWorkNight: "평일야간(승인)",
    otHoliWork: "휴일근무(승인)",
    otHoliOver: "휴일연장(승인)",
    otHoliNight: "휴일야간(승인)",
    annualLeave: "연차",
    etcLeave: "기타휴가",
    bizTrip: "출장",
    education: "교육",
    leaveAbsence: "휴직",
    workComment: "근무특이사항",
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

// 신원 컬럼 — 이 값들만 남은 결과는 "답할 내용 없음"으로 본다.
// OT 매트릭스는 이력이 없는 달이면 값이 전부 null로 와서 성명·소속·직위만 남는데,
// 그대로 렌더하면 "한도가 얼마냐"는 질문에 소속·직위가 답으로 나간다(2026-08-20 실측).
// 실질 컬럼이 하나라도 있으면 정상 렌더되므로 데이터가 있는 달에는 영향이 없다.
const IDENTITY_COLUMNS_BY_QT = {
  overtime: ["staffNm", "orgNm", "posNm"],
  overtime_limit: ["staffNm", "orgNm", "posNm"],
};

module.exports.runtime = {
  handler: async function ({ query_type, year_month, work_ymd }) {
    try {
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const spec = ENDPOINT_MAP[query_type];
      const label = QUERY_LABELS[query_type];

      const form = {};
      if (spec.cmd) form.cmd = spec.cmd;

      // 하루만 묻는 질문('오늘'·'어제'·'2월 27일')은 단일일자 range로 보낸다.
      // 월 range로 보내면 표 전체가 돌아와 LLM이 해당 행을 발췌해야 하고,
      // 프로덕션 규모에서는 그 발췌가 누락·오인된다. work_ymd 미지정 시에는
      // 아래 기존 월-range 경로를 그대로 타므로 월 단위 조회는 영향 없음.
      // ym은 아래 §3 휴가 공통 BODY(searchSymdLv 등)도 참조하므로 함수 스코프 유지.
      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      const resolvedDay = spec.daySupported
        ? resolveDateParam(work_ymd, "base_date")
        : undefined;

      if (resolvedDay) {
        form.searchBaseSYmd = resolvedDay;
        form.searchBaseEYmd = resolvedDay;
        form.searchSYmd = resolvedDay;
        form.searchEYmd = resolvedDay;
      } else if (spec.period === "ym") {
        form.searchYm = ym;
      } else if (spec.period === "ym-range-alt") {
        // searchYm은 화면 계약상 유지하되, 실제 행 필터는 searchSYmd/searchEYmd가 한다.
        const [sYmd, eYmd] = monthRange(ym);
        form.searchYm = ym;
        form.searchSYmd = sYmd;
        form.searchEYmd = eYmd;
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
        // OT 2종은 range 계열 BODY를 쓰면서도 실제 필터는 searchYm이다(alsoSearchYm).
        if (spec.alsoSearchYm) form.searchYm = ym;
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
      // 표시 보정은 endpoint별 계약이 달라 spec에 명시된 경우에만 적용한다
      // (같은 규칙을 일괄 적용하면 형식이 다른 endpoint에서 오히려 깨진다).
      const rows = spec.displayNormalize
        ? normalizeDisplayRows(records, spec.displayNormalize)
        : records;
      return formatAttendance(
        rows,
        label,
        COLUMNS_BY_QT[query_type],
        IDENTITY_COLUMNS_BY_QT[query_type]
      );
    } catch (e) {
      this.logger("Error in hr-attendance", e.message);
      return `> ⚠️ 근태 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

// 표시 보정 — ntest.5240.kr 실호출로 확인(TAA-1410 2026-08-18 / TAA-0490 2026-08-19).
// kiwibox는 날짜·요일을 화면 렌더용 형식으로 내려주는데, 그대로 표에 실으면 LLM이
// 연도를 모르거나 영문 요일을 그대로 노출한다.
//  · TAA-1410: workYmd가 연도 없는 MM-DD("07-01"). 연도를 가진 건 ymd("20260701")뿐인데
//    양쪽 화이트리스트 모두 ymd를 쓰지 않아, LLM이 표만으로는 연도를 알 수 없고
//    시스템 프롬프트의 [HR_DATE_CONTEXT] 날짜에 의존하게 된다.
//  · TAA-0490(휴가 사용내역): ymd가 "20260323" 통짜라 읽기 어렵다.
//  · 양쪽 모두 week가 영문 3자("MON")다 — '요일' 한글 열에 영문이 그대로 나온다.
// 응답 키는 egovMap camelCase 실측 확인. 원본은 변경하지 않고 새 객체를 만든다.
function formatAttendance(data, label, columns, identityColumns) {
  const {
    normalizeData,
    renderTable,
    renderSummary,
    renderWhitelisted,
  } = require("../_shared/formatTable");

  let md = `## HR 근태 - ${label}\n\n`;

  // 화이트리스트 정의가 있으면 선별 렌더(내부 PK·사번·코드 제외).
  if (columns) {
    const table = renderWhitelisted(data, columns, identityColumns);
    return table ? md + table : md + "> 조회된 데이터가 없습니다.";
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
