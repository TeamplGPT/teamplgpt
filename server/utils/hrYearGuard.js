// 지어낸 연도 막기 (사용자 결정 2026-10-19: "지어내는 건 절대 안 돼")
//
// 실측: "6월 급여 지급 건 목록 알려줘"(연도 없음)에 모델이 year_month="2023-06"을 보내 2023년을 조회하고
// "2023년 6월에는 …"이라고 답했다(오늘은 2026년). 시스템 지시 [HR_SKILL_COMMON] 3·4항("발화에 없는 연도를
// 붙이지 말 것", "연도가 없으면 월 표현 그대로")을 어긴 것이다. 지시(L1)로는 보장할 수 없어 서버(L2)에서 막는다.
//
//  1) correctToolArgs — HR tool 인자의 연도가 사용자가 말한 연도(대화 전체)·상대 표현(올해·작년·재작년·내년)·
//     올해가 아니면 연도를 뗀다: "2023-06" → "6월"(올해 기준 조회), "2023" → 인자 삭제(기본값).
//     연말정산 cal_yy는 귀속연도라 작년도 허용한다.
//  2) stripUnknownYears — 답변 문장의 "YYYY년"이 허용 연도(+조회 결과에 나온 연도)가 아니면 뗀다.
//
// 순수 함수만 둔다 — tool 루프(utils/chats/toolCalling/loop.js)가 호출한다.

const { isHrTool, skillIdOf } = require("./hrSelfDataNotice");

const RELATIVE_YEAR = [
  [/재작년/, -2],
  [/(?<!재)작년|지난\s*해|전년/, -1],
  [/올해|금년|이번\s*(년|연)도|당해/, 0],
  [/내년/, 1],
  [/내후년/, 2],
];
// 하루·주 상대 표현 — 연초에는 어제·지난주가 작년이다(specs/020 코드 리뷰 M1). 그 날들의 연도도 허용한다
const RELATIVE_DAY = /어제|그저께|그제|지난\s*주|저번\s*주|이번\s*주|금주|오늘|금일|내일|모레|다음\s*주|차주/;
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_PARAMS = ["year_month", "cal_yy", "date"]; // date: 하루·주(specs/020)

function seoulYear(now) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));
}

// 메시지 content — 문자열 또는 [{type, text}] 배열(Responses·Anthropic)
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join(" ");
  return "";
}

/** 문자열에 나온 연도(4자리 19xx·20xx, "24년" 같은 2자리+년) */
function yearsIn(text) {
  const s = String(text ?? "");
  const four = [...s.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  const two = [...s.matchAll(/(?<!\d)(\d{2})\s*년/g)].map((m) => 2000 + Number(m[1]));
  // YYYYMM("202306") — 8자리 날짜(20260125)는 뒤에 숫자가 이어져 걸리지 않는다
  const ym = [...s.matchAll(/(?<!\d)((?:19|20)\d{2})(?:0[1-9]|1[0-2])(?!\d)/g)].map((m) => Number(m[1]));
  // YYYYMMDD("20231015") — date 인자(specs/020)
  const ymdYears = [...s.matchAll(/(?<!\d)((?:19|20)\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)/g)].map((m) => Number(m[1]));
  return new Set([...four, ...two, ...ym, ...ymdYears]);
}

/**
 * 허용 연도 — 대화의 사용자 메시지에 나온 연도 + 상대 표현이 가리키는 연도 + 올해
 * @param {Array} messages
 * @param {Date} [now]
 * @returns {Set<number>}
 */
function allowedYears(messages, now = new Date()) {
  const current = seoulYear(now);
  const userText = (messages || [])
    .filter((m) => m && m.role === "user")
    .map((m) => textOf(m.content))
    .join("\n");
  const relative = RELATIVE_YEAR.filter(([re]) => re.test(userText)).map(([, d]) => current + d);
  // 하루·주 상대 표현은 앞뒤 2주 안 — 그 사이 날짜들의 연도
  const nearby = RELATIVE_DAY.test(userText)
    ? [-14, 14].map((d) => seoulYear(new Date(now.getTime() + d * DAY_MS)))
    : [];
  return new Set([current, ...yearsIn(userText), ...relative, ...nearby]);
}

// year_month 값에서 연도 떼기 — 월이 있으면 "N월", 연도만이면 null(인자 삭제)
function dropYear(value) {
  const s = String(value).trim();
  const ym = /^((?:19|20)\d{2})\s*[-./년]?\s*(\d{1,2})\s*월?$/.exec(s);
  if (ym && Number(ym[2]) >= 1 && Number(ym[2]) <= 12) return `${Number(ym[2])}월`;
  return null;
}

// date 값에서 연도 떼기 — "2023-10-15"·"20231015"·"2023년 10월 15일" → "10월 15일"(올해 기준 조회)
function dropYearFromDay(value) {
  const s = String(value).trim();
  const m =
    /^(?:19|20)\d{2}(\d{2})(\d{2})$/.exec(s) ||
    /^(?:19|20)\d{2}\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(s);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : null;
}

function parseArgs(args) {
  if (args && typeof args === "object") return { obj: args, wasString: false };
  try {
    return { obj: JSON.parse(String(args ?? "{}")), wasString: true };
  } catch (_) {
    return { obj: null, wasString: true };
  }
}

/**
 * HR tool 인자의 근거 없는 연도를 뗀 새 tool 호출(원본 불변).
 * @param {{name: string, arguments: string|object}} tc
 * @param {Set<number>} allowed - allowedYears 결과
 * @returns {{tc: object, corrected: boolean}}
 */
function correctToolArgs(tc, allowed) {
  if (!isHrTool(tc?.name)) return { tc, corrected: false };
  const { obj, wasString } = parseArgs(tc.arguments);
  if (!obj) return { tc, corrected: false };
  // 연말정산 귀속연도 — 작년(최신 귀속연도)도 사용자가 말한 것처럼 본다
  const ok = new Set(allowed);
  if (skillIdOf(tc.name) === "hr-year-end-tax") ok.add(Math.max(...allowed) - 1);

  const next = { ...obj };
  let corrected = false;
  for (const key of YEAR_PARAMS) {
    if (next[key] == null) continue;
    const years = [...yearsIn(next[key])];
    if (years.length === 0 || years.every((y) => ok.has(y))) continue;
    const replaced = key === "year_month" ? dropYear(next[key]) : key === "date" ? dropYearFromDay(next[key]) : null;
    if (replaced) next[key] = replaced;
    else delete next[key];
    corrected = true;
  }
  if (!corrected) return { tc, corrected: false };
  return { tc: { ...tc, arguments: wasString ? JSON.stringify(next) : next }, corrected: true };
}

/**
 * 답변 문장에서 허용되지 않은 "YYYY년"을 뗀다("2023년 6월" → "6월").
 * @param {string} text
 * @param {Set<number>} allowed
 */
function stripUnknownYears(text, allowed) {
  if (typeof text !== "string") return text;
  return text.replace(/(?<!\d)((?:19|20)\d{2})\s*년\s*/g, (whole, y) => (allowed.has(Number(y)) ? whole : ""));
}

module.exports = { allowedYears, correctToolArgs, stripUnknownYears, yearsIn };
