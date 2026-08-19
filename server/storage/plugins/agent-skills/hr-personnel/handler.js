// hr-personnel/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/002·003).
// 근거 카탈로그: $KIWIBOX/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md §4.8~4.9
//   $KIWIBOX 경로를 모르면 사용자에게 묻거나 아래로 찾는다. 절대경로를 코드에 박지 말 것.
//   find ~ -maxdepth 7 -path "*spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md" 2>/dev/null
//   (절차 원본: HR-SKILL-GUIDE.md "0. 사전 준비")
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
    // 이 endpoint는 민감정보가 컬럼이 아니라 **행**에 담긴다. 컬럼 화이트리스트만으로는
    // 막을 수 없어(MENU_NM/CONTENTS 2컬럼에 17개 섹션이 실려 온다) 행 단위로 차단한다.
    // 실측(2026-08-19 ntest): '◎ 가족' 행에 배우자·부모의 성명과 나이가 담겨 있었고,
    // plugin.json은 "가족정보/부양가족은 제공하지 않습니다(개인정보 보호)"라고 선언 중이었다.
    // MENU_NM 값에 아래 키워드가 포함된 행은 tool 결과에서 원천 제거한다(가이드 §4 L2 원칙).
    blockRowsByLabel: {
      key: "MENU_NM",
      keywords: ["가족", "장애", "보훈"],
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
  // contact_directory(/getContactList.do) 제거 — 2026-08-19 실호출에서 HTTP 404.
  // 컨트롤러는 kiwibox 소스에 있으나(MainController) ntest 배포에는 매핑이 없다.
  // 카탈로그(cmmAiAssistantToolEndpoints.md)에도 미등재라 연동 근거 자체가 없었고,
  // 설령 200이 왔어도 응답 래퍼 키가 contactList여서 hrSession 언랩 대상이 아니었다.
  // 배포·카탈로그 등재가 확인되면 그때 §5.2 절차대로 다시 추가한다.
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
      // 민감 섹션은 렌더 이전에 제거 — LLM에 도달하지 않게 한다(L2 원천 차단).
      const safe = spec.blockRowsByLabel
        ? dropSensitiveRows(records, spec.blockRowsByLabel)
        : records;
      // 화이트리스트 컬럼 정의가 있으면 선별 렌더(코드값·내부 식별자 제외)
      if (spec.columns) return formatWhitelisted(safe, label, spec.columns);
      return formatPersonnel(safe, label);
    } catch (e) {
      this.logger("Error in hr-personnel", e.message);
      return `> ⚠️ 인사기록 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

/**
 * 라벨 컬럼 값에 차단 키워드가 포함된 행을 제거한다. 원본은 변경하지 않는다.
 * 응답 키 대소문자·camelCase 변형을 renderWhitelisted와 같은 규칙으로 대응한다
 * (egovMap이 MENU_NM을 menuNm으로 내려주는 경우가 있어 한쪽만 보면 필터가 새어 나간다).
 */
function dropSensitiveRows(records, { key, keywords }) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const pick = (row) => row[key] ?? row[key.toLowerCase()] ?? row[camel(key)];
  return list.filter((row) => {
    const label = String(pick(row) ?? "");
    return !keywords.some((w) => label.includes(w));
  });
}

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
