// _shared/dateRange.js
// 하루·주 조회 범위 (specs/020) — "오늘 출근시각"에 한 달 표가 붙던 문제. 근태·인사 조회의 date 인자를
// 시작일~종료일(YYYYMMDD)로 바꾼다. 날짜 기준은 서울, 주는 월요일~일요일.
// 해석 규칙: specs/020-hr-day-week-query/contracts/date-param.md §3
//
//   resolveDateRange(value, now) → { start, end, kind: "day"|"week", label } | undefined(지정 없음) | null(해석 실패)
//
// 없는 날짜("10월 32일")는 추측하지 않고 null — 다른 날로 바꿔 조회하지 않는다(2026-10-21 periodCheck 원칙).
// 요일 표현("이번 주 수요일"·"지난 월요일"·"수요일")은 그 주의 그 요일 하루(D14).
// 연도 없는 날짜가 오늘보다 6개월 넘게 뒤면 작년으로 본다 — 1월 초 "12월 31일"(D12, 사용자 결정 2026-10-23).

const { cleanPeriod } = require("./periodCheck");
const { seoulToday } = require("./monthHours");

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

const RELATIVE_DAYS = [
  [/^(오늘|금일)$/, 0, "오늘"],
  [/^어제$/, -1, "어제"],
  [/^(그저께|그제)$/, -2, "그저께"],
  [/^내일$/, 1, "내일"],
  [/^모레$/, 2, "모레"],
];
const RELATIVE_WEEKS = [
  [/^(이번\s*주|금주)$/, 0, "이번 주"],
  [/^(지난\s*주|저번\s*주)$/, -1, "지난주"],
  [/^(다음\s*주|차주)$/, 1, "다음 주"],
];

const WEEKDAYS = "월화수목금토일"; // 월요일 = 0
// "이번 주 수요일"·"지난 월요일"·"수요일" — [주 이동, 요일 번호]
function weekdayOf(s) {
  const m = /^(?:(이번\s*주|금주|지난\s*주|저번\s*주|지난|다음\s*주|차주)\s*)?([월화수목금토일])요일$/.exec(s);
  if (!m) return null;
  const word = m[1] || "이번 주";
  const offset = /지난|저번/.test(word) ? -1 : /다음|차주/.test(word) ? 1 : 0;
  return [offset, WEEKDAYS.indexOf(m[2])];
}
const WEEK_NAMES = { "-1": "지난주", 0: "이번 주", 1: "다음 주" };

// UTC 기준 날짜 객체로 계산한다(서울 "오늘"의 연·월·일만 쓰므로 시간대 영향 없음)
const utcDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const parts = (date) => ({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
const ymd = ({ y, m, d }) => `${y}${pad(m)}${pad(d)}`;
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);
const mondayOf = (date) => addDays(date, -((date.getUTCDay() + 6) % 7));
// 연도 없는 날짜를 지난 날로 볼 기준 — 오늘보다 이만큼 넘게 뒤면 작년(D12)
const FAR_FUTURE_DAYS = 183;

function validDate(y, m, d) {
  const date = utcDate(y, m, d);
  const p = parts(date);
  return p.y === y && p.m === m && p.d === d ? date : null;
}

// 명시한 하루 — 20261015 / 2026-10-15 / 2026년 10월 15일 / 10월 15일 / 15일 / 10/15
// 마지막 칸은 연도를 말하지 않은 월-일인지(D12 대상)
function explicitDay(s, today) {
  let m;
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return [+m[1], +m[2], +m[3], false];
  if ((m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s))) return [+m[1], +m[2], +m[3], false];
  if ((m = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/.exec(s))) return [+m[1], +m[2], +m[3], false];
  if ((m = /^(\d{1,2})\s*월\s*(\d{1,2})\s*일$/.exec(s))) return [today.y, +m[1], +m[2], true];
  if ((m = /^(\d{1,2})\s*일$/.exec(s))) return [today.y, today.m, +m[1], false];
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) return [today.y, +m[1], +m[2], true];
  return null;
}

const dayRange = (date, label) => {
  const v = ymd(parts(date));
  return { start: v, end: v, kind: "day", label };
};

/**
 * @param {*} value - date 인자
 * @param {Date} [now]
 * @returns {{start: string, end: string, kind: "day"|"week", label: string} | undefined | null}
 */
function resolveDateRange(value, now = new Date()) {
  const cleaned = cleanPeriod(value);
  if (cleaned === undefined) return undefined;
  // "오늘자"·"10월 15일자"의 "자"는 뗀다(코드 리뷰 M5)
  const s = String(cleaned).replace(/\s+/g, " ").trim().replace(/(\S)자$/, "$1");
  const today = seoulToday(now);
  const todayDate = utcDate(today.y, today.m, today.d);

  for (const [re, offset, name] of RELATIVE_DAYS) {
    if (re.test(s)) {
      const p = parts(addDays(todayDate, offset));
      return dayRange(addDays(todayDate, offset), `${name}(${p.m}/${p.d})`);
    }
  }
  const weekday = weekdayOf(s);
  if (weekday) {
    const [offset, index] = weekday;
    const date = addDays(mondayOf(todayDate), offset * 7 + index);
    const p = parts(date);
    return dayRange(date, `${WEEK_NAMES[offset]} ${WEEKDAYS[index]}요일(${p.m}/${p.d})`);
  }
  for (const [re, offset, name] of RELATIVE_WEEKS) {
    if (re.test(s)) {
      const monday = addDays(mondayOf(todayDate), offset * 7);
      const sunday = addDays(monday, 6);
      const [a, b] = [parts(monday), parts(sunday)];
      return { start: ymd(a), end: ymd(b), kind: "week", label: `${name}(${a.m}/${a.d}~${b.m}/${b.d})` };
    }
  }
  const day = explicitDay(s, today);
  if (!day) return null;
  let [y, m, d, yearless] = day;
  let date = validDate(y, m, d);
  if (!date) return null;
  if (yearless && (date - todayDate) / DAY_MS > FAR_FUTURE_DAYS) {
    y -= 1;
    date = validDate(y, m, d); // 2/29 → 작년에 없으면 null
    if (!date) return null;
  }
  return dayRange(date, y === today.y ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`);
}

/** 라벨 뒤 주제 조사 — 괄호 앞말 끝 글자 받침으로("내일(10/24)은", "다음 주(10/26~11/1)는") */
function topicParticle(label) {
  const word = String(label).replace(/\(.*\)$/, "").trim();
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "은";
  return code % 28 === 0 ? "는" : "은";
}

/** 8자리 날짜가 범위 안인가 */
function inRange(value, range) {
  const v = String(value ?? "").replace(/\D/g, "");
  return v.length === 8 && v >= range.start && v <= range.end;
}

/** 범위가 걸친 달 목록("YYYYMM") */
function monthsOf(range) {
  const months = [];
  let y = Number(range.start.slice(0, 4));
  let m = Number(range.start.slice(4, 6));
  const last = range.end.slice(0, 6);
  while (`${y}${pad(m)}` <= last) {
    months.push(`${y}${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

module.exports = { resolveDateRange, inRange, monthsOf, topicParticle };
