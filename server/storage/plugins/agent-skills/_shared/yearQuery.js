/**
 * 연도 단위 질의 조회 도우미 (specs/015 data-model §4, contracts/tool-output-year.md).
 *
 *  - runMonthly: 월 고정형 endpoint(searchYm 한 달만 받는 조회)를 달마다 순차 호출
 *  - formatPeriodHeader / withPeriodHeader: 도구 결과의 "조회 기간" 머리 줄
 *  - sumHHMM: 월별 "HH:MM" 값의 연간 합계
 *
 * hrFetch를 직접 부르지 않고 fetchMonth 콜백으로 받는다 — 네트워크 없이 검증하기 위해서다.
 *
 * @module yearQuery
 */

// tool 실행 전체 상한이 없어(브리지 요청당 20초만 존재) handler가 누적 시간으로 끊는다(research R3).
// 예산은 호출 "전"에만 본다 — 실제 상한은 예산 + 마지막 1건 대기 시간이다.
const DEFAULT_BUDGET_MS = 60_000;
const TIMEOUT_REASON = "시간 초과";
// 연속 실패는 대개 같은 원인(브리지 지연 등)이라 남은 달도 실패할 가능성이 높다 — 더 기다리지 않는다.
const MAX_CONSECUTIVE_FAILURES = 2;
const STOPPED_REASON = "연속 실패로 조회 중단";
// 예외 상세(내부 메시지)는 사용자 답변 재료가 되지 않게 고정 문구로만 남긴다.
const ERROR_REASON = "조회 오류";
const HHMM = /^(\d{1,2}):([0-5]\d)$/;

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYYMM" → "YYYY-MM"
function monthLabel(ym) {
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
}

/**
 * hrFetch errorMessage("> ⚠️ 문장1. 문장2…")에서 접두를 떼고 첫 문장만 남긴다.
 * @param {string} errorMessage
 * @returns {string}
 */
function failureReason(errorMessage) {
  const text = String(errorMessage ?? "")
    .replace(/^>\s*⚠️\s*/, "")
    .trim();
  const first = text.split(/(?<=[.!?])\s+/)[0];
  return first.replace(/[.!?]+$/, "");
}

// 둘째 달부터의 예외는 실패한 달로만 남긴다. 첫 달 예외는 다시 던져 handler의 기존 catch 문구로 보낸다.
async function fetchOrFail(fetchMonth, ym, isFirst) {
  try {
    return (await fetchMonth(ym)) || {};
  } catch (e) {
    if (isFirst) throw e;
    return { failedReason: ERROR_REASON };
  }
}

/**
 * 달마다 순차 조회해 결과를 모은다.
 *  - 첫 달이 실패하면 즉시 중단하고 그 errorMessage를 그대로 반환한다(세션 만료처럼
 *    모든 달이 실패할 원인일 가능성이 높아 남은 달을 헛되이 부르지 않는다).
 *  - 둘째 달부터의 실패는 failedMonths에 남기고 계속한다. 연속 2회 실패하면 남은 달은 부르지 않는다.
 *  - 호출 전마다 누적 시간을 보고 예산을 넘었으면 남은 달을 "시간 초과"로 기록한다.
 *
 * @param {string[]} months - "YYYYMM" 오름차순
 * @param {(ym: string) => Promise<{errorMessage?: string, records?: any, isEmpty?: boolean}>} fetchMonth
 * @param {{budgetMs?: number, now?: () => number}} [opts]
 * @returns {Promise<{errorMessage: string} | {perMonth: Array<{ym: string, records: any}>, emptyMonths: string[], failedMonths: Array<{ym: string, reason: string}>}>}
 */
async function runMonthly(months, fetchMonth, { budgetMs = DEFAULT_BUDGET_MS, now = Date.now } = {}) {
  const startedAt = now();
  const perMonth = [];
  const emptyMonths = [];
  const failedMonths = [];
  let consecutiveFailures = 0;

  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    const stopReason =
      i > 0 && now() - startedAt >= budgetMs
        ? TIMEOUT_REASON
        : consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
          ? STOPPED_REASON
          : null;
    if (stopReason) {
      failedMonths.push(...months.slice(i).map((m) => ({ ym: m, reason: stopReason })));
      break;
    }

    const res = await fetchOrFail(fetchMonth, ym, i === 0);
    if (res.errorMessage && i === 0) return { errorMessage: res.errorMessage };
    const reason = res.failedReason ?? (res.errorMessage ? failureReason(res.errorMessage) : null);
    if (reason) {
      failedMonths.push({ ym, reason });
      consecutiveFailures++;
      continue;
    }
    consecutiveFailures = 0;
    if (res.isEmpty) emptyMonths.push(ym);
    else perMonth.push({ ym, records: res.records });
  }
  return { perMonth, emptyMonths, failedMonths };
}

