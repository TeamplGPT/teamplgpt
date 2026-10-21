/**
 * HR API date parameter resolver.
 *
 * Resolves date parameters from various formats:
 *   1) Exact format (YYYY / YYYYMM / YYYYMMDD) -> pass-through
 *   2) Partial numeric dates (month-only, day-only, MMDD) -> fill missing with current date
 *   3) Korean expressions (어제, 지난달, 3월, 15일 등) -> sugar-date parsing -> format conversion
 *   4) Unresolvable -> undefined (let API server use its own default)
 *
 * Partial date fill rules:
 *   - Missing year  -> current year
 *   - Missing month -> current month
 *   - Missing day   -> today
 *
 * @module dateResolver
 */
const Sugar = require("sugar-date");
require("sugar-date/locales/ko");
const { seoulWallClock } = require("./seoulClock");

// "어제"·"지난달"·"3월" 같은 상대 표현의 기준 "현재"를 서울 시각으로 — 서버가 UTC면 서울 기준
// 매월 1일 아침에 "이번달"이 지난달로 해석됐다. sugar-date는 서버 안에서 이 모듈만 쓴다.
Sugar.Date.setOption("newDateInternal", () => seoulWallClock());

const FORMAT_REGEX = {
  year: /^\d{4}$/,
  year_month: /^\d{6}$/,
  base_date: /^\d{8}$/,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * Format a Date object into the specified string format.
 * @param {Date} date
 * @param {"year"|"year_month"|"base_date"} format
 * @returns {string|undefined}
 */
function formatDate(date, format) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  switch (format) {
    case "year":
      return String(y);
    case "year_month":
      return `${y}${m}`;
    case "base_date":
      return `${y}${m}${d}`;
    default:
      return undefined;
  }
}

/**
 * Resolve partial numeric dates by filling missing components with current date.
 *
 * Handles cases where LLM sends bare numbers like "3" (month), "15" (day), "0315" (MMDD).
 *
 * @param {string} str - Trimmed string value
 * @param {"year"|"year_month"|"base_date"} format - Target format
 * @returns {string|undefined} Resolved date string or undefined if not a partial date
 */
