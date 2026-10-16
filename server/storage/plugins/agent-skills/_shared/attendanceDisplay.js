// _shared/attendanceDisplay.js
// 근태 표(출퇴근 기록·근무현황) 표시 보정 — 사용자 결정 2026-10-16.
//
// 1) 시각을 HH:MM으로 바꾼다. kiwibox는 "0900"처럼 4자리로 주는데, 위젯 표(okrservice
//    MarkdownTable)는 4자리를 금액처럼 보고 크기 막대를 그렸다 — 시각에는 의미 없는 막대.
// 2) 기준출근·기준퇴근은 대부분 모든 날이 같아 열 두 개가 좁은 위젯 폭만 차지한다.
//    가장 흔한 기준시간을 표 위 한 줄로 빼고, 기준이 다른 날(휴일근무 등)은 그 줄에 날짜로 적는다.
//
// 원칙: 원본을 변경하지 않는다(새 객체 반환). 형식이 예상과 다르면 그대로 둔다.

const TIME_KEYS = ["staTime", "endTime", "baseStaTime", "baseEndTime", "inTime", "outTime"];
const BASE_KEYS = ["baseStaTime", "baseEndTime"];

function toHHMM(value) {
  const s = value == null ? "" : String(value).trim();
  return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : value;
}

function formatTimes(rows) {
  return rows.map((row) => {
    const next = { ...row };
    for (const key of TIME_KEYS) {
      if (key in next) next[key] = toHHMM(next[key]);
    }
    return next;
  });
}

function baseHoursOf(row) {
  const start = toHHMM(row.baseStaTime) || "";
  const end = toHHMM(row.baseEndTime) || "";
  return start || end ? `${start || "—"}~${end || "—"}` : "";
}

function mostFrequent(values) {
  const counts = values.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? "";
}

/**
 * 기준출근·기준퇴근 열을 표 위 한 줄로 뺀다. 두 열이 컬럼 정의에 없으면 그대로 돌려준다.
 * 기준이 다른 날(휴일근무 등)은 표 칸이 아니라 같은 줄에 날짜로 적는다 — 대부분 빈 칸인 열을
 * 두면 모델이 표를 다시 쓰면서 칸이 어긋났다(2026-10-16 실측).
 *
 * @param {object[]} rows - 표시용 행(시각 보정 후)
 * @param {Object<string,string>} columns - 키 → 머리글
 * @returns {{rows: object[], columns: Object<string,string>, basisLine: string}}
 */
function splitBaseHours(rows, columns) {
  if (!columns || !BASE_KEYS.every((k) => k in columns)) {
    return { rows, columns, basisLine: "" };
  }
  const pairs = rows.map(baseHoursOf);
  const common = mostFrequent(pairs.filter(Boolean));
  const rest = Object.fromEntries(Object.entries(columns).filter(([k]) => !BASE_KEYS.includes(k)));
  if (!common) return { rows, columns: rest, basisLine: "" };

  const others = rows
    .map((row, i) => ({ day: dayLabel(row), pair: pairs[i] }))
    .filter(({ pair }) => pair && pair !== common);
  const shown = others.slice(0, MAX_OTHER_DAYS).map(({ day, pair }) => `${day}는 ${spaced(pair)}`);
  const more = others.length > MAX_OTHER_DAYS ? ` 외 ${others.length - MAX_OTHER_DAYS}일` : "";
  const note = others.length ? ` (${shown.join(", ")}${more})` : "";
  return { rows, columns: rest, basisLine: `> 기준 근무시간 ${spaced(common)}${note}\n\n` };
}

const MAX_OTHER_DAYS = 5;
const spaced = (pair) => pair.replace("~", " ~ ");

// "20260705" / "2026-07-05" → "7/5". 형식이 다르면 그대로.
function dayLabel(row) {
  const raw = String(row.workYmd ?? "").replace(/\D/g, "");
  return raw.length === 8 ? `${Number(raw.slice(4, 6))}/${Number(raw.slice(6))}` : String(row.workYmd ?? "");
}

/** 시각 보정 + 기준시간 분리를 한 번에. */
function prepareAttendanceTable(rows, columns) {
  return splitBaseHours(formatTimes(Array.isArray(rows) ? rows : rows ? [rows] : []), columns);
}

// 날짜별 기록이 여러 줄이면 목록 대신 표로, 값·칸은 그대로 — 모델이 표를 다시 쓰며 날짜·요일·칸을
// 바꾼 사례가 있었다(2026-10-16 실측)
const DAY_TABLE_LINE =
  "> [응답 형식] 날짜별 기록을 물으면 목록이 아니라 위 표의 열 그대로 표로 보여주세요. 날짜·요일·값을 바꾸거나 칸을 더하지 마세요. 특정 날짜만 물으면 그 날만 답하세요. 이 줄은 답변에 포함하지 마세요.";

// 특이사항(지각·조퇴·결근·출퇴근 누락)이 있는 날은 표 아래에 짧게 요약하게 한다
const ISSUE_SUMMARY_LINE =
  "> [응답 형식] 지각·조퇴·결근·출퇴근 누락이 있는 날은 표 아래에 날짜와 내용을 한 줄씩 짧게 요약하세요. 이 줄은 답변에 포함하지 마세요.";

module.exports = {
  DAY_TABLE_LINE,
  ISSUE_SUMMARY_LINE,
  toHHMM,
  formatTimes,
  splitBaseHours,
  prepareAttendanceTable,
};
