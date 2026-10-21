// _shared/workHours.js
// 월 근무시간 (specs/019) — 5240 홈 "월별 근무현황" 위젯과 같은 조회를 쓴다.
//
//  - /Home.do?cmd=getHomeWorkStatusBarWidgetMap, 요청 칸 cmmSearchStaffId·searchYmd(기준일)
//  - 응답 Map: workT(누적 근로, 소정+시간외) · basTime1(월간 소정) · basTime2(연장근로 가능) · remT(소정까지)
//  - 화면 계산: 막대 끝 = basTime1 + basTime2 (homeWorkStatusBarWidget.jsp) — 이 합만 같은 방식으로 한다
//  근거: kiwibox Home_SQL.xml / homeWorkStatusBarWidget.jsp (research R1)
//
// 대상 직원은 SQL이 요청한 값과 같은 직원 한 명만 고른다(R2) — 본인인지는 HR 시스템이 확인하지 않으므로
// 항상 본인 마커를 보내고 세 곳(서버·위젯·HR 페이지 브리지)이 본인 마커만 허용한다(019 보안 리뷰 참고-1). 바깥 SELECT가
// GROUP BY 없는 집계라 늘 1행이고, 본인 기록이 없으면 값이 null이다 — 값이 숫자로 읽힐 때만 쓴다(R3).
// SQL은 기준일까지만 근무 기록을 더한다 — 이번 달은 오늘, 지난 달은 말일을 보낸다(R4).
//
// 네트워크는 fetch 콜백으로 받는다(hrFetch와 같은 {errorMessage, records, isEmpty} 형식).
// 출력 계약: specs/019-hr-work-hours-gauge/contracts/tool-output-work-hours.md

const { resolveDateParam } = require("./dateResolver");
const { resolveYearPeriod } = require("./periodResolver");
const { SELF_STAFF_ID_MARKER } = require("./hrSession");
const { ANSWER_GUIDE } = require("./formatTable");
const { DASH, field, toNumber, formatHours, seoulToday, lastDay, dashed, ymOf, mdTable } = require("./monthHours");

const HOME_PATH = "/Home.do";
const HOME_CMD = "getHomeWorkStatusBarWidgetMap";

const TITLE = "## HR 근태 - 근무시간\n\n";
const HEADERS = ["구분", "누적 근로", "월간 소정", "최대 가능", "소정까지"];
const UNIT_NOTE = "> 단위는 시간이며, 누적 근로에는 연장근무 시간이 포함됩니다.";
const FAIL_NOTE = "> 근무시간을 조회하지 못했습니다.";
const ANSWER_LINE =
  "> [응답 형식] 근무시간을 물으면 누적 근로를 첫 문장에 쓰세요. 표의 값을 바꾸거나 더하고 빼지 마세요. 이 줄은 답변에 포함하지 마세요.";
const YEAR_TEXT =
  '> ⚠️ 근무시간은 월 단위로만 조회할 수 있습니다. "9월 근무시간"처럼 달을 지정해 주세요.';
const UNKNOWN_TEXT =
  '> ⚠️ 말씀하신 기간을 해석하지 못했습니다. "9월 근무시간"처럼 달을 지정해 주세요.';
const EMPTY = Object.freeze({ ok: false, worked: null, normal: null, max: null, toNormal: null });

// ─── 값 도우미 ────────────────────────────────────────────────────────────────

// remT 형식은 실서버 확인 전(R5) — 소수면 그대로, "H:MM"이면 시간으로 단위만 바꾼다
const HHMM_RE = /^(-?)(\d+):([0-5]\d)$/;
function toHours(v) {
  const n = toNumber(v);
  if (n !== null) return n;
  const m = HHMM_RE.exec(v == null ? "" : String(v).trim());
  if (!m) return null;
  // 절댓값으로 반올림한 뒤 부호를 붙인다(Math.round는 음수에서 0 쪽으로 반올림한다)
  const hours = Math.round((Number(m[2]) + Number(m[3]) / 60) * 10) / 10;
  return m[1] ? -hours : hours;
}

// ─── 계획 ────────────────────────────────────────────────────────────────────

const monthName = (y, m, today) => (y === today.y ? `${m}월` : `${y}년 ${m}월`);

/**
 * 질문 기간 → 조회 계획 (data-model §3). 해석 규칙은 연장근무(planOvertime)와 같다.
 * @param {*} yearMonth - LLM이 넘긴 year_month(없으면 이번 달)
 * @param {Date} [now]
 */
function planWorkHours(yearMonth, now = new Date()) {
  const today = seoulToday(now);
  const yearPeriod = resolveYearPeriod(yearMonth, { kind: "record", now });
  if (yearPeriod) {
    return Number(yearPeriod.year) > today.y
      ? { kind: "future", label: `${yearPeriod.year}년` }
      : { kind: "year" };
  }
  const parsed = resolveDateParam(yearMonth, "year_month");
  const validMonth = parsed && Number(parsed.slice(4, 6)) >= 1 && Number(parsed.slice(4, 6)) <= 12;
  // 기간을 말했는데 읽지 못하면 이번 달로 바꾸지 않는다 — "작년 12월"에 이번 달 값을 답하게 된다(019 코드 리뷰 M-2)
  if (!validMonth && String(yearMonth ?? "").trim() !== "") return { kind: "unknown" };
  const ym = validMonth ? parsed : ymOf(today.y, today.m);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (ym > ymOf(today.y, today.m)) return { kind: "future", label: monthName(y, m, today) };
  if (ym === ymOf(today.y, today.m)) {
    return { kind: "current", y, m, baseYmd: dashed(y, m, today.d), label: `이번 달(${m}월)` };
  }
  return { kind: "month", y, m, baseYmd: dashed(y, m, lastDay(y, m)), label: monthName(y, m, today) };
}