/**
 * 월 고정형 조회는 달 단위로 받는다 — 이번 달은 오늘 이후 날짜까지 포함된다.
 * 머리 줄이 "오늘까지"라고 좁게 적지 않도록 월 단위 표기로 바꾼 사본을 만든다.
 */
function monthlyPeriod(period) {
  const first = period.months[0];
  const last = period.months[period.months.length - 1];
  const scope =
    period.months.length === 12
      ? `${period.year}년 전체`
      : `${period.year}년 ${Number(first.slice(4))}~${Number(last.slice(4))}월`;
  return { ...period, label: `${monthLabel(first)} ~ ${monthLabel(last)} (${scope}, 월 단위 조회)` };
}

function describeFailed(failedMonths) {
  const reasons = new Set(failedMonths.map((f) => f.reason));
  if (reasons.size === 1) {
    const yms = failedMonths.map((f) => monthLabel(f.ym)).join(", ");
    return `${yms} (${failedMonths[0].reason})`;
  }
  return failedMonths.map((f) => `${monthLabel(f.ym)} (${f.reason})`).join(", ");
}

/**
 * @param {{label: string}} period - resolveYearPeriod 결과
 * @param {Array<{ym: string, reason: string}>} [failedMonths]
 * @returns {string} 줄바꿈으로 끝나는 머리 줄(1~2줄)
 */
