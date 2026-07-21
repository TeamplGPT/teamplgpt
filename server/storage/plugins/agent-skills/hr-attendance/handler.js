// hr-attendance/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/001·003).
// 근거 카탈로그: kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md
//  - 데스크탑 정본(b, AUTF_SRCH_STAFF_YN 게이트) 우선. 휴가만 모바일 self(a) 정본.
//  - 대상 식별자는 LLM 미노출: $SELF_STAFF_ID 마커 → 브리지(ssnStaffId) 또는
//    HR_STAFF_ID(서버 폴백)가 kiwibox 내부 STAFF_ID로 치환. self 강제(카탈로그 §6.1).
const { resolveDateParam } = require("../_shared/dateResolver");
const {
  hrFetch,
  monthRange,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// period: "range"=searchBaseSYmd/EYmd, "range-alt"=searchSYmd/EYmd, "ym"=searchYm, "none"
// staffParam: b 범위 cmmSearchStaffId / c 범위 searchId / a 범위 없음(세션 신원)
const ENDPOINT_MAP = {
  timesheet: {
    path: "/TAAWrkTimeListMgrByDate.do", cmd: "getTAAWrkTimeListMgrByDateList",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
  },
  work_status: {
    path: "/TAAWrkTimeStatusMgr.do", cmd: "getTAAWrkTimeStatusMgrList",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
  },
  work_calendar: {
    path: "/TAADclzWorkSearchCldr.do", cmd: "getTAADclzWorkSearchCldr",
    period: "ym", staffParam: "searchId", gate: false, // 범위 c — self 강제 필수 (§4.1)
  },
  overtime: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList2",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
    fixed: { searchType: "3" },
  },
  overtime_limit: {
    path: "/TAADclzWorkOtSchdul.do", cmd: "getTAADclzWorkOtSchdulList",
    period: "range", staffParam: "cmmSearchStaffId", gate: true,
    fixed: { searchType: "3" },
  },
  leave_requests: {
    path: "/getMBLLeavDetailStaff.do", // 범위 a — 순수 self (§4.3)
    period: "none", staffParam: null, gate: false,
  },
  annual_leave_balance: {
    path: "/getMBLHomeLeaveDetail.do", // 범위 a — searchType=1로 소속 경로 차단
    period: "none", staffParam: null, gate: false, fixed: { searchType: "1" },
  },
  vacation_calendar: {
    path: "/TAADclzVcatnCldrMgr.do", cmd: "getTAADclzVcatnCldrMgr",
    period: "range-alt", staffParam: null, gate: true, // 조직 캘린더(b) — 마스킹은 서버 처리
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
    wktypeNm: "근무유형",
    creDd: "발생일수",
    useDd: "사용일수",
    remDd: "잔여일수",
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
};

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
      } else if (spec.period === "range" || spec.period === "range-alt") {
        const [sYmd, eYmd] = monthRange(ym);
        if (spec.period === "range") {
          form.searchBaseSYmd = sYmd;
          form.searchBaseEYmd = eYmd;
        } else {
          form.searchSYmd = sYmd;
          form.searchEYmd = eYmd;
        }
      }

      // 대상 사번 self 강제 — LLM 파라미터 없음, 마커 치환은 브리지/폴백이 수행
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
      return formatAttendance(records, label, COLUMNS_BY_QT[query_type]);
    } catch (e) {
      this.logger("Error in hr-attendance", e.message);
      return `> ⚠️ 근태 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatAttendance(data, label, columns) {
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
