// _shared/overtimeStatus.js
// 연장근무 한도·사용·잔여 (specs/017) — 5240 모바일 "연장근무현황"과 같은 조회를 쓴다.
//
//  - 한도·사용·잔여: /getMBLDclzWorkOtSchdul.do (searchType 2=주간, 3=월간, 기준일 searchBaseSYmd)
//  - 날짜별 내역:    /getMBLDclzWorkOtSchdulPerson.do (searchBaseSYmd가 속한 달 1일 ~ searchBaseEYmd)
//  근거: kiwibox MBLDclzWorkOtSchdul_SQL.xml / mblDclzWorkOtSchdul.jsp (research R1)
//
// ⚠️ 대상 직원(cmmSearchStaffId)이 비면 kiwibox는 요청자의 조회 권한 범위 직원 전체를 돌려준다
//    ("본인소속조회", research R2). 모든 요청에 본인 마커를 넣고, 한도 응답이 정확히 1행이 아니면
//    결과를 쓰지 않는다 — 응답에 직원 ID가 없어 본인 행만 골라낼 수 없다(research R3).
//
// 네트워크는 fetch 콜백으로 받는다(hrFetch와 같은 {errorMessage, records, isEmpty} 형식) —
// 단위 테스트에서 스텁으로 돌리기 위해서다. 원본 응답은 변경하지 않는다.
//
// 출력 계약: specs/017-hr-overtime-limit/contracts/tool-output-overtime.md

const { resolveDateParam } = require("./dateResolver");
const { resolveYearPeriod } = require("./periodResolver");
const { SELF_STAFF_ID_MARKER } = require("./hrSession");
const { toHHMM } = require("./attendanceDisplay");
const { ANSWER_GUIDE, safeCell } = require("./formatTable");
const { runMonthly, monthlyPeriod, withPeriodHeader } = require("./yearQuery");
const { DASH, pad, field, toNumber, formatHours, seoulToday, lastDay, dashed, ymOf, mdTable } = require("./monthHours");
const { inRange, topicParticle } = require("./dateRange");

const LIMIT_PATH = "/getMBLDclzWorkOtSchdul.do";
const PERSON_PATH = "/getMBLDclzWorkOtSchdulPerson.do";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TITLE = "## HR 근태 - 연장근무 현황\n\n";
const USED_NOTE = "> 사용 시간에는 결재 중인 신청 건이 포함됩니다.";
const SELF_CHECK_FAIL =
  "> ⚠️ 본인 연장근무 현황을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
// 연 단위 월별 조회에서 1행이 아닌 달 — runMonthly가 첫 문장을 "조회되지 않은 달" 사유로 쓴다
const NOT_SELF_ROW = "> ⚠️ 본인 한 명 분이 아닌 응답이라 사용하지 않았습니다.";

// 이번 달 결과에서 모델이 월간 값만 목록으로 답해 이번 주 줄을 뺀 사례가 있었다(2026-10-19 E2E K6)
const limitTableLine = (rows) =>
  `> [응답 형식] 연장근무 현황·내역을 물으면 위 한도 표(구분|한도|사용|잔여)를 목록으로 바꾸거나 줄을 빼지 말고 표 그대로 보여주세요${rows > 1 ? "(이번 주·이번 달 두 줄 모두)" : ""}. 남은 시간만 물으면 잔여를 첫 문장에 쓰세요. 날짜별 내역이 2건 이상이면 표로 보여주세요. 날짜·값을 바꾸거나 계산하지 마세요. 이 줄은 아래 [응답 지침]보다 우선합니다. 이 줄은 답변에 포함하지 마세요.`;
const NO_OT_LINE =
  '> [응답 형식] 연장근무 기록이 없다는 사실을 위 문장 그대로 전하세요. "1건", "0건 조회" 같은 표현은 쓰지 마세요. 이 줄은 답변에 포함하지 마세요.';
