// HR 표 직접 출력 (specs/018) — HR tool 결과의 표를 모델이 다시 쓰지 않고 시스템이 그대로 붙인다.
//
// 모델은 표를 받아 답변을 새로 쓰면서 표를 목록으로 바꾸고, 빈 칸("—")을 옆 칸 값으로 채우고,
// 날짜를 고쳐 썼다(017 E2E). 지시 문구로는 막지 못해 표는 시스템이 붙이고 모델은 1~2문장만 쓴다.
//
// 이 모듈은 순수 함수만 둔다 — tool 루프(utils/chats/toolCalling/loop.js)가 호출한다.
// 계약: specs/018-hr-table-passthrough/contracts/final-answer.md
//
// 추출 규칙은 handler 출력 관례에 기댄다: 모델용 지시는 "> ["로 시작하는 줄이나 끝의 공통
// 응답 지침(--- + [응답 지침])으로만 붙는다(016·017). 새 handler도 이 관례를 지켜야 한다.

const { isHrTool, REFUSAL_TOOL_NAME, UNSUPPORTED_TOOL_NAME, skillIdOf } = require("./hrSelfDataNotice");

const TABLE_NOTICE =
  "[표 표시] 질문에 답하려면 조회가 더 필요하면 먼저 그 조회를 하세요. 답변에는 위 표를 시스템이 끝에 그대로 붙입니다. 표나 목록으로 값을 다시 쓰지 말고 질문에 맞는 요점만 1~2문장으로 쓰세요. 특정 값을 물으면 첫 문장에 그 값을 쓰세요. 수치는 표에 있는 값만, 반올림하거나 바꾸지 말고 표에 적힌 그대로 쓰세요(53.14를 53으로 쓰지 않기). 이 줄은 답변에 포함하지 마세요.";

const ANSWER_GUIDE_START = "\n---\n[응답 지침]";
const PSEUDO_TOOLS = new Set([REFUSAL_TOOL_NAME, UNSUPPORTED_TOOL_NAME]);
// 모델용 다음 조회 안내(파라미터 이름) — 사용자에게 보이면 내부값 노출(016)
const PARAM_NAME_RE = /\b(query_type|pay_item|org_cd|cal_yy|year_month)\b/;
const TABLE_LINE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:|-]+\|\s*$/;

const isTableLine = (line) => TABLE_LINE_RE.test(line);

function hasTable(lines) {
  return lines.some((line, i) => isTableLine(line) && SEPARATOR_RE.test(lines[i + 1] ?? ""));
}

