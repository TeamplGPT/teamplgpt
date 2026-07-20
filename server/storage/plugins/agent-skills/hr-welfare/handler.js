// hr-welfare/handler.js
// 5240 HR(kiwibox) 복리후생 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/009·003).
// 근거 카탈로그 §4.10 + kiwibox 소스 실측.
//  - 대출 신청내역(LONLoanReqstListMgr getLONLoanReqstListMgrList1)만 채택.
//    나머지 복리후생(의료비·학자금=파라미터 복잡, 경조=목록 부재, 휴양·사회보험=reqNo/주민번호)은
//    self 자동 도구화 부적합 — kiwibox 자체 AI도 복리후생 self 도구 미구현(실측 근거).
//  - self 강제 필수: cmmSearchStaffId 미지정 시 전사 대출내역 노출(§4.10 경고) → 마커 항상 주입.
//  - 계좌(BANK_CD/ACC_NO)·내부 PK 화이트리스트 제외.
const { hrFetch, SELF_STAFF_ID_MARKER } = require("../_shared/hrSession");

const ENDPOINT = {
  path: "/LONLoanReqstListMgr.do",
  cmd: "getLONLoanReqstListMgrList1",
  gate: false, // self(cmmSearchStaffId 강제)로 방어. 서버 게이트 없음(§4.10)
};

// 목록 화이트리스트 — 계좌·내부 PK 제외. 이율·잔액은 본인 대출 정보라 노출.
const COLUMN_LABELS = {
  LOA_TYPE_CD_NM: "대출종류",
  LON_AMT: "대출금액",
  LON_RATE: "이율",
  LONF_BAL_AMT: "잔액",
  LOA_REPAY_CD_NM: "상환방식",
  REQ_DATE: "신청일",
  APPL_FORM: "신청구분",
};

function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports.runtime = {
  handler: async function ({ query_type }) {
    try {
      // query_type 단일(loan). 값 무관하게 대출 조회(컨벤션 유지).
      if (query_type && query_type !== "loan") {
        return "> ⚠️ query_type이 올바르지 않습니다. 가능한 값: loan";
      }

      const form = {
        cmd: ENDPOINT.cmd,
        cmmSearchStaffId: SELF_STAFF_ID_MARKER, // self 강제(전사 노출 방지)
      };

      this.introspect("대출 신청내역 조회 중...");
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: ENDPOINT.path,
        form,
        gate: ENDPOINT.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return "> ⚠️ **대출 신청내역**이 없습니다.";
      }

      this.introspect("대출 신청내역 조회 완료.");
      return formatLoan(records);
    } catch (e) {
      this.logger("Error in hr-welfare", e.message);
      return `> ⚠️ 복리후생 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatLoan(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = "## HR 복리후생 - 대출 신청내역\n\n";
  if (list.length === 0) return md + "> 조회된 대출 내역이 없습니다.";

  const pick = (row) => {
    const out = {};
    for (const [col, lab] of Object.entries(COLUMN_LABELS)) {
      const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
      if (v !== undefined && v !== null && String(v).trim() !== "") out[lab] = v;
    }
    return out;
  };

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return md + "> 표시할 대출 내역이 없습니다.";

  const ordered = Object.values(COLUMN_LABELS);
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