const YEAR_TABLE_LINE =
  "> [응답 형식] 월별 값을 위 표(월|한도|사용|잔여) 그대로 보여주고 합계는 표의 마지막 줄(첫 칸은 표에 적힌 그대로)로 넣으세요. 한도·잔여 합계는 계산하지 마세요. 조회 안 된 달이 있으면 그 사실은 표 위 문장에 적으세요. 이 줄은 답변에 포함하지 마세요.";

// 주간(searchType=2)·월간(3) 응답 칸 — 반대쪽 칸은 SQL이 0으로 고정한다
const LIMIT_FIELDS = {
  week: { type: "2", limit: "lmtOt", used: "useOt", remain: "remOt" },
  month: { type: "3", limit: "lmtOt2", used: "useOt2", remain: "remOt2" },
};

// ─── 값 도우미 ────────────────────────────────────────────────────────────────

const toRows = (records) => (Array.isArray(records) ? records : records ? [records] : []);

/**
 * 사용 시간이 비어 있을 때의 해석(research R5). 그 기간 날짜별 내역이 0건으로 확인되면 0,
 * 내역이 있거나 내역을 모르면 null("—"). 실서버 형식 확인(T033) 뒤 유지·삭제를 정한다.
 */
function resolveUsed(used, entryCount) {
  if (used !== null) return used;
  return entryCount === 0 ? 0 : null;
}

/** 한도 응답 → 표 한 줄 값. 정확히 1행이 아니면 failed(본인 행을 가려낼 수 없다, R3) */
function toLimit(records, kind) {
  const rows = toRows(records);
  if (rows.length !== 1) return { limit: null, used: null, remain: null, failed: true };
  const f = LIMIT_FIELDS[kind];
  const row = rows[0];
  return {
    limit: toNumber(field(row, f.limit)),
    used: toNumber(field(row, f.used)),
    remain: toNumber(field(row, f.remain)),
    failed: false,
  };
}

// ─── 날짜 ────────────────────────────────────────────────────────────────────

// "20261002" → "10/2(금)". 형식이 다르면 원본.
function dayLabel(raw) {
  const s = String(raw ?? "").replace(/\D/g, "");
  if (s.length !== 8) return String(raw ?? DASH);
  const [y, m, d] = [+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)];
  return `${m}/${d}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

// ─── 계획 ────────────────────────────────────────────────────────────────────

/**
 * 질문 기간 → 조회 계획 (data-model §5).
 * @param {*} yearMonth - LLM이 넘긴 year_month(없으면 이번 달)
 * @param {Date} [now]
 */
function planOvertime(yearMonth, now = new Date()) {
  const today = seoulToday(now);
  const yearPeriod = resolveYearPeriod(yearMonth, { kind: "record", now });
  if (yearPeriod) {
    return Number(yearPeriod.year) > today.y
      ? { kind: "future", label: `${yearPeriod.year}년` }
      : { kind: "year", yearPeriod, today };
  }
  const parsed = resolveDateParam(yearMonth, "year_month");
  // 1~12월이 아닌 값("202500", "202613")은 해석 실패와 같이 이번 달로 본다(코드 리뷰 L-4)
  const validMonth = parsed && Number(parsed.slice(4, 6)) >= 1 && Number(parsed.slice(4, 6)) <= 12;
  const ym = validMonth ? parsed : ymOf(today.y, today.m);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (ym > ymOf(today.y, today.m)) return { kind: "future", label: `${y}년 ${m}월` };
  if (ym === ymOf(today.y, today.m)) return { kind: "current", y, m, day: today.d, today };
  return { kind: "month", y, m, day: lastDay(y, m), today };
}

const limitForm = (type, ymd) => ({
  searchType: type,
  searchBaseSYmd: ymd,
  cmmSearchStaffId: SELF_STAFF_ID_MARKER,
});
const personForm = (y, m, endDay) => ({
  searchBaseSYmd: dashed(y, m, 1),
  searchBaseEYmd: dashed(y, m, endDay),
  cmmSearchStaffId: SELF_STAFF_ID_MARKER,
});

// ─── 표 ──────────────────────────────────────────────────────────────────────

const limitCells = (label, l) =>
  l.failed
    ? [label, DASH, DASH, DASH] // 조회 못 한 달 — 어느 달인지는 표 위 안내 줄(specs/018 D12)
    : [label, formatHours(l.limit), formatHours(l.used), formatHours(l.remain)];

function entryTable(entries) {
  const sorted = [...entries].sort((a, b) =>
    String(field(a, "workYmd") ?? "").localeCompare(String(field(b, "workYmd") ?? ""))
  );
  // 사유는 직원이 직접 쓴 문장 — 칸 구분자(|)·줄바꿈이 있으면 표가 깨진다(코드 리뷰 M-3)
  const text = (v) => {
    const s = v == null ? "" : safeCell(v).trim();
    return s === "" ? DASH : s;
  };
  const rows = sorted.map((e) => [
    dayLabel(field(e, "workYmd")),
    text(toHHMM(field(e, "staHm"))),
    text(toHHMM(field(e, "endHm"))),
    text(field(e, "otTime")),
    text(field(e, "wktypeNm")),
    text(field(e, "reason")),
  ]);
  return mdTable(["일자", "시작", "종료", "연장시간", "근무유형", "사유"], rows);
}

// 본문 조각 + 응답 형식 줄 → 최종 tool 결과(끝에 공통 응답 지침)
function assemble(parts, guideLines) {
  return `${TITLE}${parts.join("\n\n")}\n\n${guideLines.join("\n")}${ANSWER_GUIDE}`;
}

// 날짜별 내역 조각과 그에 따른 응답 형식 줄
function entrySection(entries, { heading, noneText }) {
  if (entries === null) return { text: `> ${heading} 연장근무 내역은 조회하지 못했습니다.`, lines: [] };
  if (entries.length === 0) return { text: `> ${noneText} 연장근무 기록이 없습니다.`, lines: [NO_OT_LINE] };
  return { text: `### ${heading} 연장근무 내역\n\n${entryTable(entries)}`, lines: [] };
}