// 사용자에게 보이면 안 되는 줄(모델용 제목·지시·내부 참조·파라미터 안내)
function isModelOnlyLine(line) {
  if (/^## /.test(line)) return true;
  if (/^\s*>\s*\[/.test(line)) return true;
  if (line.includes("답변에 포함하지 마세요")) return true;
  return !isTableLine(line) && PARAM_NAME_RE.test(line);
}

// 연속 빈 줄을 하나로, 앞뒤 빈 줄 제거 — 줄 안의 글자는 건드리지 않는다
function tidyBlankLines(lines) {
  const out = lines.reduce((acc, line) => {
    const blank = line.trim() === "";
    if (blank && (acc.length === 0 || acc[acc.length - 1].trim() === "")) return acc;
    return [...acc, blank ? "" : line];
  }, []);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * HR tool 결과에서 사용자에게 그대로 보일 표 블록을 뽑는다(contracts §1).
 * @param {string} toolName
 * @param {*} resultText - withSelfDataNotice를 붙이기 전의 원 결과
 * @returns {string|null} 블록, 표가 없거나 대상이 아니면 null
 */
function extractTableBlock(toolName, resultText) {
  if (typeof resultText !== "string" || !isHrTool(toolName)) return null;
  if (PSEUDO_TOOLS.has(skillIdOf(toolName))) return null;
  const guideAt = resultText.indexOf(ANSWER_GUIDE_START);
  const body = guideAt === -1 ? resultText : resultText.slice(0, guideAt);
  const kept = tidyBlankLines(body.split("\n").filter((line) => !isModelOnlyLine(line)));
  // 2차 방어(fail-closed): 표 줄에 파라미터 이름이 보이면 내부값 열이 섞인 표 — 통째로 붙이지 않는다
  if (kept.some((line) => isTableLine(line) && PARAM_NAME_RE.test(line))) return null;
  return hasTable(kept) ? kept.join("\n") : null;
}

/**
 * 모델에 넘길 tool 결과(contracts §2). 블록이 있으면 "[응답 형식]" 줄을 지우고 [표 표시] 줄을 붙인다.
 * @param {string} resultText
 * @param {boolean} hasBlock
 */
function toModelResult(resultText, hasBlock) {
  if (!hasBlock || typeof resultText !== "string") return resultText;
  // 공통 응답 지침("관련 행만 추려 표로")도 [표 표시]와 부딪혀 뺀다(018 코드 리뷰 M-5)
  const guideAt = resultText.indexOf(ANSWER_GUIDE_START);
  const body = guideAt === -1 ? resultText : resultText.slice(0, guideAt);
  const lines = body.split("\n").filter((line) => !/^\s*>\s*\[응답 형식\]/.test(line));
  return `${lines.join("\n").trimEnd()}\n\n${TABLE_NOTICE}`;
}

// 수치 — 시간·일·원·건·분·%, 시각, 날짜(M/D), 천 단위, 소수
const VALUE_RE = /\d+(\.\d+)?\s*(시간|h|일|원|건|분|%)|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|\d{1,3}(,\d{3})+|\d+\.\d+/;
const VALUE_RE_G = new RegExp(VALUE_RE.source, "g");
// 번호 목록은 1~2자리만("2026. 6. 19." 같은 날짜 문장을 목록으로 보지 않게 — 코드 리뷰 M-3)
const LIST_MARKER_RE = /^\s*([-*•]|\d{1,2}\.)\s+/;
// "라벨: 값" — 시각(09:02)의 콜론은 제외
const LABEL_COLON_RE = /[가-힣A-Za-z)\]*]\s*:\s/;

// 표 값을 다시 늘어놓은 줄 — 표·제목, 수치가 든 목록 줄, "라벨: 값"에 수치가 2개 이상인 줄(코드 리뷰 M-2)
function isRepeatedValueLine(line) {
  if (isTableLine(line) || /^\s*#/.test(line)) return true;
  const m = LIST_MARKER_RE.exec(line);
  if (m) {
    const rest = line.slice(m[0].length);
    return VALUE_RE.test(rest) || (LABEL_COLON_RE.test(rest) && /\d/.test(rest)); // "- 사용: 10"
  }
  return LABEL_COLON_RE.test(line) && (line.match(VALUE_RE_G) || []).length >= 2;
}

/**
 * 모델 문장에서 표·제목·수치 목록 줄을 지운다(contracts §3, D10).
 * @param {*} text
 * @returns {string}
 */
function sanitizeModelText(text) {
  if (typeof text !== "string") return "";
  return tidyBlankLines(text.split("\n").filter((line) => !isRepeatedValueLine(line)))
    .join("\n")
    .trim();
}

// 모델 문장의 "N시간"·"N일" — 날짜("10월 15일")는 수치로 보지 않는다
const UNIT_NUMBER_RE = /(?<![\d.])(\d+(?:\.\d+)?)\s*(시간|일)/g;
const DATE_DAY_RE = /\d{1,2}\s*월\s*$/;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

/** 글에 나온 숫자 값들(Number) */
function numbersIn(text) {
  return (String(text ?? "").replace(/,/g, "").match(NUMBER_RE) || []).map(Number);
}

/** 사용자 메시지에 나온 숫자 — "3일 쉬고 싶은데"의 3처럼 모델이 되받아 써도 되는 값 */
function userNumbers(messages) {
  const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text ?? "").join(" ") : "");
  return numbersIn((messages || []).filter((m) => m?.role === "user").map((m) => textOf(m.content)).join("\n"));
}

