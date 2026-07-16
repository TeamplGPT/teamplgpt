// hr-approval/handler.js
// 5240 HR(kiwibox) 전자결재 결재함 목록 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/005·003).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md §4.4 + kiwibox 소스 실측.
//  - 목록 = 순수 self(a): EAPRequestMgr getEAPRequestMgrList, work_staff_id=ssnStaffId 세션 강제.
//    → 대상 사번 파라미터 없음, LLM이 타인 지정 불가.
//  - detail(본문 CONTENTS CLOB, reqNo 무검증)은 §7 최고 위험 — 미채택(specs/005 승인 결정).
const { resolveDateParam } = require("../_shared/dateResolver");
const { hrFetch, monthRange } = require("../_shared/hrSession");

// selectGubun: 2=기안함 / 3=미결함 / 4=기결함 / 5=참조 / 6=반려함 (EAPRequestMgr_SQL.xml:185)
const ENDPOINT = {
  path: "/EAPRequestMgr.do",
  cmd: "getEAPRequestMgrList",
  gate: true, // activeMenuCd 게이트 인자
};

const QUERY_TYPES = {
  pending: { gubun: "3", label: "미결함(내가 결재할 문서)" },
  drafted: { gubun: "2", label: "기안함(내가 상신한 문서)" },
  completed: { gubun: "4", label: "기결함(결재 완료 문서)" },
  rejected: { gubun: "6", label: "반려함(반려된 문서)" },
  referenced: { gubun: "5", label: "참조 문서" },
};

// 목록 반환 컬럼 화이트리스트 (specs/005 실측 — 내부 PK·코드 제외).
// 키: kiwibox 컬럼(대문자/소문자 모두 대응), 값: 한글 라벨.
const COLUMN_LABELS = {
  APPL_NM: "문서명",
  TITLE: "제목",
  REQ_STATUS_NM: "상태",
  LAPSED_DD: "경과일",
  APPL_STAFF_NM: "기안자",
  APPL_ORG_NM: "소속",
  APPL_YMD: "신청일",
  S_YMD: "시작일",
  E_YMD: "종료일",
  MEMO: "신청사유",
  SIGN_LINE: "결재라인",
  LAST_SIGN_YMD: "최종결재일",
  REQ_NO: "문서번호",
};

function pick(row) {
  const out = {};
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    // 대소문자 무관 조회 (egovMap이 소문자로 내릴 수 있음)
    const v =
      row[col] ??
      row[col.toLowerCase()] ??
      row[camel(col)];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      out[label] = v;
    }
  }
  return out;
}

function camel(snake) {
  return snake
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports.runtime = {
  handler: async function ({ query_type, year_month }) {
    try {
      if (!query_type || !QUERY_TYPES[query_type]) {
        const types = Object.keys(QUERY_TYPES).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }
      const qt = QUERY_TYPES[query_type];

      const ym =
        resolveDateParam(year_month, "year_month") ||
        resolveDateParam("이번달", "year_month");
      const [sYmd, eYmd] = monthRange(ym);

      const form = {
        cmd: ENDPOINT.cmd,
        selectGubun: qt.gubun,
        searchStaDate: sYmd,
        searchEndDate: eYmd,
      };

      this.introspect(`${qt.label} 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: ENDPOINT.path,
        form,
        gate: ENDPOINT.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return `> ⚠️ **${qt.label}**: 해당 기간에 문서가 없습니다.`;
      }

      this.introspect(`${qt.label} 조회 완료.`);
      return formatApproval(records, qt.label);
    } catch (e) {
      this.logger("Error in hr-approval", e.message);
      return `> ⚠️ 결재 문서 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatApproval(records, label) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = `## HR 전자결재 - ${label}\n\n`;
  if (list.length === 0) return md + "> 조회된 문서가 없습니다.";

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return md + "> 표시할 문서 정보가 없습니다.";

  // renderTable은 rows[0] 키를 헤더로 쓴다 → 문서별 컬럼 편차 대비 union 키로 정규화.
  // COLUMN_LABELS 정의 순서를 유지하며, 어느 문서에든 등장한 라벨만 헤더에 포함.
  const orderedLabels = Object.values(COLUMN_LABELS);
  const present = new Set();
  for (const r of picked) for (const k of Object.keys(r)) present.add(k);
  const headerKeys = orderedLabels.filter((l) => present.has(l));
  const normalized = picked.map((r) => {
    const row = {};
    for (const k of headerKeys) row[k] = r[k] ?? "";
    return row;
  });

  const { renderTable } = require("../_shared/formatTable");
  md += renderTable(normalized);
  md += `\n> 총 **${picked.length}건** 조회됨`;
  return md;
}