// ─── 이번 달 · 지난 달 ────────────────────────────────────────────────────────

const monthName = (plan) => (plan.y === plan.today.y ? `${plan.m}월` : `${plan.y}년 ${plan.m}월`);

// 한도 응답 오류 → 문구, 1행 아님 → 고정 실패 문구, 정상 → null
function limitProblem(results) {
  const err = results.find((r) => r.errorMessage);
  if (err) return err.errorMessage;
  return results.some((r) => toRows(r.records).length !== 1) ? SELF_CHECK_FAIL : null;
}

const entriesOf = (res) => (res.errorMessage ? null : toRows(res.records));

function withUsed(limit, entries) {
  return { ...limit, used: resolveUsed(limit.used, entries === null ? null : entries.length) };
}

// ─── 하루·주 내역 (specs/020) ─────────────────────────────────────────────────
// 한도 표는 월 계획 그대로 두고, 날짜별 내역만 date 범위로 바꾼다. 내역 SQL은 searchBaseSYmd가 속한
// 달 1일부터 주므로(두 달에 걸친 주도 한 번에) 받은 뒤 workYmd로 범위만 남긴다.
// 범위 내역 0건은 그 달 사용 0시간을 뜻하지 않으므로 R5(빈 사용 → 0)에는 쓰지 않는다.

const ymdDashed = (ymd) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const todayOf = (plan) => `${ymOf(plan.today.y, plan.today.m)}${pad(plan.today.d)}`;

function fetchEntries(plan, fetch, range) {
  if (!range) return fetch({ path: PERSON_PATH, form: personForm(plan.y, plan.m, plan.day) });
  const today = todayOf(plan);
  if (range.start > today) return Promise.resolve({ future: true });
  const shown = { start: range.start, end: range.end < today ? range.end : today };
  const form = {
    searchBaseSYmd: ymdDashed(shown.start),
    searchBaseEYmd: ymdDashed(shown.end),
    cmmSearchStaffId: SELF_STAFF_ID_MARKER,
  };
  return fetch({ path: PERSON_PATH, form }).then((res) =>
    res.errorMessage ? res : { records: toRows(res.records).filter((e) => inRange(field(e, "workYmd"), shown)) }
  );
}