function formatPeriodHeader(period, failedMonths = [], { monthsNote = "" } = {}) {
  const lines = [`> 조회 기간: ${period.label}`];
  if (failedMonths.length > 0) {
    // 사용자에게 보이는 줄은 달 목록만 — 실패 사유(내부 오류 문구)는 모델 전용 줄로(specs/018 코드 리뷰 M-1)
    lines.push(`> 조회되지 않은 달: ${failedMonths.map((f) => monthLabel(f.ym)).join(", ")}${monthsNote}`);
    // 가드 9항(판단 근거·실패 사유 설명 금지)과 충돌하지 않게 "어느 달이 빠졌는지"만 밝히게 한다(FR-007)
    lines.push(
      "> [안내] 답변에서 위 달이 빠졌다는 것만 짧게 밝히고(사유 설명 불필요), 결과를 그해 전체인 것처럼 말하지 마세요."
    );
    lines.push(`> [내부 참조 — 답변에 쓰지 마세요] 조회되지 않은 사유: ${describeFailed(failedMonths)}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * 도구 결과에 머리 줄을 넣는다. "## 제목\n\n" 뒤(본문 앞)에 넣고, 제목이 없는
 * 안내 문구("> ⚠️ … 조회 결과가 존재하지 않습니다." 등)에는 뒤에 붙인다.
 */
function withPeriodHeader(output, period, failedMonths = [], options = {}) {
  const header = formatPeriodHeader(period, failedMonths, options);
  if (output.startsWith("## ")) {
    const bodyAt = output.indexOf("\n\n");
    if (bodyAt !== -1) {
      return `${output.slice(0, bodyAt + 2)}${header}\n${output.slice(bodyAt + 2)}`;
    }
    return `${output}\n\n${header}`;
  }
  return `${output}\n${header}`;
}

/**
 * 모든 값이 "H:MM"/"HH:MM"이면 분 단위로 더해 "HH:MM"을, 하나라도 다르면 null을 반환한다.
 * (근태 OT 합계 칸의 실제 형식이 확인되지 않았다 — research R9. 추측해 더하지 않는다.)
 * @param {Array<*>} values
 * @returns {string|null}
 */
function sumHHMM(values) {
  let total = 0;
  for (const v of values) {
    const m = HHMM.exec(String(v ?? "").trim());
    if (!m) return null;
    total += Number(m[1]) * 60 + Number(m[2]);
  }
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * 렌더 결과 끝의 응답 지침(ANSWER_GUIDE) 바로 앞에 한 줄을 넣는다. 지침이 없으면 끝에 붙인다.
 * 표 아래 보조 줄("그 외 N일…", "연간 합계…")이 지침 뒤로 밀려나지 않게 한다.
 */
function appendBeforeAnswerGuide(md, line) {
  const { ANSWER_GUIDE } = require("./formatTable");
  if (md.endsWith(ANSWER_GUIDE)) {
    return `${md.slice(0, -ANSWER_GUIDE.length)}\n${line}${ANSWER_GUIDE}`;
  }
  return `${md}\n${line}`;
}

/**
 * 월별 합계 표 (contracts/tool-output-year.md §3). 성공한 달과 빈 달(—)을 월 순으로 놓고,
 * 표 아래에 합계 줄을 붙인다. 실패한 달은 표에서 빠지며 합계 문구가 "조회된 달 합계"가 된다.
 *
 * @param {{perMonth: Array<{ym: string, records: any}>, emptyMonths: string[], failedMonths: Array}} merged
 * @param {(records: any) => string|null} valueOf - 한 달 응답 → 합계 칸 값(없으면 null)
 * @param {string} valueLabel - 값 칸 머리글
 * @param {string} [noValueLine] - 값이 하나도 없을 때 쓸 줄. 호출부가 "빈 값 = 기록 없음"을
 *   확인한 경우에만 넘긴다. 없으면 "계산하지 않았습니다"(형식 미확인 필드의 조용한 0 방지).
 * @returns {string} 표 + 합계 줄 + 응답 지침
 */
function renderMonthlySum(merged, valueOf, valueLabel, noValueLine) {
  const { renderTable } = require("./formatTable");
  const rows = [
    ...merged.perMonth.map(({ ym, records }) => ({ ym, value: valueOf(records) })),
    ...merged.emptyMonths.map((ym) => ({ ym, value: null })),
  ].sort((a, b) => a.ym.localeCompare(b.ym));

  const table = renderTable(
    rows.map((r) => ({ 월: monthLabel(r.ym), [valueLabel]: r.value ?? "—" }))
  );
  const values = rows.filter((r) => r.value != null).map((r) => r.value);
  const total = sumHHMM(values);
  const scope = merged.failedMonths.length > 0 ? "조회된 달 합계" : "연간 합계";
  const withTotal = appendBeforeAnswerGuide(
    table,
    totalLine({ values, total, scope, months: rows.length, noValueLine })
  );
  // 값 있는 달이 여러 개면 목록 대신 월별 표로, 합계는 표 마지막 줄로 보이게 한다(사용자 결정 2026-10-16).
  // 첫 칸을 정확히 '합계'로 해야 위젯(okrservice MarkdownTable isTotalRow)이 합계 줄로 강조한다.
  // 값이 없거나 한 달뿐이면 한 줄 답이 낫다 — 지시를 붙이지 않는다.
  return values.length >= 2 ? appendBeforeAnswerGuide(withTotal, MONTHLY_TABLE_LINE) : withTotal;
}

const MONTHLY_TABLE_LINE =
  "> [응답 형식] 월별 값을 목록이 아니라 위 표(월 | 값 2열) 그대로 표로 보여주고, 합계는 표 아래 문장이 아니라 표의 마지막 줄로 넣으세요(첫 칸은 정확히 '합계' — 조회 안 된 달이 있으면 그 사실은 표 위 문장에 적으세요). 이 줄은 답변에 포함하지 마세요.";

// 값이 하나도 없으면 "00:00"이라 적지 않는다 — 형식 미확인 필드의 "조용한 0" 방지(코드 리뷰 M-3)
function totalLine({ values, total, scope, months, noValueLine }) {
  if (values.length === 0) {
    return noValueLine ?? "> 월별 합계 값이 없어 연간 합계를 계산하지 않았습니다.";
  }
  if (total === null) return "> 월별 값의 형식이 달라 연간 합계를 계산하지 않았습니다.";
  return `> ${scope} **${total}** (조회된 ${months}개월)`;
}

module.exports = {
  MONTHLY_TABLE_LINE,
  runMonthly,
  monthlyPeriod,
  formatPeriodHeader,
  withPeriodHeader,
  appendBeforeAnswerGuide,
  renderMonthlySum,
  sumHHMM,
  failureReason,
  monthLabel,
  TIMEOUT_REASON,
  STOPPED_REASON,
  ERROR_REASON,
};