// ─── 응답 → 값 ───────────────────────────────────────────────────────────────

/**
 * 응답 → 근무시간 값(data-model §2). 객체 1개(또는 길이 1 배열)이고 누적·소정이 숫자일 때만 ok.
 * 원본은 변경하지 않는다.
 */
function toWorkHours(records, plan) {
  const rows = Array.isArray(records) ? records : records && typeof records === "object" ? [records] : [];
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") return { ...EMPTY };
  const row = rows[0];
  const worked = toNumber(field(row, "workT"));
  const normal = toNumber(field(row, "basTime1"));
  if (worked === null || normal === null) return { ...EMPTY };
  const extra = toNumber(field(row, "basTime2"));
  return {
    ok: true,
    worked,
    normal,
    // 연장근로 가능이 음수면 최대 가능이 소정보다 작아져 뜻이 없다 — 표시하지 않는다(019 코드 리뷰 L-2)
    max: extra === null || extra < 0 ? null : normal + extra,
    // 끝난 달의 "남은 시간"은 의미가 없다 — 이번 달만(spec D8)
    toNormal: plan.kind === "current" ? toHours(field(row, "remT")) : null,
  };
}

// ─── 조회 ────────────────────────────────────────────────────────────────────

const workHoursForm = (plan) => ({
  cmd: HOME_CMD,
  searchYmd: plan.baseYmd,
  cmmSearchStaffId: SELF_STAFF_ID_MARKER,
});

// 오류·빈 응답·예외는 모두 "받지 못함"으로 — 0으로 채우지 않는다(spec D9)
async function fetchWorkHours(plan, fetch) {
  try {
    const res = await fetch({ path: HOME_PATH, form: workHoursForm(plan) });
    if (!res || res.errorMessage || res.isEmpty) return { wh: { ...EMPTY }, errorMessage: res?.errorMessage || null };
    return { wh: toWorkHours(res.records, plan), errorMessage: null };
  } catch (_) {
    return { wh: { ...EMPTY }, errorMessage: null };
  }
}

// ─── 표 ──────────────────────────────────────────────────────────────────────

function renderBlock(plan, wh) {
  const cells = wh.ok
    ? [plan.label, formatHours(wh.worked), formatHours(wh.normal), formatHours(wh.max), formatHours(wh.toNormal)]
    : [plan.label, DASH, DASH, DASH, DASH];
  return `${mdTable(HEADERS, [cells])}\n\n${wh.ok ? UNIT_NOTE : FAIL_NOTE}`;
}

const OUT_OF_RANGE = {
  future: (plan) => `> ⚠️ ${plan.label}은 아직 지나지 않은 달이라 근무시간이 없습니다.`,
  year: () => YEAR_TEXT,
  unknown: () => UNKNOWN_TEXT,
};
const outOfRange = (plan) => (OUT_OF_RANGE[plan.kind] ? OUT_OF_RANGE[plan.kind](plan) : null);

/**
 * work_hours tool 결과(계약 §1~§4).
 * @param {ReturnType<typeof planWorkHours>} plan
 * @param {(req: {path: string, form: object}) => Promise<{errorMessage?: string, records?: any, isEmpty?: boolean}>} fetch
 * @returns {Promise<string>}
 */
async function runWorkHours(plan, fetch) {
  const skip = outOfRange(plan);
  if (skip) return skip;
  const { wh, errorMessage } = await fetchWorkHours(plan, fetch);
  // 받지 못한 이유(세션 만료 등 사용자용 안내)가 있으면 아래에 덧붙인다
  const reason = !wh.ok && errorMessage ? `\n${errorMessage}` : "";
  return `${TITLE}${renderBlock(plan, wh)}${reason}\n${ANSWER_LINE}${ANSWER_GUIDE}`;
}

/**
 * 근무현황(work_status)에 붙일 블록(계약 §5) — 표 + 안내 줄. 실패해도 예외 없이 "—" 블록.
 * 오지 않은 달·연 단위·해석 못 한 기간은 붙이지 않는다(빈 문자열).
 */
async function workHoursBlock(plan, fetch) {
  if (outOfRange(plan)) return "";
  const { wh } = await fetchWorkHours(plan, fetch);
  return renderBlock(plan, wh);
}

/** 계획의 조회 연월("YYYYMM") — 월 단위가 아니면 null */
const planYm = (plan) => (plan.kind === "current" || plan.kind === "month" ? ymOf(plan.y, plan.m) : null);

module.exports = {
  HOME_PATH,
  HOME_CMD,
  planWorkHours,
  toWorkHours,
  runWorkHours,
  workHoursBlock,
  planYm,
};