/**
 * 표·질문에 없는 "N시간"·"N일" 수치가 든 줄을 뺀다(2026-10-21) — 모델이 표의 53.14를 "53시간"으로
 * 반올림하거나 합계를 계산해 쓴 사례. 표가 없으면 그대로.
 * @param {string} text - sanitizeModelText 결과
 * @param {string[]} blocks - 붙일 표 블록
 * @param {number[]} [extra] - 질문에 나온 숫자
 */
function dropUnsupportedNumbers(text, blocks, extra = []) {
  if (typeof text !== "string" || !blocks || blocks.length === 0) return text;
  const known = new Set([...numbersIn(blocks.join("\n")), ...extra]);
  const supported = (line) =>
    [...line.matchAll(UNIT_NUMBER_RE)].every((m) => {
      if (m[2] === "일" && DATE_DAY_RE.test(line.slice(0, m.index))) return true;
      return known.has(Number(m[1]));
    });
  return tidyBlankLines(text.split("\n").filter(supported)).join("\n").trim();
}

/**
 * 최종 답변(contracts §4) — 모델 문장 + 표 블록(순서 유지, 같은 블록은 한 번).
 * @param {string} text - sanitizeModelText 결과
 * @param {string[]} blocks
 */
function joinFinalAnswer(text, blocks) {
  const unique = blocks.filter((b, i) => blocks.findIndex((x) => x.trim() === b.trim()) === i);
  return [text, ...unique].filter((part) => part && part.trim() !== "").join("\n\n");
}

// 준비 단계 조회 — 다음 조회의 코드를 얻으려는 조회라 다른 표가 있으면 붙이지 않는다
const PREP_LOOKUPS = new Set(["hr-salary:pay_periods", "hr-personnel:org_tree"]);

function queryTypeOf(args) {
  if (args && typeof args === "object") return args.query_type;
  try {
    return JSON.parse(String(args ?? "{}"))?.query_type;
  } catch (_) {
    return undefined;
  }
}

/** @returns {boolean} 지급 건 목록·조직 코드 찾기처럼 다음 조회를 위한 준비 단계인가 */
function isPrepLookup(toolName, args) {
  return PREP_LOOKUPS.has(`${skillIdOf(toolName)}:${queryTypeOf(args)}`);
}

// 모델이 다른 직원 질문이라며 거절한 문장 — 이때 붙은 본인 표는 그 사람 것처럼 보인다(보안 리뷰 H2)
const REFUSAL_TEXT_RE = /다른 직원[^.\n]{0,15}(조회할 수 없|제공하지 않|제공할 수 없|알려드릴 수 없|안내해 드릴 수 없)/;
const isRefusalText = (text) => typeof text === "string" && REFUSAL_TEXT_RE.test(text);

/**
 * 붙일 표 — 조회 순서대로(D6). 준비 단계 표는 본 조회를 시도했으면(결과에 표가 없어도) 뺀다 —
 * "명세가 조회되지 않았어요" 아래 지급 건 목록이 붙던 문제(018 최종 E2E). 준비 단계만 했으면 그대로.
 * @param {{text: string, prep: boolean}[]} entries
 * @param {boolean} [mainAttempted] - 준비 단계가 아닌 HR 조회를 한 번이라도 했는가
 */
function selectBlocks(entries, mainAttempted = false) {
  const main = entries.filter((e) => !e.prep);
  if (main.length > 0 || mainAttempted) return main.map((e) => e.text);
  return entries.map((e) => e.text);
}

module.exports = {
  TABLE_NOTICE,
  isPrepLookup,
  isRefusalText,
  selectBlocks,
  extractTableBlock,
  toModelResult,
  sanitizeModelText,
  dropUnsupportedNumbers,
  userNumbers,
  joinFinalAnswer,
};