// 내역 조각 — range가 있으면 그 범위 이름으로, 오늘 이후면 안내
function entryPart(person, range, names) {
  if (person.future) {
    return { text: `> ⚠️ ${range.label}${topicParticle(range.label)} 아직 지나지 않은 날입니다.`, lines: [] };
  }
  const label = range ? range.label : null;
  return entrySection(entriesOf(person), {
    heading: label ?? names.heading,
    noneText: label ?? names.noneText,
  });
}

// 범위가 이번 주(오늘이 속한 월~일) 안인가 — 아니면 "이번 주" 한도 줄을 뺀다(D13, 사용자 결정 2026-10-23)
function withinThisWeek(plan, range) {
  const t = new Date(Date.UTC(plan.today.y, plan.today.m - 1, plan.today.d));
  const mon = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  const sun = new Date(mon.getTime() + 6 * 24 * 60 * 60 * 1000);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return range.start >= ymd(mon) && range.end <= ymd(sun);
}

// 표의 사용 값 — 범위 조회면 R5 예외 없이 응답 값 그대로
const monthUsed = (limit, person, range) => (range ? limit : withUsed(limit, entriesOf(person)));

async function runCurrent(plan, fetch, range) {
  if (range && !withinThisWeek(plan, range)) return runMonth({ ...plan, monthLabel: `이번 달(${plan.m}월)` }, fetch, range);
  const ymd = dashed(plan.y, plan.m, plan.day);
  const [week, month, person] = await Promise.all([
    fetch({ path: LIMIT_PATH, form: limitForm("2", ymd) }),
    fetch({ path: LIMIT_PATH, form: limitForm("3", ymd) }),
    fetchEntries(plan, fetch, range),
  ]);
  const problem = limitProblem([week, month]);
  if (problem) return problem;

  const table = mdTable(["구분", "한도", "사용", "잔여"], [
    // 주간 줄은 R5 예외를 쓰지 않는다 — 주 범위가 지난달 말·오늘 이후를 포함할 수 있어
    // 이번 달 내역 0건이 그 주 0시간을 뜻하지 않는다(코드 리뷰 M-1)
    limitCells(`이번 주(${plan.m}/${plan.day} 기준)`, toLimit(week.records, "week")),
    limitCells(`이번 달(${plan.m}월)`, monthUsed(toLimit(month.records, "month"), person, range)),
  ]);
  const section = entryPart(person, range, { heading: `${plan.m}월`, noneText: `이번 달(${plan.m}월)` });
  return assemble([table, USED_NOTE, section.text], [limitTableLine(2), ...section.lines]);
}

async function runMonth(plan, fetch, range) {
  const [month, person] = await Promise.all([
    fetch({ path: LIMIT_PATH, form: limitForm("3", dashed(plan.y, plan.m, plan.day)) }),
    fetchEntries(plan, fetch, range),
  ]);
  const problem = limitProblem([month]);
  if (problem) return problem;

  const name = plan.monthLabel ?? monthName(plan);
  const table = mdTable(["구분", "한도", "사용", "잔여"], [
    limitCells(name, monthUsed(toLimit(month.records, "month"), person, range)),
  ]);
  const section = entryPart(person, range, { heading: name, noneText: name });
  return assemble([table, USED_NOTE, section.text], [limitTableLine(1), ...section.lines]);
}

// ─── 연 단위 ─────────────────────────────────────────────────────────────────

// 한 달 기준일 — 지난 달은 말일(그달 재직 상태 반영, R6), 이번 달은 오늘
function monthBaseYmd(ym, today) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = y === today.y && m === today.m ? today.d : lastDay(y, m);
  return dashed(y, m, d);
}

async function fetchYearMonth(fetch, ym, today) {
  const res = await fetch({ path: LIMIT_PATH, form: limitForm("3", monthBaseYmd(ym, today)) });
  if (res.errorMessage) return res;
  const rows = toRows(res.records);
  if (rows.length === 0) return { isEmpty: true };
  if (rows.length > 1) return { errorMessage: NOT_SELF_ROW };
  return { records: rows };
}

const yearMonthLabel = (ym) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;

