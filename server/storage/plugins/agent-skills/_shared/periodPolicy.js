// _shared/periodPolicy.js
// HR skill 공통 기간 정책 — "사용자가 기간을 말했는가"와 "우리가 기본값을 넣었는가"를 구분한다.
//
// 이 구분이 없어서 같은 결함이 세 번 반복됐다(specs/022 P-SCOPE):
//   · 결재 미결함이 이번 달로 좁혀져 지난 미결 문서가 숨겨짐        (`2316a9bb`)
//   · 기결·반려도 동일                                              (`8b3fde58`)
//   · 급여 3종이 매월 1~24일 답변 불가 — 이번 달 지급건이 0건이라   (`8fe9983d`)
//
// 핵심: **사용자가 기간을 말하지 않았을 때 "이번 달"은 우리가 넣은 기본값일 뿐 사용자의
// 뜻이 아니다.** 그걸 필터로 그대로 쓰면 있는 데이터가 숨는다. 그래서 호출부가
// `ymGiven`(사용자 명시 여부)을 반드시 볼 수 있게 돌려준다.
//
// ⚠️ 이 모듈을 고치면 서버를 실제로 재기동해야 반영된다(require 캐시).

const { resolveDateParam } = require("./dateResolver");
const { monthRange } = require("./hrSession");

/**
 * 월 단위 조회 범위를 푼다.
 *
 * @param {string|undefined} yearMonth LLM이 넘긴 year_month (없을 수 있음)
 * @returns {{
 *   ym: string,        // YYYYMM — 항상 값이 있다(미지정이면 이번 달)
 *   ymGiven: string|null, // 사용자가 명시한 경우에만 값. 기본값 적용 시 null
 *   sYmd: string,      // ym의 월초 YYYYMMDD
 *   eYmd: string,      // ym의 말일 YYYYMMDD
 *   scopeText: string, // 답변에 밝힐 조회 범위 문구
 * }}
 *
 * 사용 예 — 기간 미지정 시 전체를 봐야 하는 조회(미결함 등):
 *   const { ym, ymGiven, sYmd, eYmd, scopeText } = resolveMonthScope(year_month);
 *   const unscoped = !ymGiven;                    // 기간을 보내지 않는다
 *   ...(unscoped ? {} : { sdt: sYmd, edt: eYmd })
 *
 * 사용 예 — 이번 달이 비면 최근 건으로 물러나야 하는 조회(급여 등):
 *   if (isEmpty && !ymGiven) { ...최근 건 조회... }
 */
function resolveMonthScope(yearMonth) {
  const ymGiven = resolveDateParam(yearMonth, "year_month") || null;
  const ym = ymGiven || resolveDateParam("이번달", "year_month");
  const [sYmd, eYmd] = monthRange(ym);
  return { ym, ymGiven, sYmd, eYmd, scopeText: monthScopeText(ym) };
}

/**
 * 조회 범위를 사람이 읽는 문구로. 답변에 기간을 밝히지 않으면 사용자가 "왜 이것만
 * 나오지"를 알 수 없다(`b98716f3`에서 이 누락을 고쳤다).
 */
function monthScopeText(ym) {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

/** 기간을 보내지 않는 경우의 문구 */
const UNSCOPED_TEXT = "전체 기간";

module.exports = { resolveMonthScope, monthScopeText, UNSCOPED_TEXT };
