/**
 * 연도 단위 기간 해석 (specs/015 contracts/period-resolver.md).
 *
 * 월 없이 연도만 말한 기간 값("올해", "이번년도", "2026년", "작년" …)을 그해 기간으로 바꾼다.
 * 연도 단위가 아니면 null을 반환하고, handler는 기존 경로(resolveDateParam)를 그대로 탄다.
 *
 * dateResolver(sugar-date)는 "2026"을 1월로, "올해"를 이번 달로 바꾸고 "이번년도"·"금년"·
 * "재작년"은 해석하지 못한다. 그 동작에 기대는 월 단위 질문을 건드리지 않으려고
 * dateResolver를 고치지 않고 이 모듈을 따로 둔다(spec D3).
 *
 * @module periodResolver
 */

// 상대 연도 표현 → 올해 기준 오프셋 (공백 제거 후 비교)
const YEAR_WORD_OFFSET = Object.freeze({
  올해: 0,
  올: 0, // "올 한해" → 범위 접미사 제거 후 "올"
  금년: 0,
  금년도: 0,
  이번년도: 0,
  이번연도: 0, // 표준 표기
  이번해: 0,
  당해: 0,
  당해년도: 0,
  당해연도: 0,
  작년: -1,
  작년도: -1,
  지난해: -1,
  지난년도: -1,
  전년: -1,
  전년도: -1,
  재작년: -2,
  내년: 1,
  내후년: 2,
});

// "2026년 전체", "올해 전부", "올 한해 동안"처럼 연도 뒤에 붙는 범위 강조 — 떼고 판정한다.
// 가드가 "표현 그대로 전달"을 지시하므로 모델이 이런 원문을 넘길 수 있다(코드 리뷰 HIGH-2).
// "1년"은 넣지 않는다 — "2021년"의 끝과 겹친다. "3월 전체"는 떼어도 "3월"이라 여전히 null.
const SCOPE_SUFFIX = /(전체|전부|한해|일년|동안|내내)+$/; // 공백 제거 후 적용

const KINDS = new Set(["record", "schedule"]);
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;
// 날짜는 서울 기준([HR_DATE_CONTEXT]와 동일). KST는 일광절약시간이 없어 고정 오프셋으로 충분하다.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function dashed(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function seoulToday(now) {
  const d = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// 연도 단위 표현이면 대상 연도(number), 아니면 null
function parseTargetYear(raw, currentYear) {
  const str = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(SCOPE_SUFFIX, "");
  if (!str) return null;
  const numeric = str.match(/^(\d{4})(?:년도?)?$/);
  if (numeric) {
    const year = Number(numeric[1]);
    return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
  }
  if (Object.prototype.hasOwnProperty.call(YEAR_WORD_OFFSET, str)) {
    return currentYear + YEAR_WORD_OFFSET[str];
  }
  return null;
}

/**
 * @param {*} raw - LLM이 넘긴 기간 값(year_month 또는 cal_yy)
 * @param {object} opts
 * @param {"record"|"schedule"} opts.kind - record(실적 기록)는 올해면 오늘까지, schedule(일정)은 12/31까지
 * @param {Date} [opts.now] - 기준 시각 (기본: 현재)
 * @returns {null|{year: string, start: string, end: string, months: string[], isCurrentYear: boolean, label: string}}
 */
function resolveYearPeriod(raw, { kind, now = new Date() } = {}) {
  if (!KINDS.has(kind)) {
    throw new Error(
      `resolveYearPeriod: kind는 "record" 또는 "schedule"이어야 합니다 (받은 값: ${kind})`
    );
  }
  const today = seoulToday(now);
  const target = parseTargetYear(raw, today.year);
  if (target === null) return null;

  const isCurrentYear = target === today.year;
  const untilToday = kind === "record" && isCurrentYear;
  const endMonth = untilToday ? today.month : 12;
  const endDay = untilToday ? today.day : 31;

  const year = String(target);
  const start = `${year}0101`;
  const end = `${year}${pad(endMonth)}${pad(endDay)}`;
  const months = Array.from({ length: endMonth }, (_, i) => `${year}${pad(i + 1)}`);
  const scope = untilToday ? `${year}년, 오늘까지` : `${year}년 전체`;

  return {
    year,
    start,
    end,
    months,
    isCurrentYear,
    label: `${dashed(start)} ~ ${dashed(end)} (${scope})`,
  };
}

module.exports = { resolveYearPeriod };
