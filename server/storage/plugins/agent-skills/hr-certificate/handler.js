// hr-certificate/handler.js
// 5240 HR(kiwibox) 증명서 신청내역 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/006·003).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md §4.6 + kiwibox 소스 실측.
//  - 정본: CTIMcrtfReqstRefromMgr getCTIMcrtfReqstRefromMgrList (웹).
//  - self 강제: reqNoExist='N' + staffId=$SELF_STAFF_ID → 본인 신청내역만 (SQL:64).
//  - reqNo 단건 상세(§4.4식 무검증 위험)·주소(§4.6 민감)는 미채택(specs/006 승인).
const { hrFetch, SELF_STAFF_ID_MARKER } = require("../_shared/hrSession");

const ENDPOINT = {
  path: "/CTIMcrtfReqstRefromMgr.do",
  cmd: "getCTIMcrtfReqstRefromMgrList",
  gate: false, // self 강제(staffId)로 방어. 서버 게이트 유무는 specs/006 T5 확인
};

// 목록 반환 컬럼 화이트리스트 (specs/006 실측 — 주소·내부 PK·코드값 제외).
// 키: kiwibox 컬럼(대/소문자 대응), 값: 한글 라벨.
const COLUMN_LABELS = {
  TYPE_NM: "증명서종류",
  USE_NM: "용도",
  SUBMIT_PLACE: "제출처",
  COPY_NUM: "부수",
  ISSUE_NO: "발급번호",
  ISSUE_YMD: "발급일",
  REQ_DATE: "신청일시",
  PRT_YN: "출력가능",
  NAME: "성명",
  YEAR: "근속연수",
  MONTH: "근속개월",
  REQ_NO: "신청번호",
};

function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function pick(row) {
  const out = {};
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      out[label] = v;
    }
  }
  return out;
}

module.exports.runtime = {
  handler: async function ({ query_type }) {
    try {
      // query_type은 단일(requests) — 컨벤션 유지용. 값 무관하게 신청내역 조회.
      if (query_type && query_type !== "requests") {
        return "> ⚠️ query_type이 올바르지 않습니다. 가능한 값: requests";
      }

      const form = {
        cmd: ENDPOINT.cmd,
        reqNoExist: "N", // 목록 분기 (self staffId 필터 활성)
        staffId: SELF_STAFF_ID_MARKER, // self 강제
      };

      this.introspect("증명서 신청내역 조회 중...");
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: ENDPOINT.path,
        form,
        gate: ENDPOINT.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return "> ⚠️ **증명서 신청내역**이 없습니다.";
      }

      this.introspect("증명서 신청내역 조회 완료.");
      return formatCertificate(records);
    } catch (e) {
      this.logger("Error in hr-certificate", e.message);
      return `> ⚠️ 증명서 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatCertificate(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = "## HR 증명서 - 신청내역\n\n";
  if (list.length === 0) return md + "> 조회된 신청내역이 없습니다.";

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return md + "> 표시할 신청내역이 없습니다.";

  // 문서별 컬럼 편차 대비 union 키로 정규화 (renderTable은 rows[0] 키를 헤더로 씀).
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
  md += `\n> 총 **${normalized.length}건** 조회됨`;
  return md;
}
