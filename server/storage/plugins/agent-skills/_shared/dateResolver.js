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
  const now = new Date();
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
  const str = String(value).trim();
  if (str === "") return undefined;

  // 1) Already in the exact expected format -> pass-through
  if (FORMAT_REGEX[format]?.test(str)) return str;

  // 2) Partial numeric dates -> fill missing components with current date
  const partial = resolvePartialNumeric(str, format);
  if (partial) return partial;

  // 3) Try parsing as Korean date expression via sugar-date (handles 3월, 15일, 어제, 지난달 etc.)
  try {
    const parsed = Sugar.Date.create(str, { locale: "ko" });
    if (parsed instanceof Date && !isNaN(parsed.getTime())) {
      return formatDate(parsed, format);
    }
  } catch {
    // sugar-date parsing failed -> fall through
  }

  // 4) Unresolvable -> undefined (API server will use its own default)
  return undefined;
}

module.exports = { resolveDateParam };