function resolvePartialNumeric(str, format) {
  const now = seoulWallClock();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();
  const num = Number(str);

  if (!Number.isInteger(num) || num <= 0) return undefined;

  if (format === "year_month") {
    // Bare 1-2 digits (1~12) -> interpret as month, fill current year
    if (/^\d{1,2}$/.test(str) && num >= 1 && num <= 12) {
      return `${curY}${pad(num)}`;
    }
  }

  if (format === "base_date") {
    // Bare 1-2 digits (1~31) -> interpret as day, fill current year+month
    if (/^\d{1,2}$/.test(str) && num >= 1 && num <= 31) {
      return `${curY}${pad(curM)}${pad(num)}`;
    }
    // Bare 3-4 digits (MMDD pattern, e.g. "315" or "0315") -> fill current year
    if (/^\d{3,4}$/.test(str)) {
      const s = str.padStart(4, "0"); // "315" -> "0315"
      const mm = parseInt(s.slice(0, 2), 10);
      const dd = parseInt(s.slice(2, 4), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${curY}${pad(mm)}${pad(dd)}`;
      }
    }
  }

  return undefined;
}

// "올해 3월"·"작년 12월" — sugar-date 한국어 로케일은 "3월"·"작년"은 알지만 둘이 붙은 표현은 몰라
// undefined였다(→ 월 단위 조회가 이번 달로 대체됨). 재작년을 작년보다 먼저 본다.
const RELATIVE_YEAR_OFFSETS = [
  [/^재작년$/, -2],
  [/^(작년|지난\s*해|전년)$/, -1],
  [/^(올해|금년|이번\s*년도?|이번\s*해)$/, 0],
  [/^내년$/, 1],
];
const RELATIVE_YEAR_MONTH_RE = /^(재작년|작년|지난\s*해|전년|올해|금년|이번\s*년도?|이번\s*해|내년)\s*(\d{1,2})\s*월$/;
// "3월 전체", "9월 한 달" — 범위 꼬리말은 떼고 해석한다
const WHOLE_SUFFIX_RE = /\s*(전체|한\s*달)$/;

// sugar-date 한국어 로케일이 모르는 자주 쓰는 표현을 아는 표현으로 바꾼다(2026-10-21).
// 해석하지 못한 기간은 조회하지 않고 안내하게 됐으므로(_shared/periodCheck) 흔한 말은 읽어야 한다.
const KOREAN_MONTHS = {
  일월: 1, 이월: 2, 삼월: 3, 사월: 4, 오월: 5, 유월: 6,
  칠월: 7, 팔월: 8, 구월: 9, 시월: 10, 십일월: 11, 십이월: 12,
};
const KOREAN_COUNT = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };
const SYNONYMS = [
  [/^(이달|금월|당월)$/, "이번 달"],
  [/^익월$/, "다음 달"],
  [/^전월$/, "지난달"],
  [/^저번\s*/, "지난"], // 저번 달 → 지난달, 저번주 → 지난주
  [/^지지난\s*달$/, "2개월 전"],
];

function normalizeKorean(input) {
  let s = input.replace(/\s+/g, " ").trim();
  s = s.replace(/(\d{1,2})\s*월\s*(초순|초|중순|하순|말일|말|달|까지)$/, "$1월"); // 3월 초·3월달
  s = s.replace(/\s*달\s*까지$/, " 달"); // 이번 달까지
  s = s.replace(/^(\d{2})\s*년\s*(\d{1,2})\s*월$/, "20$1년 $2월"); // 25년 3월
  if (KOREAN_MONTHS[s] != null) s = `${KOREAN_MONTHS[s]}월`;
  s = s.replace(/^(\d+|한|두|세|네|다섯|여섯)\s*달\s*전$/, (_, n) => `${KOREAN_COUNT[n] ?? n}개월 전`);
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  return s;
}

/**
 * 연도 상대 표현 + 월 → YYYYMM(year_month) 또는 YYYY(year). 해당 없으면 undefined.
 * @param {string} str
 * @param {"year"|"year_month"|"base_date"} format
 */
function resolveRelativeYearMonth(str, format) {
  if (format !== "year_month" && format !== "year") return undefined;
  const m = RELATIVE_YEAR_MONTH_RE.exec(str);
  if (!m) return undefined;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  const offset = RELATIVE_YEAR_OFFSETS.find(([re]) => re.test(m[1].replace(/\s+/g, " ").trim()))?.[1];
  if (offset === undefined) return undefined;
  const year = seoulWallClock().getFullYear() + offset;
  return format === "year" ? String(year) : `${year}${pad(month)}`;
}

/**
 * Resolve a date parameter value into the expected format string.
 *
 * @param {*} value - The raw value from the LLM (e.g. "202503", "어제", "3월", "15")
 * @param {"year"|"year_month"|"base_date"} format - Target format
 * @returns {string|undefined} Formatted date string or undefined if unresolvable
 *
 * @example
 *   resolveDateParam("202503", "year_month")  // "202503"   (exact format)
 *   resolveDateParam("어제",   "base_date")   // "20260327" (Korean relative)
 *   resolveDateParam("3월",    "year_month")  // "202603"   (Korean partial)
 *   resolveDateParam("15일",   "base_date")   // "20260315" (Korean partial)
 *   resolveDateParam("3",      "year_month")  // "202603"   (bare month number)
 *   resolveDateParam("15",     "base_date")   // "20260315" (bare day number)
 *   resolveDateParam("0315",   "base_date")   // "20260315" (MMDD pattern)
 *   resolveDateParam("작년",   "year")         // "2025"     (Korean relative)
 *   resolveDateParam(undefined, "year")        // undefined
 */
function resolveDateParam(value, format) {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (raw === "") return undefined;
  const str = normalizeKorean(raw.replace(WHOLE_SUFFIX_RE, "").trim() || raw);

  // 1) Already in the exact expected format -> pass-through
  if (FORMAT_REGEX[format]?.test(str)) return str;

  // 2) Partial numeric dates -> fill missing components with current date
  const partial = resolvePartialNumeric(str, format);
  if (partial) return partial;

  // 3) 연도 상대 표현 + 월("올해 3월", "작년 12월")
  const relative = resolveRelativeYearMonth(str, format);
  if (relative) return relative;
  if (RELATIVE_YEAR_MONTH_RE.test(str)) return undefined; // "작년 13월"처럼 없는 달 — sugar-date 추측 금지

  // 4) Try parsing as Korean date expression via sugar-date (handles 3월, 15일, 어제, 지난달 etc.)
  try {
    const parsed = Sugar.Date.create(str, { locale: "ko" });
    if (parsed instanceof Date && !isNaN(parsed.getTime())) {
      return formatDate(parsed, format);
    }
  } catch {
    // sugar-date parsing failed -> fall through
  }

  // 5) Unresolvable -> undefined (API server will use its own default)
  return undefined;
}

module.exports = { resolveDateParam };
