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
  todayDashed,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// dateParam: "today"=searchSymd 오늘, "month-range"=staYmd/endYmd(월초~말일)
const ENDPOINT_MAP = {
  profile: {
    path: "/getMBLPrtEmpCard.do", staffParam: "searchStaffId", gate: false,
    // 내부 식별자(SERVAREA_ID/CORP_ID/STAFF_ID/*_CD/LOGIN_ID) 비노출 — 화이트리스트 렌더.
    // 반환 컬럼 정본: kiwibox MBLPrtEmpCard_SQL.xml getMBLPrtEmpCard select 절.
    columns: {
      NAME: "성명",
      ENAME: "영문명",
      CNAME: "한자명",
      STAFF_NO: "사번",
      CORP_NM: "회사",
      ORG_NM: "소속",
      POS_NM: "직위",
      CLS_NM: "직급",
      RES_NM: "직책",
      STAFF_TYPE_NM: "사원유형",
      WKTYPE_NM: "근무유형",
      STATUS_NM: "재직상태",
      CORP_TEL: "회사전화",
      HAND_PHONE: "휴대전화",
      MAIL_ID: "이메일",
    },
  },
  profile_detail: {
    path: "/getMBLPrtEmpCardPop.do", staffParam: "searchStaffId", gate: true,
    // STAFF_ID/MENU_CD/SEQ 내부 식별자 제외 (MBLPrtEmpCard_SQL.xml getMBLPrtEmpCardPop)
    columns: {
      MENU_NM: "항목",
      CONTENTS: "내용",
    },
  },
  // 이하 columns 근거: docs/03-analysis/hr-column-whitelist-audit.analysis.md
  // (MBLHrBassiemList_SQL·Main_SQL 대조)
  org_tree: {
    path: "/getMBLHrBassiemOrgList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "cmmSearchOrgCd", required: false },
    // ORG_CD·PRIOR_ORG_CD는 org_members 체이닝·트리 계층에 필수 — 의도적 노출 유지.
    // level(_LEVEL)/seqNo/staYmd/endYmd 차단.
    columns: {
      ORG_NM: "조직명",
      ORG_FNM: "조직전체명",
      CHIEF_INFO: "조직장",
      STAFF_CNT: "인원수",
      ORG_CD: "조직코드",
      PRIOR_ORG_CD: "상위조직코드",
    },
  },
  org_members: {
    path: "/getMBLHrBassiemMemberList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "searchOrgCd", required: true },
    // detail/seqNo/empOrder/staffId/orgCd(3종)/posSeqNo/name(중복)/imgExYn 차단
    columns: {
      STAFF_NM: "성명",
      STAFF_NO: "사번",
      ORG_NM: "소속",
      POS_NM: "직위",
      RES_NM: "직책",
      CORP_NM: "회사",
      WORK_TYPE: "근무정보",
      WORK_INFO: "근무상황",
    },
  },
  todo_count: {
    path: "/getTodoIconCnt.do", staffParam: null, gate: false, // 범위 a — 세션 신원
    columns: {
      CNT1: "미확인 할일",
      CNT2: "미확인 쪽지",
      CNT3: "미결 결재",
    },
  },
  schedule_day: {
    path: "/getScheduleDay.do", staffParam: null, gate: false, // 범위 a
    dateParam: "month-range",
    columns: {
      MD: "날짜(월일)",
      HOLIDAY_YN: "공휴일여부",
      RESULT: "건수",
    },
  },
  contact_directory: {
    path: "/getContactList.do", staffParam: null, gate: false, // 공개 디렉터리
    // staffId/orgCd/staffNo/seq 차단. corpTel은 회사 대표번호(공개 성격) 노출.
    columns: {
      STAFF_NM: "성명",
      ORG_NM: "소속",
      POS_NM: "직위",
      RES_NM: "직책",
      POSITION_NM: "담당업무",
      CORP_TEL: "전화",
    },
  },
  education: {
    // 인사카드 교육이력 탭 (EDUT_HST2, kiwibox AI self SQL과 동일 테이블 — specs/007)
    // 신판 카탈로그 §4 공통 BODY: 사번 3중 지정 + searchYmd (specs/011 D9)
    path: "/PRCHrBassiemMgrTab220.do", cmd: "getPRCHrBassiemMgrTab220List",
    staffParam: ["staffId", "cmmSearchStaffId", "searchStaffId"],
    gate: false, fixed: { checkHst: "N" }, dateParam: "today-dashed",
    // 코드값(*_CD)·내부 식별자 다수 → 화이트리스트 렌더 (columns)
    columns: {
      EDU_NM: "교육명",
      STA_YMD: "시작일",
      END_YMD: "종료일",
      OFC_NM: "교육기관",
      CONTENTS_NM: "교육내용",
      EDU_TIME: "교육시간",
      EDU_POINT: "교육포인트",
      EDU_MEMO: "비고",
    },
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
  education: "교육이력",
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
      if (spec.cmd) form.cmd = spec.cmd;
      for (const [k, v] of Object.entries(spec.fixed || {})) form[k] = v;

      // 대상 사번 self 강제 — 마커 치환은 브리지/폴백이 수행. 배열이면 다중 주입 (§4 공통 BODY)
      const staffParams = Array.isArray(spec.staffParam)
        ? spec.staffParam
        : spec.staffParam
          ? [spec.staffParam]
          : [];
      for (const p of staffParams) form[p] = SELF_STAFF_ID_MARKER;

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
      } else if (spec.dateParam === "today-dashed") {
        form.searchYmd = todayDashed(); // §4 공통 BODY
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
      // 화이트리스트 컬럼 정의가 있으면 선별 렌더(코드값·내부 식별자 제외)
      if (spec.columns) return formatWhitelisted(records, label, spec.columns);
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

function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// 컬럼 화이트리스트 렌더 — hr-approval/hr-certificate와 동일 패턴(코드값 제외 + union 정규화)
function formatWhitelisted(records, label, columnLabels) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = `## HR 인사기록 - ${label}\n\n`;
  if (list.length === 0) return md + "> 조회된 데이터가 없습니다.";

  const pick = (row) => {
    const out = {};
    for (const [col, lab] of Object.entries(columnLabels)) {
      const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
      if (v !== undefined && v !== null && String(v).trim() !== "") out[lab] = v;
    }
    return out;
  };

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return md + "> 표시할 데이터가 없습니다.";

  const ordered = Object.values(columnLabels);
  const present = new Set();
  for (const r of picked) for (const k of Object.keys(r)) present.add(k);
  const headerKeys = ordered.filter((l) => present.has(l));
  const normalized = picked.map((r) => {
    const row = {};
    for (const k of headerKeys) row[k] = r[k] ?? "";
    return row;
  });

  const { renderTable } = require("../_shared/formatTable");
  md += renderTable(normalized);
  md += `\n> 총 **${normalized.length}건** 조회됨`;
  return md;
}
