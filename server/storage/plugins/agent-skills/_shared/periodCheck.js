// _shared/periodCheck.js
// 기간을 말했는데 해석하지 못하면 조회하지 않고 안내한다(2026-10-21 사용자 결정).
// 전에는 skill마다 해석 실패를 이번 달(근태·연장근무·일정)·최근 3개월(급여 지급 건·결재)·최신 연도(연말정산)로
// 조용히 바꿔 조회해, 사용자가 말한 기간과 다른 값이 답변에 나갔다.
// "최근"·"요즘"·"전체"처럼 기간을 정하지 않는 말은 지정하지 않은 것과 같게 본다(기본 기간 그대로).

const { resolveDateParam } = require("./dateResolver");
const { resolveYearPeriod } = require("./periodResolver");

const UNSPECIFIED_RE = /^(최근|요즘|전체|전부|모두|전체\s*기간)$/;

// 입력값을 문구에 싣지 않는다 — 모델이 만든 값이 사용자 화면에 그대로 나가지 않게
const UNRESOLVED_PERIOD =
  '> ⚠️ 말씀하신 기간을 해석하지 못해 조회하지 않았습니다. "9월", "지난달", "2025년 3월"처럼 달이나 연도로 말씀해 주세요.';

const validMonth = (ym) => Number(ym.slice(4, 6)) >= 1 && Number(ym.slice(4, 6)) <= 12;

/** 기간을 정하지 않는 말·빈 값은 undefined, 그 밖은 그대로 */
function cleanPeriod(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" || UNSPECIFIED_RE.test(s) ? undefined : value;
}

/**
 * 기간 인자 검사 — 문제 없으면 null, 말했는데 해석하지 못하면 안내 문구.
 * @param {*} value - year_month / cal_yy
 * @param {"year_month"|"year"} [format]
 * @returns {string|null}
 */
function periodProblem(value, format = "year_month") {
  const v = cleanPeriod(value);
  if (v === undefined) return null;
  if (resolveYearPeriod(v, { kind: "record" })) return null;
  const resolved = resolveDateParam(v, format);
  // "202600"·"202613"은 형식만 맞아 그대로 통과한다 — 없는 달은 해석 실패로 본다
  if (format === "year_month" && resolved && !validMonth(resolved)) return UNRESOLVED_PERIOD;
  return resolved ? null : UNRESOLVED_PERIOD;
}

module.exports = { UNRESOLVED_PERIOD, cleanPeriod, periodProblem };
