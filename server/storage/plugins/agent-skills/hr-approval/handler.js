// hr-approval/handler.js
// 5240 HR(kiwibox) 전자결재 결재함 목록 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/005·003).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md §4.4 + kiwibox 소스 실측.
//  - 목록 = 순수 self(a): EAPRequestMgr getEAPRequestMgrList, work_staff_id=ssnStaffId 세션 강제.
//    → 대상 사번 파라미터 없음, LLM이 타인 지정 불가.
//  - detail(본문 CONTENTS CLOB, reqNo 무검증)은 §7 최고 위험 — 미채택(specs/005 승인 결정).
const { resolveDateParam } = require("../_shared/dateResolver");
const { resolveYearPeriod } = require("../_shared/periodResolver");
const { withPeriodHeader } = require("../_shared/yearQuery");
const { OTHER_EMPLOYEE_REFUSAL, isBlockedQueryType } = require("../_shared/otherEmployee");
const { periodProblem } = require("../_shared/periodCheck");
const {
  hrFetch,
  monthRange,
  monthsAgoFirstYmd,
  todayYmd,
} = require("../_shared/hrSession");

// selectGubun: 2=기안함 / 3=미결함 / 4=기결함 / 5=참조 / 6=반려함 (EAPRequestMgr_SQL.xml:185)
const ENDPOINT = {
  path: "/EAPRequestMgr.do",
  cmd: "getEAPRequestMgrList",
  gate: true, // activeMenuCd 게이트 인자
};

// 본인 기안함만 제공(specs/016 D4). 미결(3)·기결(4)·참조(5)는 남이 올린 문서이고, 반려함(6)도
// "내가 결재자로서 반려한 남의 문서"다(EAPRequestMgr_SQL appl_kind=6: SIGN_STAFF_ID=사용자, SEQ<>0) —
// 기안자·신청사유가 다른 직원 정보라 제공하지 않는다. 내 문서의 반려 여부는 기안함 상태로 안내한다.
const QUERY_TYPES = {
  drafted: { gubun: "2", label: "기안함(내가 상신한 문서)" },
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
  // REQ_NO(신청서번호)는 내부값이라 표에 넣지 않는다(사용자 결정 2026-10-19, 018 보안 리뷰 H1)
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
      // 다른 직원 문서함은 HR 호출 없이 거절(specs/016) — 잘못된 값 안내보다 먼저
      if (isBlockedQueryType("hr-approval", query_type)) return OTHER_EMPLOYEE_REFUSAL;
      // 자기 키만 인정 — "constructor" 등 프로토타입 키면 selectGubun 없이 "전체 결재함"이
      // 조회돼 다른 직원 문서가 섞인다(코드 리뷰 H1)
      if (typeof query_type !== "string" || !Object.hasOwn(QUERY_TYPES, query_type)) {
        const types = Object.keys(QUERY_TYPES).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }
      // 기간을 말했는데 해석하지 못하면 다른 기간으로 바꿔 조회하지 않고 안내(2026-10-21, _shared/periodCheck)
      const periodMsg = periodProblem(year_month);
      if (periodMsg) return periodMsg;
      const qt = QUERY_TYPES[query_type];

      // 기간 파라미터 정본 = sdt/edt (EAPRequestMgr_SQL·eapRequestMgr.jsp 실측).
      // searchStaDate/searchSYmd 계열은 SQL이 읽지 않는다 — 미전송 시 서버 기본이
      // 기안/참조(gubun 2·5)는 '오늘 하루', 미결/기결/반려(3·4·6)는 전체기간(1900~2999)이라
      // "기안함 빈 결과 / 기결함 전체기간 과다 조회"가 된다. 월 미지정 시 최근 3개월.
      // 연도 단위 질의("올해"/"작년" …)면 그해 1/1~(올해는 오늘, 지난 연도는 12/31) — specs/015.
      // 아니면 null이라 아래 기존 규칙(월 또는 최근 3개월)을 그대로 쓴다.
      const yearPeriod = resolveYearPeriod(year_month, { kind: "record" });
      const ymResolved = resolveDateParam(year_month, "year_month");
      let sYmd, eYmd;
      if (yearPeriod) {
        sYmd = yearPeriod.start;
        eYmd = yearPeriod.end;
      } else if (ymResolved) {
        [sYmd, eYmd] = monthRange(ymResolved);
      } else {
        sYmd = monthsAgoFirstYmd(2);
        eYmd = todayYmd();
      }
      // 연도 질의만 결과에 "조회 기간" 줄을 붙인다(월 단위 결과는 기존과 바이트 동일)
      const withPeriod = (out) => (yearPeriod ? withPeriodHeader(out, yearPeriod) : out);

      const form = {
        cmd: ENDPOINT.cmd,
        selectGubun: qt.gubun,
        sdt: sYmd,
        edt: eYmd,
      };

      this.introspect(`${qt.label} 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: ENDPOINT.path,
        form,
        gate: ENDPOINT.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return withPeriod(`> ⚠️ **${qt.label}**: 해당 기간에 문서가 없습니다.`);
      }

      this.introspect(`${qt.label} 조회 완료.`);
      return withPeriod(formatApproval(records, qt.label));
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
