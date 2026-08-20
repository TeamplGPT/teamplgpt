// _shared/renderNormalize.js
// HR skill 공통 표시 정규화 — kiwibox 응답을 사람이 읽는 형태로 바꾼다.
//
// 이 3종은 원래 handler마다 사본으로 존재했다. 같은 결함이 skill이 늘 때마다 반복돼
// (요일 영문·통짜 날짜가 hr-attendance에서 두 번, HTML 태그가 hr-personnel에서 한 번,
// 코드값 노출이 교육·연말정산·증명서에서 반복) `_shared`로 승격했다 — specs/022 P0-2.
//
// 원칙: 전부 **원본을 변경하지 않는다**(새 객체 반환). 형식이 예상과 다르면 그대로 둔다 —
// 추측해 바꾸면 오히려 오답이 된다.
//
// ⚠️ 이 모듈을 고치면 서버를 실제로 재기동해야 반영된다. skill handler는 매 호출 새로
//    읽히지만 require("../_shared/...")는 Node require 캐시에 걸린다.

const WEEK_KO = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

/**
 * 날짜·요일 표시 보정. 원본은 변경하지 않는다.
 *
 * kiwibox는 endpoint마다 날짜 형식이 다르다 — `20260323` 통짜, `06-01`처럼 연도 없는
 * MM-DD, `2026-03-23` 하이픈이 섞여 온다. 요일도 `MON` 영문 3자로 온다.
 * 같은 규칙을 모든 endpoint에 일괄 적용하면 형식이 다른 쪽이 깨지므로, 호출부가
 * 어떤 키를 어떻게 바꿀지 명시할 때만 동작한다.
 *
 * @param {any} records kiwibox 언랩 결과
 * @param {{dateFrom?: string, dateTo?: string, weekKey?: string}} opts
 *   dateFrom의 YYYYMMDD를 YYYY-MM-DD로 바꿔 dateTo에 넣는다(같은 키면 제자리 치환).
 *   weekKey의 영문 3자 요일을 한글로 바꾼다. 형식이 다르면 각 항목을 건너뛴다.
 * @returns {object[]}
 */
function normalizeDisplayRows(records, opts) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const { dateFrom, dateTo, weekKey } = opts || {};
  return list.map((row) => {
    const out = { ...row };
    if (dateFrom && dateTo) {
      const raw = String(row?.[dateFrom] ?? "").trim();
      if (/^\d{8}$/.test(raw)) {
        out[dateTo] = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      }
    }
    if (weekKey) {
      const w = String(row?.[weekKey] ?? "")
        .trim()
        .toUpperCase();
      if (WEEK_KO[w]) out[weekKey] = WEEK_KO[w];
    }
    return out;
  });
}

/**
 * 셀 값의 HTML 줄바꿈 태그를 구분자로 바꾼다.
 *
 * kiwibox 인사카드 상세(getMBLPrtEmpCardPop)의 CONTENTS는 화면 표시용 HTML을 그대로
 * 담아 온다 — 실측: "오사공 직책과장 / Oh Sa Gong<BR>인사팀 과장<BR><BR>☎️ …".
 * 마크다운 표 셀에는 개행을 넣을 수 없어 태그를 지우기만 하면 항목이 붙어버리므로
 * 가운뎃점으로 치환한다. 연속 태그는 하나로 합친다.
 * LLM이 알아서 걸러 주기도 하지만(실측 2/2) 그건 보장이 아니라 운이다.
 */
function stripHtmlBreaks(v) {
  if (typeof v !== "string") return v;
  return v
    .replace(/(?:<br\s*\/?>\s*)+/gi, " · ")
    .replace(/\s+·\s+$/, "")
    .trim();
}

/**
 * 코드값을 사람이 읽는 라벨로 바꾼다. 원본은 변경하지 않는다.
 *
 * kiwibox는 `*_CD` 컬럼을 코드값 그대로 준다(교육 수료여부 `finCd`=1, 증명서 종류
 * `typeCd`=10 …). 그대로 렌더하면 "1"이 표에 찍혀 의미가 전달되지 않는다.
 *
 * 값이 비어 있으면 fallback을 쓴다 — 컬럼을 통째로 떨어뜨리면 LLM이 빈칸을 임의로
 * 메운다(2026-08-19 실측: 수료여부 미입력 건까지 "모두 완료"로 단정).
 * 정의에 없는 코드가 오면 원값을 그대로 남겨 오역보다 노출을 택한다.
 *
 * 매핑은 반드시 **공통코드 실조회**로 확정할 것(`/CommonCode.do?cmd=commonCodeList`,
 * `grpCd=<그룹>&queryId=<그룹>`). 추측 금지.
 *
 * @param {*} value 원값
 * @param {{map: Record<string,string>, fallback: string}} spec
 */
function applyCodeLabel(value, { map, fallback }) {
  const key = value === undefined || value === null ? "" : String(value).trim();
  if (key === "") return fallback;
  return map[key] ?? key;
}

module.exports = {
  WEEK_KO,
  normalizeDisplayRows,
  stripHtmlBreaks,
  applyCodeLabel,
};
