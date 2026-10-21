// _shared/monthHours.js
// 시간 값·서울 날짜·표 도우미 — 연장근무(overtimeStatus, specs/017)와 월 근무시간(workHours, specs/019)이
// 같은 규칙을 쓴다(019 코드 리뷰 M-5: 두 모듈에 줄 단위로 같은 helper가 있었다).

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DASH = "—";

const pad = (n) => String(n).padStart(2, "0");

// kiwibox jsonView는 camelCase. 대문자 원본(LMT_OT2, WORK_T, BAS_TIME1 등)도 받는다.
function field(row, camelKey) {
  const snake = camelKey.replace(/([A-Z])/g, "_$1").replace(/(\d+)/g, "_$1").toUpperCase();
  return row[camelKey] ?? row[snake] ?? row[snake.replace(/_(\d)/g, "$1")];
}

// 십진수만 숫자로 본다 — Number("0x10")=16, Number("1e2")=100 같은 해석을 막는다(017 코드 리뷰 L-3)
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
function toNumber(v) {
  const s = v == null ? "" : String(v).replace(/,/g, "").trim();
  return DECIMAL_RE.test(s) ? Number(s) : null;
}

/** 시간 숫자 → "12.0". 값이 없거나 숫자가 아니면 "—"(0으로 바꾸지 않는다) */
function formatHours(v) {
  const n = toNumber(v);
  return n === null ? DASH : n.toFixed(1);
}

/** 서울 기준 오늘 {y, m, d} — 서버 시간대가 UTC여도 날짜가 밀리지 않게 */
function seoulToday(now) {
  const d = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dashed = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const ymOf = (y, m) => `${y}${pad(m)}`;

function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

module.exports = {
  DASH,
  pad,
  field,
  toNumber,
  formatHours,
  seoulToday,
  lastDay,
  dashed,
  ymOf,
  mdTable,
};