// runMonthly 결과 → 월 순서대로 {ym, limit, empty}
function yearRows(months, merged) {
  const byYm = new Map(merged.perMonth.map(({ ym, records }) => [ym, toLimit(records, "month")]));
  const failed = new Set(merged.failedMonths.map((f) => f.ym));
  return months.map((ym) => {
    if (byYm.has(ym)) return { ym, limit: byYm.get(ym), empty: false };
    if (failed.has(ym)) return { ym, limit: { failed: true }, empty: false };
    return { ym, limit: null, empty: true };
  });
}

function yearSummaryLines(rows, merged, year) {
  const ok = rows.filter((r) => r.limit && !r.limit.failed);
  const noOt = ok.filter((r) => r.limit.used === 0).map((r) => `${Number(r.ym.slice(4))}월`);
  const allZero = merged.failedMonths.length === 0 && ok.length > 0 && noOt.length === ok.length;
  if (allZero) return { lines: [`> ${year}년 연장근무 기록이 없습니다.`], guide: [NO_OT_LINE] };
  return { lines: noOt.length ? [`> 연장근무가 없는 달: ${noOt.join(", ")}`] : [], guide: [] };
}

function renderYear(merged, period) {
  const rows = yearRows(period.months, merged);
  const usedValues = rows
    .filter((r) => r.limit && !r.limit.failed && r.limit.used !== null)
    .map((r) => r.limit.used);
  const total = usedValues.length ? usedValues.reduce((a, b) => a + b, 0) : null;
  const body = rows.map((r) =>
    r.empty ? [yearMonthLabel(r.ym), DASH, DASH, DASH] : limitCells(yearMonthLabel(r.ym), r.limit)
  );
  // 조회 못 한 달이 있으면 합계가 몇 달 기준인지 첫 칸에 — 위젯은 "합계 " 뒤 공백이 있어도 합계 줄로 본다
  const failed = merged.failedMonths.length;
  const totalLabel = failed > 0 ? `합계 (조회된 ${period.months.length - failed}개월)` : "합계";
  const table = mdTable(["월", "한도", "사용", "잔여"], [...body, [totalLabel, DASH, formatHours(total), DASH]]);
  const summary = yearSummaryLines(rows, merged, period.year);
  const out = assemble([table, [USED_NOTE, ...summary.lines].join("\n")], [YEAR_TABLE_LINE, ...summary.guide]);
  return withPeriodHeader(out, period, merged.failedMonths, { monthsNote: " (표에 —로 표시)" });
}

async function runYear(plan, fetch) {
  const period = monthlyPeriod(plan.yearPeriod);
  const merged = await runMonthly(period.months, (ym) => fetchYearMonth(fetch, ym, plan.today));
  // 첫 달이 1행이 아니면 runMonthly가 그 사유를 그대로 돌려준다 — 단월 질의와 같은 고정 문구로(코드 리뷰 L-1)
  if (merged.errorMessage) return merged.errorMessage === NOT_SELF_ROW ? SELF_CHECK_FAIL : merged.errorMessage;
  return renderYear(merged, period);
}

// ─── 진입점 ──────────────────────────────────────────────────────────────────

/**
 * @param {ReturnType<typeof planOvertime>} plan
 * @param {(req: {path: string, form: object}) => Promise<{errorMessage?: string, records?: any, isEmpty?: boolean}>} fetch
 * @param {{range?: {start: string, end: string, label: string}}} [options] - 하루·주(specs/020): 내역만 그 범위
 * @returns {Promise<string>} tool 결과 문자열
 */
async function runOvertime(plan, fetch, { range } = {}) {
  if (plan.kind === "future") return `> ⚠️ ${plan.label}은 아직 연장근무 기록이 없습니다.`;
  if (plan.kind === "year") return runYear(plan, fetch);
  if (plan.kind === "month") return runMonth(plan, fetch, range);
  return runCurrent(plan, fetch, range);
}

module.exports = {
  LIMIT_PATH,
  PERSON_PATH,
  SELF_CHECK_FAIL,
  planOvertime,
  runOvertime,
  toLimit,
  formatHours,
  resolveUsed,
};
