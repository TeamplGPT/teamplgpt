// hr-personnel/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/002·003).
// 근거 카탈로그: kiwibox_eGov4.2/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md §4.8~4.9
//  - 사원증 계열 searchStaffId는 $SELF_STAFF_ID 마커 — 브리지/폴백이 본인 사번 치환 (self 강제).
//  - family(주민번호 반환 SCIRegDependent)는 카탈로그 §7 등록 금지 — 미노출.
const { resolveDateParam } = require("../_shared/dateResolver");
const {
  hrFetch,
  monthRange,
  todayYmd,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

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

module.exports.runtime = {
  handler: async function ({ query_type, year_month, org_cd }) {
    try {
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const spec = ENDPOINT_MAP[query_type];
      const label = QUERY_LABELS[query_type];

      const form = {};

      // 대상 사번 self 강제 — 마커 치환은 브리지/폴백이 수행 (§6.1)
      if (spec.staffParam) form[spec.staffParam] = SELF_STAFF_ID_MARKER;

      // 조직코드: 계층3 체이닝 — org_tree 결과값만 (plugin.json description에서 강제)
      if (spec.orgParam) {
        const org = String(org_cd || "").trim();
        if (spec.orgParam.required && !org) {
          return "> ⚠️ 조직코드(org_cd)가 필요합니다. 먼저 org_tree(조직도)로 조직코드를 조회하세요.";
        }
        if (org) form[spec.orgParam.name] = org;
      }

      if (spec.dateParam === "today") {
        form.searchSymd = todayYmd();
      } else if (spec.dateParam === "month-range") {
        const ym =
          resolveDateParam(year_month, "year_month") ||
          resolveDateParam("이번달", "year_month");
        const [sYmd, eYmd] = monthRange(ym);
        form.staYmd = sYmd;
        form.endYmd = eYmd;
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
      return formatPersonnel(records, label);
    } catch (e) {
      this.logger("Error in hr-personnel", e.message);
      return `> ⚠️ 인사기록 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatPersonnel(data, label) {
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 인사기록 - ${label}\n\n`;

  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}
