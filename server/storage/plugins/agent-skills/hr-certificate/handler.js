// hr-certificate/handler.js
// 5240 HR(kiwibox) 증명서 발급내역 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/006·003).
// 근거 카탈로그: cmmAiAssistantToolEndpoints.md §4.6 + kiwibox 소스 실측.
//  - 정본(2026-09-04 재정렬): /CTIMcrtfIssuMgr.do getCTIMcrtfIssuMgrList (발급내역 목록).
//  - self 강제: staffIdNm=$SELF_STAFF_ID + searchSymd/Eymd(최근 18개월). AUTF_SRCH_STAFF_YN 게이트는 SQL 내장.
//    staffIdNm은 LIKE prefix라 결과 행을 본인 STAFF_ID 정확 일치로 재필터 — 아래 [본인 정확 일치] 참조.
//  - 구 정본 getCTIMcrtfReqstRefromMgrList는 신청화면 초기조회용(단건 구조)이라 폐기 — 아래 [수정 근거] 참조.
//  - reqNo 단건 상세(§4.4식 무검증 위험)·주소(§4.6 민감)는 미채택(specs/006 승인).
const {
  hrFetch,
  todayYmd,
  monthsAgoFirstYmd,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// [수정 근거] 기존 getCTIMcrtfReqstRefromMgrList는 "신청 화면 초기조회"용 —
// 직원 기본 1행 + reqNo로 지정한 단건만 반환하며(B.REQ_NO(+)=#{reqNo} 외부조인),
// reqNo 없이 호출하면 신청내역이 전부 조인 탈락해 목록 조회가 구조적으로 불가하다
// (운영 증상 "4건 발급했는데 1건만 조회"의 원인). 목록 정본은 발급내역 화면의
// getCTIMcrtfIssuMgrList (기간 searchSymd/Eymd + staffIdNm 필터, AUTF 게이트).
// 주의: AUTF_SRCH_STAFF_YN(activeMenuCd) 게이트가 일반 사용자 self 조회를 허용하는지
// 스테이징 실측 필요. staffIdNm은 LIKE prefix 매칭이라 self 마커 치환값 전체 사번 사용.
const ENDPOINT = {
  path: "/CTIMcrtfIssuMgr.do",
  cmd: "getCTIMcrtfIssuMgrList",
  gate: true,
};

// 목록 반환 컬럼 화이트리스트 (specs/006 실측 — 주소·내부 PK·코드값 제외).
// 키: kiwibox 컬럼(대/소문자 대응), 값: 한글 라벨.
// getCTIMcrtfIssuMgrList 반환 컬럼 기준(실측 SQL 대조 — 주소 ADDR·내부 PK 제외).
// TYPE_CD/USE_CD는 코드값만 제공됨(명칭 컬럼 없음) — 명칭 매핑은 CommonCode 후속 개선.
const COLUMN_LABELS = {
  TYPE_CD: "증명서종류코드",
  USE_CD: "용도코드",
  SUBMIT_PLACE: "제출처",
  COPY_NUM: "부수",
  ISSUE_NO: "발급번호",
  ISSUE_YMD: "발급일",
  REQ_DATE2: "신청일시",
  PRT_YN: "출력가능",
  STAFF_NM: "성명",
  REQ_STATUS_CD: "상태코드",
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

// [본인 정확 일치] staffIdNm은 SQL에서 STAFF_ID LIKE '본인ID%'라서 본인 ID가 123이면
// 1234·12345 직원 행도 걸린다(조회 권한이 넓은 계정). SQL에는 정확 일치 파라미터가 없고,
// 클라이언트 위임 모드에선 마커가 브라우저에서 치환돼 handler가 실제 ID를 모른다.
// → 본인 1행만 반환하는 인사카드(SRCH_STAFF_ID = ssnStaffId 또는 searchStaffId=self)로
//   본인 STAFF_ID를 확보해 결과 행을 정확 일치로 거른다. 확보 실패 시 fail-closed.
const SELF_ID_ENDPOINT = { path: "/getMBLPrtEmpCard.do", gate: false };
const SELF_ID_UNRESOLVED =
  "> ⚠️ 본인 식별 정보를 확인하지 못해 증명서 신청내역을 표시하지 않습니다. 잠시 후 다시 시도하세요.";

function rowStaffId(row) {
  const v = row && (row.STAFF_ID ?? row.staff_id ?? row.staffId);
  return v === undefined || v === null ? "" : String(v).trim();
}

function resolveSelfStaffId({ errorMessage, records, isEmpty }) {
  if (errorMessage || isEmpty) return null;
  const rows = Array.isArray(records) ? records : [records];
  const ids = new Set(rows.map(rowStaffId).filter(Boolean));
  return ids.size === 1 ? [...ids][0] : null; // 0개·복수면 본인 특정 불가
}

function filterSelfRows(records, selfStaffId) {
  const rows = Array.isArray(records) ? records : records ? [records] : [];
  return rows.filter((row) => rowStaffId(row) === selfStaffId);
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
        // self 강제: staffIdNm(사번/성명 검색 필터)에 본인 사번 주입 + AUTF 게이트가 2차 방어
        staffIdNm: SELF_STAFF_ID_MARKER,
        searchSymd: monthsAgoFirstYmd(18), // SQL 파라미터명은 소문자 ymd(searchSymd/Eymd)
        searchEymd: todayYmd(),
      };

      this.introspect("증명서 신청내역 조회 중...");
      const [self, list] = await Promise.all([
        hrFetch(this, {
          path: SELF_ID_ENDPOINT.path,
          form: { searchStaffId: SELF_STAFF_ID_MARKER },
          gate: SELF_ID_ENDPOINT.gate,
        }),
        hrFetch(this, { path: ENDPOINT.path, form, gate: ENDPOINT.gate }),
      ]);
      if (list.errorMessage) return list.errorMessage;
      if (list.isEmpty) {
        return "> ⚠️ **증명서 신청내역**이 없습니다.";
      }

      const selfStaffId = resolveSelfStaffId(self);
      if (!selfStaffId) {
        return self.errorMessage || SELF_ID_UNRESOLVED;
      }

      this.introspect("증명서 신청내역 조회 완료.");
      return formatCertificate(filterSelfRows(list.records, selfStaffId));
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
